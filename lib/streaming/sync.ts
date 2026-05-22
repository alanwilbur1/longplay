import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getProvider, type SourceId } from './index'
import type { SyncResult } from './types'

/**
 * lib/streaming/sync.ts — Phase 4.3 ingestion orchestrator.
 *
 * Server-only. Uses the SERVICE-ROLE client because it must read OAuth
 * tokens (which RLS hides from the listener's own session) and write
 * rows to tables the listener has no INSERT grant on (listening_events,
 * favorite_*, listening_connections token columns, listening_profile_snapshots).
 *
 * Idempotent:
 *   - favorite_* upsert on (user_id, source_id, external_*_id)
 *   - listening_events upsert on (user_id, source_id, external_track_id, played_at)
 *     (UNIQUE added in migration 0009_listening_sync.sql)
 *   - listening_profile_snapshots upsert on user_id (PK)
 *
 * Token refresh:
 *   - Refreshes when token_expires_at is in the past or within 60 seconds.
 *   - Persists new access_token / refresh_token / token_expires_at /
 *     scopes before calling sync().
 *   - On refresh failure, marks the connection status='reauth_required'
 *     with last_error, and returns { ok: false }.
 */

export interface SyncOutcome {
  ok: boolean
  counts: {
    events_upserted: number
    artists_upserted: number
    albums_upserted: number
    tracks_upserted: number
  }
  refreshed: boolean
  last_sync_at: string | null
  error: { stage: string; message: string } | null
}

const REFRESH_BUFFER_MS = 60_000 // refresh if expiry within 60s

function emptyOutcome(): SyncOutcome {
  return {
    ok: false,
    counts: {
      events_upserted: 0,
      artists_upserted: 0,
      albums_upserted: 0,
      tracks_upserted: 0,
    },
    refreshed: false,
    last_sync_at: null,
    error: null,
  }
}

/**
 * Sync one provider for one user. Idempotent — safe to retry.
 */
export async function syncProviderForUser(
  userId: string,
  sourceId: SourceId,
): Promise<SyncOutcome> {
  const outcome = emptyOutcome()
  const admin = getSupabaseAdminClient()

  // 1. Fetch the connection (admin client bypasses RLS so we can read
  // the encrypted token columns).
  const { data: conn, error: connError } = await admin
    .from('listening_connections')
    .select(
      'id, user_id, source_id, status, scopes, access_token_encrypted, refresh_token_encrypted, token_expires_at, last_sync_at',
    )
    .eq('user_id', userId)
    .eq('source_id', sourceId)
    .maybeSingle()

  if (connError || !conn) {
    outcome.error = {
      stage: 'load-connection',
      message: connError?.message ?? 'no connection row',
    }
    return outcome
  }
  const connectionRow = conn as unknown as {
    id: string
    status: string
    scopes: string[] | null
    access_token_encrypted: string | null
    refresh_token_encrypted: string | null
    token_expires_at: string | null
    last_sync_at: string | null
  }

  if (connectionRow.status !== 'active') {
    outcome.error = {
      stage: 'connection-status',
      message: `status=${connectionRow.status} — not syncing`,
    }
    return outcome
  }

  // 2. Refresh tokens if expired or near-expiry.
  const provider = getProvider(sourceId)
  let accessToken = connectionRow.access_token_encrypted ?? ''
  const expiresAtMs = connectionRow.token_expires_at
    ? new Date(connectionRow.token_expires_at).getTime()
    : 0
  const nearExpiry = !expiresAtMs || expiresAtMs - Date.now() < REFRESH_BUFFER_MS

  if (nearExpiry) {
    if (!connectionRow.refresh_token_encrypted) {
      outcome.error = {
        stage: 'refresh',
        message: 'no refresh_token; reauth required',
      }
      await admin
        .from('listening_connections')
        .update({
          status: 'reauth_required',
          last_error: outcome.error.message,
        })
        .eq('id', connectionRow.id)
      return outcome
    }

    try {
      const refreshed = await provider.refreshTokens({
        refreshToken: connectionRow.refresh_token_encrypted,
      })
      accessToken = refreshed.access_token
      outcome.refreshed = true

      // Persist new tokens. Spotify often omits a new refresh_token —
      // keep the old one in that case.
      const tokenUpdate: Record<string, unknown> = {
        access_token_encrypted: refreshed.access_token,
        token_expires_at: refreshed.expires_at,
      }
      if (refreshed.refresh_token) {
        tokenUpdate.refresh_token_encrypted = refreshed.refresh_token
      }
      if (refreshed.scopes.length > 0) {
        tokenUpdate.scopes = refreshed.scopes
      }
      const { error: tokenWriteError } = await admin
        .from('listening_connections')
        .update(tokenUpdate)
        .eq('id', connectionRow.id)
      if (tokenWriteError) {
        outcome.error = {
          stage: 'refresh-persist',
          message: tokenWriteError.message,
        }
        return outcome
      }
    } catch (err) {
      outcome.error = {
        stage: 'refresh',
        message: err instanceof Error ? err.message : String(err),
      }
      await admin
        .from('listening_connections')
        .update({
          status: 'reauth_required',
          last_error: outcome.error.message,
        })
        .eq('id', connectionRow.id)
      return outcome
    }
  }

  // 3. Call provider sync.
  let result: SyncResult
  try {
    result = await provider.sync({ accessToken })
  } catch (err) {
    outcome.error = {
      stage: 'sync',
      message: err instanceof Error ? err.message : String(err),
    }
    await admin
      .from('listening_connections')
      .update({ status: 'error', last_error: outcome.error.message })
      .eq('id', connectionRow.id)
    return outcome
  }

  // 4. Upsert favorites.
  if (result.artists.length > 0) {
    const rows = result.artists.map((a) => ({
      user_id: userId,
      source_id: sourceId,
      external_artist_id: a.external_artist_id,
      name: a.name,
      rank: a.rank,
      genres: a.genres,
      raw: a.raw,
      observed_at: result.syncedAt,
    }))
    const { error, count } = await admin
      .from('favorite_artists')
      .upsert(rows, {
        onConflict: 'user_id,source_id,external_artist_id',
        count: 'exact',
      })
    if (error) {
      outcome.error = { stage: 'favorite_artists-upsert', message: error.message }
    } else {
      outcome.counts.artists_upserted = count ?? rows.length
    }
  }

  if (result.albums.length > 0) {
    const rows = result.albums.map((a) => ({
      user_id: userId,
      source_id: sourceId,
      external_album_id: a.external_album_id,
      title: a.title,
      artist: a.artist,
      rank: a.rank,
      raw: a.raw,
      observed_at: result.syncedAt,
    }))
    const { error, count } = await admin
      .from('favorite_albums')
      .upsert(rows, {
        onConflict: 'user_id,source_id,external_album_id',
        count: 'exact',
      })
    if (error) {
      outcome.error = outcome.error ?? {
        stage: 'favorite_albums-upsert',
        message: error.message,
      }
    } else {
      outcome.counts.albums_upserted = count ?? rows.length
    }
  }

  if (result.tracks.length > 0) {
    const rows = result.tracks.map((t) => ({
      user_id: userId,
      source_id: sourceId,
      external_track_id: t.external_track_id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      isrc: t.isrc,
      rank: t.rank,
      raw: t.raw,
      observed_at: result.syncedAt,
    }))
    const { error, count } = await admin
      .from('favorite_tracks')
      .upsert(rows, {
        onConflict: 'user_id,source_id,external_track_id',
        count: 'exact',
      })
    if (error) {
      outcome.error = outcome.error ?? {
        stage: 'favorite_tracks-upsert',
        message: error.message,
      }
    } else {
      outcome.counts.tracks_upserted = count ?? rows.length
    }
  }

  // 5. Upsert listening_events. Skip events without a track id or
  // played_at (they can't be deduped).
  const eventRows = result.events
    .filter((e) => e.external_track_id && e.played_at)
    .map((e) => ({
      user_id: userId,
      source_id: sourceId,
      external_track_id: e.external_track_id,
      track_title: e.track_title,
      artist_name: e.artist_name,
      album_name: e.album_name,
      album_external_id: e.album_external_id,
      isrc: e.isrc,
      played_at: e.played_at,
      duration_ms: e.duration_ms,
      context_type: e.context_type,
      raw: e.raw,
    }))
  if (eventRows.length > 0) {
    const { error, count } = await admin
      .from('listening_events')
      .upsert(eventRows, {
        onConflict: 'user_id,source_id,external_track_id,played_at',
        count: 'exact',
        ignoreDuplicates: false,
      })
    if (error) {
      outcome.error = outcome.error ?? {
        stage: 'listening_events-upsert',
        message: error.message,
      }
    } else {
      outcome.counts.events_upserted = count ?? eventRows.length
    }
  }

  // 6. Update connection last_sync_at + clear last_error (if anything
  // upstream succeeded).
  const succeeded = outcome.error === null
  const now = new Date().toISOString()
  await admin
    .from('listening_connections')
    .update({
      last_sync_at: now,
      status: succeeded ? 'active' : 'error',
      last_error: succeeded ? null : outcome.error?.message,
    })
    .eq('id', connectionRow.id)

  outcome.last_sync_at = succeeded ? now : connectionRow.last_sync_at
  outcome.ok = succeeded

  // 7. Re-compute the listening profile snapshot. Best-effort — a
  // snapshot failure does not fail the sync itself.
  try {
    await recomputeListeningProfileSnapshot(userId)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[sync] snapshot recompute failed', {
        userId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return outcome
}

/**
 * Recompute the per-user listening_profile_snapshot from current
 * favorite_* and recent listening_events. Service-role write.
 *
 * Lightweight heuristic — no AI, no ML.
 */
export async function recomputeListeningProfileSnapshot(userId: string): Promise<void> {
  const admin = getSupabaseAdminClient()

  // Top artists for genre distribution.
  const { data: artists } = await admin
    .from('favorite_artists')
    .select('external_artist_id, genres, rank')
    .eq('user_id', userId)
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(50)
  type FA = { external_artist_id: string; genres: string[] | null; rank: number | null }
  const aRows = (artists ?? []) as unknown as FA[]

  // Genre tally (weighted slightly by rank — earlier ranks count more).
  const genreScore = new Map<string, number>()
  for (const a of aRows) {
    const weight = a.rank ? 1 / Math.log2(a.rank + 2) : 0.5
    for (const g of a.genres ?? []) {
      const key = g.toLowerCase()
      genreScore.set(key, (genreScore.get(key) ?? 0) + weight)
    }
  }
  const top_genres = Array.from(genreScore.entries())
    .sort((x, y) => y[1] - x[1])
    .slice(0, 12)
    .map(([g]) => g)

  const top_artist_ids = aRows.slice(0, 20).map((a) => a.external_artist_id)

  // Top tracks.
  const { data: tracks } = await admin
    .from('favorite_tracks')
    .select('external_track_id, rank')
    .eq('user_id', userId)
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(20)
  const top_track_ids = (
    (tracks ?? []) as unknown as Array<{ external_track_id: string }>
  ).map((t) => t.external_track_id)

  // Saved albums count (head: true → just count).
  const { count: saved_album_count } = await admin
    .from('favorite_albums')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  // Recent listening density (30 days).
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { count: recent_event_count } = await admin
    .from('listening_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('played_at', thirtyDaysAgo)
  const eventCount = recent_event_count ?? 0
  const recent_density =
    eventCount === 0 ? null : eventCount < 25 ? 'low' : eventCount < 100 ? 'medium' : 'high'

  // Initial affinity tags derived from top genres. Same vocabulary as
  // the recommender's mood tags so they overlap cleanly.
  const affinity_tags = affinityTagsFromGenres(top_genres)

  const { error } = await admin.from('listening_profile_snapshots').upsert(
    {
      user_id: userId,
      top_genres,
      top_artist_ids,
      top_track_ids,
      saved_album_count: saved_album_count ?? 0,
      recent_event_count: eventCount,
      affinity_tags,
      recent_density,
      signals: {
        artists_observed: aRows.length,
        genre_diversity: genreScore.size,
      },
      computed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error && process.env.NODE_ENV !== 'production') {
    console.warn('[sync] snapshot upsert failed', { code: error.code, message: error.message })
  }
}

/**
 * Map top genres → recommender-compatible affinity tags.
 * Same vocabulary as lib/recommendations/scorer.ts CALIBRATION_OPTION_TAGS.
 */
function affinityTagsFromGenres(genres: string[]): string[] {
  const out = new Set<string>()
  const has = (...needles: string[]) =>
    genres.some((g) => needles.some((n) => g.includes(n)))
  if (has('ambient', 'drone')) out.add('ambient')
  if (has('jazz', 'spiritual')) out.add('spiritual')
  if (has('classical', 'modern classical', 'orchestral')) out.add('expansive')
  if (has('post-rock', 'shoegaze')) out.add('cinematic')
  if (has('electronic', 'idm', 'techno')) out.add('electronic')
  if (has('folk', 'singer-songwriter', 'songwriter', 'indie folk')) out.add('confessional')
  if (has('indie', 'indie rock', 'indie pop')) out.add('indie')
  if (has('soul', 'r&b', 'jazz')) out.add('warm')
  if (has('experimental', 'avant-garde', 'noise')) out.add('experimental')
  if (has('lo-fi', 'bedroom')) out.add('intimate')
  return Array.from(out)
}
