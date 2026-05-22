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
    /** Of the upserted artists, how many came back with non-empty
     *  Spotify-side metadata (genres OR popularity OR image). */
    artists_hydrated: number
    /** Distinct genre strings across all upserted artists (post-
     *  normalization). */
    genres_distinct: number
    /** Phase 4.4 hydration observability — direct from the provider's
     *  /v1/artists?ids= calls, BEFORE the upsert. Lets the UI distinguish
     *  "Spotify returned no genres" from "we never called the endpoint"
     *  from "we called it and got 401". */
    artist_ids_collected: number
    artist_ids_hydrated: number
    artists_with_genres: number
    hydration_batches_attempted: number
    hydration_batches_succeeded: number
  }
  refreshed: boolean
  last_sync_at: string | null
  snapshot_updated: boolean
  top_genres_count: number
  /** Null on full success. On hydration failure, a short safe string
   *  like "401: The access token expired". Never contains tokens. */
  hydration_error: string | null
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
      artists_hydrated: 0,
      genres_distinct: 0,
      artist_ids_collected: 0,
      artist_ids_hydrated: 0,
      artists_with_genres: 0,
      hydration_batches_attempted: 0,
      hydration_batches_succeeded: 0,
    },
    refreshed: false,
    last_sync_at: null,
    snapshot_updated: false,
    top_genres_count: 0,
    hydration_error: null,
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

  // Pull provider telemetry out of result.meta so the UI sees
  // hydration health BEFORE/REGARDLESS of upsert success.
  if (result.meta) {
    outcome.counts.artist_ids_collected = result.meta.artist_ids_collected ?? 0
    outcome.counts.artist_ids_hydrated = result.meta.artist_ids_hydrated ?? 0
    outcome.counts.artists_with_genres = result.meta.artists_with_genres ?? 0
    outcome.counts.hydration_batches_attempted =
      result.meta.hydration_batches_attempted ?? 0
    outcome.counts.hydration_batches_succeeded =
      result.meta.hydration_batches_succeeded ?? 0
    outcome.hydration_error = result.meta.hydration_error ?? null
  }

  // 4. Upsert favorites.
  if (result.artists.length > 0) {
    const distinctGenres = new Set<string>()
    let hydrated = 0
    const rows = result.artists.map((a) => {
      const normGenres = normalizeGenres(a.genres)
      for (const g of normGenres) distinctGenres.add(g)
      const isHydrated =
        normGenres.length > 0 ||
        (a.popularity ?? null) !== null ||
        !!a.image_url
      if (isHydrated) hydrated += 1
      return {
        user_id: userId,
        source_id: sourceId,
        external_artist_id: a.external_artist_id,
        name: a.name,
        rank: a.rank,
        genres: normGenres,
        popularity: a.popularity ?? null,
        followers: a.followers ?? null,
        image_url: a.image_url ?? null,
        raw: a.raw,
        observed_at: result.syncedAt,
      }
    })
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
      outcome.counts.artists_hydrated = hydrated
      outcome.counts.genres_distinct = distinctGenres.size
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
    const snap = await recomputeListeningProfileSnapshot(userId)
    outcome.snapshot_updated = true
    outcome.top_genres_count = snap.top_genres_count
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

export interface SnapshotRecomputeResult {
  top_genres_count: number
  affinity_tags_count: number
  artists_observed: number
}

/**
 * Recompute the per-user listening_profile_snapshot from current
 * favorite_* and recent listening_events. Service-role write.
 *
 * Lightweight, deterministic heuristic — no AI, no ML.
 *
 *  - top_genres: aggregated from favorite_artists.genres across the
 *    user's top-200 favorite_artists (top-50 ranked + unranked
 *    co-artists discovered via tracks/albums/events), weighted by
 *    rank when present. Normalized + deduped.
 *  - affinity_tags: derived deterministically from top_genres + a
 *    handful of non-genre signals (saved_album_count, recent_density,
 *    genre diversity). No fake values.
 */
export async function recomputeListeningProfileSnapshot(
  userId: string,
): Promise<SnapshotRecomputeResult> {
  const admin = getSupabaseAdminClient()

  // Pull a generous window of artists — ranked first, then unranked
  // co-artists. Both contribute to genre signal, but ranked artists
  // weigh more heavily.
  const { data: artists } = await admin
    .from('favorite_artists')
    .select('external_artist_id, genres, rank')
    .eq('user_id', userId)
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(200)
  type FA = { external_artist_id: string; genres: string[] | null; rank: number | null }
  const aRows = (artists ?? []) as unknown as FA[]

  // Weighted genre tally. Earlier ranks count more (Lanczos-ish
  // 1/log2(rank+2) curve). Unranked artists contribute a flat 0.3.
  const genreScore = new Map<string, number>()
  for (const a of aRows) {
    const weight = a.rank ? 1 / Math.log2(a.rank + 2) : 0.3
    for (const g of normalizeGenres(a.genres ?? [])) {
      genreScore.set(g, (genreScore.get(g) ?? 0) + weight)
    }
  }
  const top_genres = Array.from(genreScore.entries())
    .sort((x, y) => y[1] - x[1])
    .slice(0, 15)
    .map(([g]) => g)

  const top_artist_ids = aRows
    .filter((a) => a.rank !== null)
    .slice(0, 20)
    .map((a) => a.external_artist_id)

  const { data: tracks } = await admin
    .from('favorite_tracks')
    .select('external_track_id, rank')
    .eq('user_id', userId)
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(20)
  const top_track_ids = (
    (tracks ?? []) as unknown as Array<{ external_track_id: string }>
  ).map((t) => t.external_track_id)

  const { count: saved_album_count } = await admin
    .from('favorite_albums')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { count: recent_event_count } = await admin
    .from('listening_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('played_at', thirtyDaysAgo)
  const eventCount = recent_event_count ?? 0
  const recent_density: 'low' | 'medium' | 'high' | null =
    eventCount === 0 ? null : eventCount < 25 ? 'low' : eventCount < 100 ? 'medium' : 'high'

  const albumsCount = saved_album_count ?? 0
  const affinity_tags = computeAffinityTags({
    top_genres,
    saved_album_count: albumsCount,
    recent_density,
    artist_diversity: aRows.length,
    genre_diversity: genreScore.size,
  })

  const signals = {
    artists_observed: aRows.length,
    genre_diversity: genreScore.size,
    top_genre_weight: top_genres[0] ? genreScore.get(top_genres[0]) ?? 0 : 0,
  }

  const { error } = await admin.from('listening_profile_snapshots').upsert(
    {
      user_id: userId,
      top_genres,
      top_artist_ids,
      top_track_ids,
      saved_album_count: albumsCount,
      recent_event_count: eventCount,
      affinity_tags,
      recent_density,
      signals,
      computed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[sync] snapshot upsert failed', { code: error.code, message: error.message })
    }
    throw new Error(error.message)
  }

  return {
    top_genres_count: top_genres.length,
    affinity_tags_count: affinity_tags.length,
    artists_observed: aRows.length,
  }
}

/**
 * Normalize a list of Spotify genre strings.
 *  - Lowercases.
 *  - Trims whitespace.
 *  - Drops empty / known-junk values.
 *  - Dedupes (preserving first-encounter order).
 *
 * Spotify already returns mostly-lowercased strings like "indie folk",
 * "spiritual jazz", "uk drill" — we leave the words intact (no
 * hyphenation) so the downstream affinity matcher can do prefix/
 * substring matching naturally.
 */
export function normalizeGenres(genres: string[] | null | undefined): string[] {
  if (!genres) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of genres) {
    if (typeof raw !== 'string') continue
    const g = raw.toLowerCase().trim().replace(/\s+/g, ' ')
    if (!g) continue
    if (seen.has(g)) continue
    seen.add(g)
    out.push(g)
  }
  return out
}

/**
 * Deterministic affinity tags — vocabulary used by the room
 * recommendation engine. No AI, no fake values: a tag only appears
 * when there's underlying evidence in the user's data.
 *
 * Genre buckets (substring match on normalized top_genres):
 *   country, singer-songwriter, pop, classic-pop, hip-hop, indie,
 *   electronic, jazz, ambient, spiritual, cinematic, warm,
 *   experimental, intimate, expansive, confessional
 *
 * Non-genre buckets:
 *   album-listener  — saved_album_count >= 10
 *   catalog-heavy   — saved_album_count >= 25
 *   recent-heavy    — recent_density === 'high'
 *   eclectic        — genre_diversity >= 15
 */
function computeAffinityTags(params: {
  top_genres: string[]
  saved_album_count: number
  recent_density: 'low' | 'medium' | 'high' | null
  artist_diversity: number
  genre_diversity: number
}): string[] {
  const { top_genres, saved_album_count, recent_density, genre_diversity } = params
  const out = new Set<string>()

  const has = (...needles: string[]): boolean =>
    top_genres.some((g) => needles.some((n) => g.includes(n)))

  // Genre buckets.
  if (has('country', 'americana', 'outlaw country', 'alt-country')) out.add('country')
  if (
    has('singer-songwriter', 'songwriter', 'folk', 'indie folk', 'chamber folk')
  )
    out.add('singer-songwriter')
  if (has('hip hop', 'hip-hop', 'rap', 'trap', 'drill', 'grime')) out.add('hip-hop')
  if (has('indie rock', 'indie pop', 'indie folk', 'indie')) out.add('indie')
  if (
    has(
      'electronic',
      'idm',
      'techno',
      'house',
      'dnb',
      'drum and bass',
      'electronica',
      'synthwave',
    )
  )
    out.add('electronic')
  if (has('jazz', 'bebop', 'spiritual jazz', 'vocal jazz')) out.add('jazz')
  if (has('ambient', 'drone', 'new age')) out.add('ambient')
  if (has('spiritual', 'gospel', 'devotional', 'spiritual jazz')) out.add('spiritual')
  if (has('post-rock', 'shoegaze', 'cinematic', 'film score', 'soundtrack'))
    out.add('cinematic')
  if (has('soul', 'r&b', 'rnb', 'neo soul', 'neo-soul')) out.add('warm')
  if (has('experimental', 'avant-garde', 'noise', 'no wave')) out.add('experimental')
  if (has('lo-fi', 'lofi', 'bedroom pop', 'bedroom')) out.add('intimate')
  if (has('classical', 'modern classical', 'orchestral', 'minimalism'))
    out.add('expansive')
  if (
    has('singer-songwriter', 'confessional', 'sad', 'slowcore', 'sadcore')
  )
    out.add('confessional')

  // Pop buckets — keep "pop" and "classic-pop" distinct so the
  // recommender can prefer one or the other.
  if (
    has(
      'classic rock',
      'classic pop',
      'soft rock',
      'yacht rock',
      'mellow gold',
      'easy listening',
      '60s',
      '70s',
      '80s',
    )
  )
    out.add('classic-pop')
  if (has('pop', 'dance pop', 'art pop', 'electropop', 'pop rock')) out.add('pop')

  // Non-genre buckets.
  if (saved_album_count >= 25) out.add('catalog-heavy')
  else if (saved_album_count >= 10) out.add('album-listener')
  if (recent_density === 'high') out.add('recent-heavy')
  if (genre_diversity >= 15) out.add('eclectic')

  return Array.from(out)
}
