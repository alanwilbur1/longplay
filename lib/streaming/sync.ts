import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  enqueueArtistGenreEnrichments,
  runArtistGenreEnrichmentRound,
} from '@/lib/enrichment'
import type { EnrichmentRoundStats } from '@/lib/enrichment/types'
import { getProvider, type SourceId } from './index'
import { decryptToken, encryptToken } from './token-crypto'
import {
  classifySyncOutcome,
  computeNextSyncAfter,
  sanitizeErrorSummary,
  type SyncRunStatus,
} from './scheduler-logic'
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
    /** Phase 4.4 persistence audit: how many of the upserted
     *  favorite_artists rows carry at least one piece of enriched
     *  data (genres OR popularity OR followers OR image_url). A late
     *  429 in the fallback must NEVER cause this to drop to zero
     *  when earlier requests succeeded. */
    partial_hydration_persisted: number
    /** Phase 4.5 enrichment counters — see EnrichmentRoundStats.
     *  All zero when no external provider is configured. */
    enrichment_jobs_queued: number
    enrichment_jobs_run: number
    enrichment_jobs_succeeded: number
    enrichment_jobs_failed: number
    enrichment_genres_added: number
  }
  refreshed: boolean
  last_sync_at: string | null
  snapshot_updated: boolean
  top_genres_count: number
  /** Null on full success. On hydration failure, a short safe string
   *  like "401: The access token expired". Never contains tokens. */
  hydration_error: string | null
  /** Phase 4.5: which external provider(s) the enrichment round
   *  contacted, comma-joined. Null when no enrichment ran. */
  enrichment_provider: string | null
  /** Phase 4.5: 'rate_limited' when the round bailed early, else null. */
  enrichment_state: 'rate_limited' | null
  /** Phase 4.5 lifecycle debug — what happened at each stage of the
   *  enrichment pass attached to this sync. Surfaces to the UI strip
   *  so the operator can see exactly where the pipeline stopped:
   *
   *    seeds_built=0           → no Spotify artists with empty genres
   *    seeds_built=N, db_error → table missing (migration not applied)
   *    enqueue_inserted=0      → all already existed (cache hit)
   *    selected=0              → all candidates in backoff / cached
   *    provider_resolved=null  → LASTFM_API_KEY missing in env
   */
  enrichment_debug: {
    seeds_built: number
    enqueue: {
      attempted: number
      inserted: number
      existed: number
      failed: number
      first_error: string | null
    }
    round: {
      queued: number
      selected: number
      run: number
      succeeded: number
      failed: number
      skipped_backoff: number
      skipped_cached: number
      skipped_inflight: number
      canonical_genres_added: number
      provider_resolved: 'lastfm' | null
      rate_limited: boolean
      last_error: string | null
      db_error: string | null
    }
    post_recompute_triggered: boolean
  } | null
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
      partial_hydration_persisted: 0,
      enrichment_jobs_queued: 0,
      enrichment_jobs_run: 0,
      enrichment_jobs_succeeded: 0,
      enrichment_jobs_failed: 0,
      enrichment_genres_added: 0,
    },
    refreshed: false,
    last_sync_at: null,
    snapshot_updated: false,
    top_genres_count: 0,
    hydration_error: null,
    enrichment_provider: null,
    enrichment_state: null,
    enrichment_debug: null,
    error: null,
  }
}

export interface SyncOptions {
  /** Where the sync was triggered from. Recorded on listening_sync_runs
   *  for audit. Defaults to 'manual' for backward compatibility — callers
   *  in the OAuth callback and the cron scheduler set this explicitly. */
  trigger?: 'cron' | 'oauth' | 'manual'
}

/**
 * Sync one provider for one user. Idempotent — safe to retry.
 *
 * Phase 6A.2B: this function is now also called by the cron scheduler
 * (lib/streaming/scheduler.ts). It persists:
 *   - listening_connections.recently_played_cursor (incremental window
 *     for the next call)
 *   - listening_connections.consecutive_failures + next_sync_after
 *     (exponential backoff for the scheduler)
 *   - listening_sync_runs row per attempt (audit; safe error only)
 */
export async function syncProviderForUser(
  userId: string,
  sourceId: SourceId,
  options: SyncOptions = {},
): Promise<SyncOutcome> {
  const outcome = emptyOutcome()
  const admin = getSupabaseAdminClient()
  const trigger: 'cron' | 'oauth' | 'manual' = options.trigger ?? 'manual'
  const startedAt = new Date()

  // 1. Fetch the connection (admin client bypasses RLS so we can read
  // the encrypted token columns).
  const { data: conn, error: connError } = await admin
    .from('listening_connections')
    .select(
      'id, user_id, source_id, status, scopes, access_token_encrypted, refresh_token_encrypted, token_expires_at, last_sync_at, recently_played_cursor, consecutive_failures',
    )
    .eq('user_id', userId)
    .eq('source_id', sourceId)
    .maybeSingle()

  if (connError || !conn) {
    outcome.error = {
      stage: 'load-connection',
      message: connError?.message ?? 'no connection row',
    }
    // No connection row to update; still record the attempt so an
    // audit can see "user X tried to sync but had no connection row".
    await recordSyncRun({
      userId,
      sourceId,
      trigger,
      startedAt,
      outcome,
      cursorBefore: null,
      cursorAfter: null,
      consecutiveFailuresAfter: null,
    })
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
    recently_played_cursor: string | null
    consecutive_failures: number | null
  }
  const cursorBefore = connectionRow.recently_played_cursor
  const prevFailures = connectionRow.consecutive_failures ?? 0

  if (connectionRow.status !== 'active') {
    outcome.error = {
      stage: 'connection-status',
      message: `status=${connectionRow.status} — not syncing`,
    }
    await recordSyncRun({
      userId,
      sourceId,
      trigger,
      startedAt,
      outcome,
      cursorBefore,
      cursorAfter: cursorBefore,
      consecutiveFailuresAfter: prevFailures,
      connectionId: connectionRow.id,
    })
    return outcome
  }

  // 2. Refresh tokens if expired or near-expiry.
  //
  // Token columns are AES-256-GCM encrypted on disk (lib/streaming/
  // token-crypto.ts). decryptToken() transparently handles three
  // cases:
  //   1. null / empty       → returns null
  //   2. v1 envelope        → returns decrypted plaintext (auth-tag
  //                           verified; throws on tamper)
  //   3. legacy plaintext   → returns the value as-is. The next
  //      refresh below will write back encrypted, so the column
  //      eventually becomes truthful. The backfill script
  //      (scripts/encrypt-legacy-tokens.ts) is the proactive path.
  const provider = getProvider(sourceId)
  let accessToken: string
  let refreshTokenPlain: string | null
  try {
    accessToken = decryptToken(connectionRow.access_token_encrypted) ?? ''
    refreshTokenPlain = decryptToken(connectionRow.refresh_token_encrypted)
  } catch (err) {
    // Tamper / malformed envelope / missing key. Surface as an error
    // rather than running with an empty access token (which would
    // produce confusing 401s downstream).
    outcome.error = {
      stage: 'token-decrypt',
      message: err instanceof Error ? err.message : String(err),
    }
    return outcome
  }
  const expiresAtMs = connectionRow.token_expires_at
    ? new Date(connectionRow.token_expires_at).getTime()
    : 0
  const nearExpiry = !expiresAtMs || expiresAtMs - Date.now() < REFRESH_BUFFER_MS

  if (nearExpiry) {
    if (!refreshTokenPlain) {
      outcome.error = {
        stage: 'refresh',
        message: 'no refresh_token; reauth required',
      }
      const failuresAfter = prevFailures + 1
      await admin
        .from('listening_connections')
        .update({
          status: 'reauth_required',
          last_error: outcome.error.message,
          consecutive_failures: failuresAfter,
          next_sync_after: computeNextSyncAfter(failuresAfter).toISOString(),
        })
        .eq('id', connectionRow.id)
      await recordSyncRun({
        userId,
        sourceId,
        trigger,
        startedAt,
        outcome,
        cursorBefore,
        cursorAfter: cursorBefore,
        consecutiveFailuresAfter: failuresAfter,
        connectionId: connectionRow.id,
      })
      return outcome
    }

    try {
      const refreshed = await provider.refreshTokens({
        refreshToken: refreshTokenPlain,
      })
      accessToken = refreshed.access_token
      outcome.refreshed = true

      // Persist new tokens — encrypted at the app boundary. Spotify
      // often omits a new refresh_token; keep the existing one in
      // that case (it stays encrypted on disk; we don't touch it).
      const tokenUpdate: Record<string, unknown> = {
        access_token_encrypted: encryptToken(refreshed.access_token),
        token_expires_at: refreshed.expires_at,
      }
      if (refreshed.refresh_token) {
        tokenUpdate.refresh_token_encrypted = encryptToken(refreshed.refresh_token)
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
      const failuresAfter = prevFailures + 1
      await admin
        .from('listening_connections')
        .update({
          status: 'reauth_required',
          last_error: outcome.error.message,
          consecutive_failures: failuresAfter,
          next_sync_after: computeNextSyncAfter(failuresAfter).toISOString(),
        })
        .eq('id', connectionRow.id)
      await recordSyncRun({
        userId,
        sourceId,
        trigger,
        startedAt,
        outcome,
        cursorBefore,
        cursorAfter: cursorBefore,
        consecutiveFailuresAfter: failuresAfter,
        connectionId: connectionRow.id,
      })
      return outcome
    }
  }

  // 3. Call provider sync. Pass the recently-played cursor so the
  // provider only fetches plays we haven't seen.
  let result: SyncResult
  try {
    result = await provider.sync({
      accessToken,
      recentlyPlayedAfter: cursorBefore,
    })
  } catch (err) {
    outcome.error = {
      stage: 'sync',
      message: err instanceof Error ? err.message : String(err),
    }
    const failuresAfter = prevFailures + 1
    await admin
      .from('listening_connections')
      .update({
        status: 'error',
        last_error: outcome.error.message,
        consecutive_failures: failuresAfter,
        next_sync_after: computeNextSyncAfter(failuresAfter).toISOString(),
      })
      .eq('id', connectionRow.id)
    await recordSyncRun({
      userId,
      sourceId,
      trigger,
      startedAt,
      outcome,
      cursorBefore,
      cursorAfter: cursorBefore,
      consecutiveFailuresAfter: failuresAfter,
      connectionId: connectionRow.id,
    })
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
  //
  // CRITICAL Phase-4.4 invariant: we upsert EVERY artist row built
  // from the provider seeds, regardless of whether hydration_error
  // is set. A late 429 during single-id fallback must not cause us
  // to discard earlier-hydrated entries — they live in `result.artists`
  // already, and this is where they reach the database.
  if (result.artists.length > 0) {
    const distinctGenres = new Set<string>()
    let hydrated = 0
    let partial_hydration_persisted = 0
    const rows = result.artists.map((a) => {
      const normGenres = normalizeGenres(a.genres)
      for (const g of normGenres) distinctGenres.add(g)
      const isHydrated =
        normGenres.length > 0 ||
        (a.popularity ?? null) !== null ||
        !!a.image_url
      if (isHydrated) hydrated += 1
      // Persistence counter — counts ANY enrichment that's about to
      // land in the upsert payload. Distinct from `artists_with_genres`
      // because Spotify may return popularity + image but no genres
      // (their current upstream regression), and we still want to
      // confirm "yes, we DID write enriched data".
      if (
        normGenres.length > 0 ||
        (a.popularity ?? null) !== null ||
        (a.followers ?? null) !== null ||
        !!a.image_url
      ) {
        partial_hydration_persisted += 1
      }
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
      outcome.counts.partial_hydration_persisted = partial_hydration_persisted
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
  // upstream succeeded), advance the recently_played_cursor, and
  // either clear consecutive_failures (success) or back off via
  // computeNextSyncAfter (failure).
  const succeeded = outcome.error === null
  const now = new Date().toISOString()
  const cursorAfter = result.meta?.recently_played_cursor ?? cursorBefore
  const failuresAfter = succeeded ? 0 : prevFailures + 1
  const connectionUpdate: Record<string, unknown> = {
    last_sync_at: now,
    status: succeeded ? 'active' : 'error',
    last_error: succeeded ? null : outcome.error?.message,
    consecutive_failures: failuresAfter,
    next_sync_after: computeNextSyncAfter(failuresAfter).toISOString(),
  }
  // Only persist a new cursor when the provider actually reported one
  // — otherwise the existing value stays. computeNextCursor never
  // moves backward, so this is safe.
  if (cursorAfter && cursorAfter !== cursorBefore) {
    connectionUpdate.recently_played_cursor = cursorAfter
  }
  await admin
    .from('listening_connections')
    .update(connectionUpdate)
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

  // 8. Phase 4.5: enqueue external genre enrichment for artists
  // whose Spotify-side genres came back empty. This runs AFTER the
  // sync's own state is durable (last_sync_at + snapshot already
  // written), so an enrichment failure can never roll the sync back.
  //
  // The actual fetches run in a bounded round below — best-effort,
  // time-capped, never blocks completion. Every stage logs
  // unconditionally (not dev-gated) so prod Vercel logs trace the
  // lifecycle when the UI strip stays at zero.
  const debug: NonNullable<SyncOutcome['enrichment_debug']> = {
    seeds_built: 0,
    enqueue: {
      attempted: 0,
      inserted: 0,
      existed: 0,
      failed: 0,
      first_error: null,
    },
    round: {
      queued: 0,
      selected: 0,
      run: 0,
      succeeded: 0,
      failed: 0,
      skipped_backoff: 0,
      skipped_cached: 0,
      skipped_inflight: 0,
      canonical_genres_added: 0,
      provider_resolved: null,
      rate_limited: false,
      last_error: null,
      db_error: null,
    },
    post_recompute_triggered: false,
  }
  outcome.enrichment_debug = debug

  try {
    // Seeds: artists whose Spotify-returned genres came back empty.
    // We do NOT seed for artists that already have Spotify genres —
    // Spotify's data is canonical and we don't need a second opinion.
    const seeds = result.artists
      .filter((a) => !a.genres || a.genres.length === 0)
      .filter((a) => a.external_artist_id && a.name && a.name.trim().length > 0)
      .map((a) => ({
        user_id: userId,
        source_id: sourceId,
        external_artist_id: a.external_artist_id,
        artist_name: a.name,
      }))
    debug.seeds_built = seeds.length

    console.log('[sync/enrichment] seeds built', {
      userId,
      sourceId,
      total_artists: result.artists.length,
      seeds: seeds.length,
    })

    if (seeds.length > 0) {
      const enqueueStats = await enqueueArtistGenreEnrichments(seeds)
      debug.enqueue = enqueueStats
      console.log('[sync/enrichment] enqueue done', {
        userId,
        ...enqueueStats,
      })
    }

    const stats: EnrichmentRoundStats = await runArtistGenreEnrichmentRound(
      userId,
      { maxJobs: 10, concurrency: 2, timeoutMs: 5000 },
    )
    debug.round = {
      queued: stats.queued,
      selected: stats.selected,
      run: stats.run,
      succeeded: stats.succeeded,
      failed: stats.failed,
      skipped_backoff: stats.skipped_backoff,
      skipped_cached: stats.skipped_cached,
      skipped_inflight: stats.skipped_inflight,
      canonical_genres_added: stats.canonical_genres_added,
      provider_resolved: stats.provider_resolved,
      rate_limited: stats.rate_limited,
      last_error: stats.last_error,
      db_error: stats.db_error,
    }
    outcome.counts.enrichment_jobs_queued = stats.queued
    outcome.counts.enrichment_jobs_run = stats.run
    outcome.counts.enrichment_jobs_succeeded = stats.succeeded
    outcome.counts.enrichment_jobs_failed = stats.failed
    outcome.counts.enrichment_genres_added = stats.canonical_genres_added
    outcome.enrichment_provider =
      stats.providers_used.length > 0 ? stats.providers_used.join(',') : null
    outcome.enrichment_state = stats.rate_limited ? 'rate_limited' : null

    console.log('[sync/enrichment] round done', {
      userId,
      provider_resolved: stats.provider_resolved,
      queued: stats.queued,
      selected: stats.selected,
      run: stats.run,
      succeeded: stats.succeeded,
      failed: stats.failed,
      canonical_genres_added: stats.canonical_genres_added,
      rate_limited: stats.rate_limited,
      db_error: stats.db_error,
      last_error: stats.last_error,
    })

    // 9. If enrichment actually landed genres, recompute the snapshot
    // again so the new canonical_genres get folded into top_genres
    // and affinity_tags. Skip when nothing changed.
    if (stats.succeeded > 0) {
      debug.post_recompute_triggered = true
      try {
        const snap = await recomputeListeningProfileSnapshot(userId)
        outcome.top_genres_count = snap.top_genres_count
        console.log('[sync/enrichment] post-enrichment snapshot recomputed', {
          userId,
          top_genres_count: snap.top_genres_count,
        })
      } catch (err) {
        console.warn('[sync/enrichment] post-enrichment snapshot recompute failed', {
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[sync/enrichment] outer block threw', {
      userId,
      message,
    })
    // Preserve whatever debug fields were already set; surface the
    // outer-block error as the round's last_error if nothing else
    // already captured one.
    if (!debug.round.last_error) {
      debug.round.last_error = `outer: ${message.slice(0, 200)}`
    }
  }

  // Phase 6A.2B: durable audit. Best-effort — failures here don't
  // surface to the caller because the sync itself has already
  // completed and persisted its data.
  await recordSyncRun({
    userId,
    sourceId,
    trigger,
    startedAt,
    outcome,
    cursorBefore,
    cursorAfter,
    consecutiveFailuresAfter: failuresAfter,
    connectionId: connectionRow.id,
  })

  return outcome
}

// ── Run-log helper (Phase 6A.2B) ───────────────────────────────────
//
// Inserts one row into listening_sync_runs per sync attempt, even on
// early failure (load-connection, refresh, sync-exception). Wrapped
// in try/catch so a DB outage on the audit table never poisons the
// sync's own state. Never logs tokens.

interface RecordSyncRunArgs {
  userId: string
  sourceId: SourceId
  trigger: 'cron' | 'oauth' | 'manual'
  startedAt: Date
  outcome: SyncOutcome
  cursorBefore: string | null
  cursorAfter: string | null
  consecutiveFailuresAfter: number | null
  connectionId?: string
}

async function recordSyncRun(args: RecordSyncRunArgs): Promise<void> {
  const admin = getSupabaseAdminClient()
  const finishedAt = new Date()
  const durationMs = finishedAt.getTime() - args.startedAt.getTime()
  const status: SyncRunStatus = classifySyncOutcome({
    ok: args.outcome.ok,
    error: args.outcome.error,
    hydration_error: args.outcome.hydration_error,
    enrichment_state: args.outcome.enrichment_state,
    refreshed: args.outcome.refreshed,
  })
  const errorSummary = sanitizeErrorSummary(args.outcome.error?.message ?? null)
  try {
    await admin.from('listening_sync_runs').insert({
      user_id: args.userId,
      source_id: args.sourceId,
      trigger: args.trigger,
      status,
      started_at: args.startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      counts: args.outcome.counts,
      refreshed_token: args.outcome.refreshed,
      recently_played_cursor_before: args.cursorBefore,
      recently_played_cursor_after:
        args.cursorAfter && args.cursorAfter !== args.cursorBefore
          ? args.cursorAfter
          : null,
      error_summary: errorSummary,
    })
  } catch (err) {
    // Best-effort. Logs go to the platform log, not the DB.
    console.warn('[sync] failed to record sync run', {
      user_id: args.userId,
      source_id: args.sourceId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
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

  // Phase 4.5: pull successfully-enriched canonical genres for the
  // same user. Indexed by external_artist_id so we can union with the
  // Spotify-side genres without re-querying per artist. We DO NOT
  // replace Spotify genres — both sources contribute.
  const { data: enrichmentRows } = await admin
    .from('artist_genre_enrichments')
    .select('external_artist_id, canonical_genres')
    .eq('user_id', userId)
    .eq('status', 'succeeded')
  type AGE = { external_artist_id: string; canonical_genres: string[] | null }
  const enrichmentByArtist = new Map<string, string[]>()
  for (const row of (enrichmentRows ?? []) as unknown as AGE[]) {
    enrichmentByArtist.set(
      row.external_artist_id,
      Array.isArray(row.canonical_genres) ? row.canonical_genres : [],
    )
  }

  // Weighted genre tally. Earlier ranks count more (Lanczos-ish
  // 1/log2(rank+2) curve). Unranked artists contribute a flat 0.3.
  // Per artist, Spotify genres ∪ enrichment canonical_genres are
  // counted together (union, not sum — one artist contributes one
  // weight per distinct genre regardless of source).
  const genreScore = new Map<string, number>()
  for (const a of aRows) {
    const weight = a.rank ? 1 / Math.log2(a.rank + 2) : 0.3
    const combined = new Set<string>()
    for (const g of normalizeGenres(a.genres ?? [])) combined.add(g)
    for (const g of normalizeGenres(enrichmentByArtist.get(a.external_artist_id) ?? [])) {
      combined.add(g)
    }
    for (const g of combined) {
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
