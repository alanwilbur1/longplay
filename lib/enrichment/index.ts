import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  pickDefaultProvider,
  RateLimitedError,
  type EnrichmentProviderImpl,
} from './providers'
import type {
  EnrichmentEnqueueBatchStats,
  EnrichmentJob,
  EnrichmentRoundStats,
  EnrichmentStatus,
  ProviderEnrichmentResult,
} from './types'

/**
 * lib/enrichment — Phase 4.5 service layer for external genre
 * enrichment of favorite_artists.
 *
 * Public API:
 *   - enqueueArtistGenreEnrichment(params)     — idempotent upsert
 *   - runArtistGenreEnrichmentJob(jobId, opts) — execute one
 *   - runArtistGenreEnrichmentRound(userId, opts)
 *                                              — bounded batch runner
 *
 * Architectural rule: this layer is NEVER allowed to block streaming
 * sync. Callers (lib/streaming/sync.ts) invoke runRound AFTER the
 * sync's own state (last_sync_at, favorite_artists upsert, snapshot)
 * is durable. A failing enrichment is recorded per-job and surfaces
 * via the audit strip; it never rolls back the sync.
 */

const BACKOFF_BASE_SECONDS = 60
const BACKOFF_CAP_SECONDS = 24 * 60 * 60 // 24h

interface ArtistSeed {
  user_id: string
  source_id: string
  external_artist_id: string
  artist_name: string
}

/**
 * Idempotent enqueue. Inserts a `queued` row if none exists. If a
 * row already exists, returns it unchanged unless `force` is true,
 * in which case the row is reset to `queued` with attempt_count
 * preserved (so backoff still applies the next time it fails — we
 * never "lose" the history).
 */
export async function enqueueArtistGenreEnrichment(params: {
  userId: string
  sourceId: string
  externalArtistId: string
  artistName: string
  force?: boolean
}): Promise<EnrichmentJob | null> {
  const admin = getSupabaseAdminClient()

  const { data: existing } = await admin
    .from('artist_genre_enrichments')
    .select('*')
    .eq('user_id', params.userId)
    .eq('source_id', params.sourceId)
    .eq('external_artist_id', params.externalArtistId)
    .maybeSingle()

  if (existing && !params.force) {
    return existing as unknown as EnrichmentJob
  }

  if (existing && params.force) {
    const { data, error } = await admin
      .from('artist_genre_enrichments')
      .update({
        status: 'queued' as EnrichmentStatus,
        artist_name: params.artistName,
        last_error: null,
      })
      .eq('id', (existing as { id: string }).id)
      .select('*')
      .maybeSingle()
    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[enrichment/enqueue] force-update failed', error.message)
      }
      return null
    }
    return data as unknown as EnrichmentJob
  }

  const { data, error } = await admin
    .from('artist_genre_enrichments')
    .insert({
      user_id: params.userId,
      source_id: params.sourceId,
      external_artist_id: params.externalArtistId,
      artist_name: params.artistName,
      status: 'queued' as EnrichmentStatus,
    })
    .select('*')
    .maybeSingle()

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[enrichment/enqueue] insert failed', {
        code: error.code,
        message: error.message,
      })
    }
    return null
  }
  return data as unknown as EnrichmentJob
}

/**
 * Bulk-enqueue artist seeds. Returns per-batch stats so the caller
 * can distinguish "table missing — every insert failed" from
 * "everything already existed, nothing new to do" from "we just
 * queued 47 new jobs". The admin client + the table's unique
 * constraint keep it idempotent and cheap.
 */
export async function enqueueArtistGenreEnrichments(
  seeds: ArtistSeed[],
): Promise<EnrichmentEnqueueBatchStats> {
  const stats: EnrichmentEnqueueBatchStats = {
    attempted: 0,
    inserted: 0,
    existed: 0,
    failed: 0,
    first_error: null,
  }
  if (seeds.length === 0) return stats

  const admin = getSupabaseAdminClient()

  for (const seed of seeds) {
    stats.attempted += 1

    // Mirror enqueueArtistGenreEnrichment but capture inserted vs
    // existed so we have per-batch visibility. We don't reuse the
    // single-row function because we want to know which path each
    // seed took.
    const { data: existing, error: selectErr } = await admin
      .from('artist_genre_enrichments')
      .select('id')
      .eq('user_id', seed.user_id)
      .eq('source_id', seed.source_id)
      .eq('external_artist_id', seed.external_artist_id)
      .maybeSingle()

    if (selectErr) {
      stats.failed += 1
      if (!stats.first_error) {
        stats.first_error = `select: ${selectErr.code ?? 'NO_CODE'}: ${selectErr.message}`
      }
      continue
    }

    if (existing) {
      stats.existed += 1
      continue
    }

    const { error: insertErr } = await admin
      .from('artist_genre_enrichments')
      .insert({
        user_id: seed.user_id,
        source_id: seed.source_id,
        external_artist_id: seed.external_artist_id,
        artist_name: seed.artist_name,
        status: 'queued' as EnrichmentStatus,
      })

    if (insertErr) {
      stats.failed += 1
      if (!stats.first_error) {
        stats.first_error = `insert: ${insertErr.code ?? 'NO_CODE'}: ${insertErr.message}`
      }
      continue
    }

    stats.inserted += 1
  }

  return stats
}

/**
 * Decide whether a job is eligible to run right now.
 *   - 'succeeded' jobs are skipped unless `force` is set.
 *   - 'failed' or 'queued' jobs honor exponential backoff:
 *       wait = min(60s * 2^attempts, 24h) since last_attempted_at.
 *   - 'in_progress' is treated as still in flight: skip unless the
 *       row is older than 10 minutes (assume stuck/crashed).
 */
function isJobRunnable(
  job: EnrichmentJob,
  force: boolean,
): { runnable: boolean; reason: 'cached' | 'backoff' | 'inflight' | 'ok' } {
  if (force) return { runnable: true, reason: 'ok' }
  if (job.status === 'succeeded') return { runnable: false, reason: 'cached' }

  const lastAt = job.last_attempted_at
    ? new Date(job.last_attempted_at).getTime()
    : null

  if (job.status === 'in_progress' && lastAt) {
    const stuckAfterMs = 10 * 60 * 1000
    if (Date.now() - lastAt < stuckAfterMs) {
      return { runnable: false, reason: 'inflight' }
    }
  }

  if (lastAt) {
    const backoffSec = Math.min(
      BACKOFF_BASE_SECONDS * Math.pow(2, Math.max(0, job.attempt_count)),
      BACKOFF_CAP_SECONDS,
    )
    const elapsedSec = (Date.now() - lastAt) / 1000
    if (elapsedSec < backoffSec) {
      return { runnable: false, reason: 'backoff' }
    }
  }

  return { runnable: true, reason: 'ok' }
}

/**
 * Run a single enrichment job. Idempotent and self-throttled:
 *   - Honors exponential backoff (unless force).
 *   - Marks `in_progress` before the HTTP call (visible to the audit
 *     strip during retries).
 *   - On success: provider + raw_tags + canonical_genres + confidence.
 *   - On rate-limit: status stays as-is, attempt_count increments,
 *     last_error captures Retry-After. Caller (round runner) bails.
 *   - On other failure: status='failed', attempt_count++, last_error.
 *
 * Returns the post-update row, or null on bookkeeping error.
 */
export async function runArtistGenreEnrichmentJob(
  jobId: string,
  options?: { force?: boolean; provider?: EnrichmentProviderImpl },
): Promise<EnrichmentJob | null> {
  const admin = getSupabaseAdminClient()

  const { data: row } = await admin
    .from('artist_genre_enrichments')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  if (!row) return null
  const job = row as unknown as EnrichmentJob

  const decision = isJobRunnable(job, options?.force ?? false)
  if (!decision.runnable) return job

  const provider = options?.provider ?? pickDefaultProvider()
  if (!provider) {
    // No provider configured (no LASTFM_API_KEY). Mark as skipped so
    // the round runner doesn't keep hammering it.
    await admin
      .from('artist_genre_enrichments')
      .update({
        status: 'skipped' as EnrichmentStatus,
        last_error: 'no enrichment provider configured',
      })
      .eq('id', jobId)
    return { ...job, status: 'skipped', last_error: 'no enrichment provider configured' }
  }

  const startedAt = new Date().toISOString()
  await admin
    .from('artist_genre_enrichments')
    .update({
      status: 'in_progress' as EnrichmentStatus,
      attempt_count: job.attempt_count + 1,
      last_attempted_at: startedAt,
      provider: provider.id,
    })
    .eq('id', jobId)

  let result: ProviderEnrichmentResult
  try {
    result = await provider.fetchArtistTags({
      externalArtistId: job.external_artist_id,
      artistName: job.artist_name,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (err instanceof RateLimitedError) {
      await admin
        .from('artist_genre_enrichments')
        .update({
          status: 'queued' as EnrichmentStatus,
          last_error: `rate_limited${
            err.retryAfterSeconds !== null ? ` retry=${err.retryAfterSeconds}s` : ''
          }`,
        })
        .eq('id', jobId)
      // Re-throw so the round runner can bail.
      throw err
    }
    await admin
      .from('artist_genre_enrichments')
      .update({
        status: 'failed' as EnrichmentStatus,
        last_error: message.slice(0, 500),
      })
      .eq('id', jobId)
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[enrichment/run] job failed', {
        jobId,
        artist: job.artist_name,
        message,
      })
    }
    return null
  }

  await admin
    .from('artist_genre_enrichments')
    .update({
      status: 'succeeded' as EnrichmentStatus,
      provider: result.provider,
      raw_tags: result.raw_tags,
      canonical_genres: result.canonical_genres,
      confidence: result.confidence,
      last_error: null,
    })
    .eq('id', jobId)

  return {
    ...job,
    status: 'succeeded',
    provider: result.provider,
    raw_tags: result.raw_tags,
    canonical_genres: result.canonical_genres,
    confidence: result.confidence,
    attempt_count: job.attempt_count + 1,
    last_attempted_at: startedAt,
    last_error: null,
  }
}

/**
 * Bounded enrichment round for one user. Called from the streaming
 * sync as a best-effort post-step. NOT a blocking dependency of the
 * sync itself.
 *
 * Behavior:
 *   - Pulls up to `maxJobs` runnable jobs for this user.
 *   - Runs them with `concurrency` workers.
 *   - On the first RateLimitedError, sets `rate_limited` and bails;
 *     successes already captured remain durable in the DB.
 *   - Hard time cap via `timeoutMs` — once exceeded, stop spawning
 *     new work. In-flight work is allowed to complete.
 */
export async function runArtistGenreEnrichmentRound(
  userId: string,
  opts?: { maxJobs?: number; concurrency?: number; timeoutMs?: number },
): Promise<EnrichmentRoundStats> {
  const maxJobs = opts?.maxJobs ?? 10
  const concurrency = opts?.concurrency ?? 2
  const timeoutMs = opts?.timeoutMs ?? 5000

  const stats: EnrichmentRoundStats = {
    queued: 0,
    selected: 0,
    run: 0,
    succeeded: 0,
    failed: 0,
    skipped_backoff: 0,
    skipped_cached: 0,
    skipped_inflight: 0,
    canonical_genres_added: 0,
    providers_used: [],
    provider_resolved: null,
    rate_limited: false,
    last_error: null,
    db_error: null,
  }

  const provider = pickDefaultProvider()
  stats.provider_resolved = provider?.id ?? null
  if (!provider) {
    console.log('[enrichment/round] no provider configured — skipping', {
      userId,
      env_lastfm_key_present: !!process.env.LASTFM_API_KEY,
    })
    return stats
  }

  const admin = getSupabaseAdminClient()
  const { data: rows, error: selectErr } = await admin
    .from('artist_genre_enrichments')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['queued', 'failed'])
    .order('attempt_count', { ascending: true })
    .order('last_attempted_at', { ascending: true, nullsFirst: true })
    .limit(maxJobs * 3) // overshoot so the runnable filter has slack

  if (selectErr) {
    stats.db_error = `${selectErr.code ?? 'NO_CODE'}: ${selectErr.message}`
    console.log('[enrichment/round] select failed', {
      userId,
      code: selectErr.code,
      message: selectErr.message,
    })
    return stats
  }

  const candidates = (rows ?? []) as unknown as EnrichmentJob[]
  stats.queued = candidates.length

  const runnable: EnrichmentJob[] = []
  for (const job of candidates) {
    if (runnable.length >= maxJobs) break
    const decision = isJobRunnable(job, false)
    if (decision.runnable) {
      runnable.push(job)
    } else if (decision.reason === 'backoff') {
      stats.skipped_backoff += 1
    } else if (decision.reason === 'cached') {
      stats.skipped_cached += 1
    } else if (decision.reason === 'inflight') {
      stats.skipped_inflight += 1
    }
  }
  stats.selected = runnable.length

  console.log('[enrichment/round] candidates filtered', {
    userId,
    queued: stats.queued,
    selected: stats.selected,
    skipped_backoff: stats.skipped_backoff,
    skipped_cached: stats.skipped_cached,
    skipped_inflight: stats.skipped_inflight,
  })

  if (runnable.length === 0) return stats

  const distinctGenres = new Set<string>()
  const deadline = Date.now() + timeoutMs
  let cursor = 0

  async function worker() {
    while (true) {
      if (stats.rate_limited) return
      if (Date.now() > deadline) return
      const i = cursor
      cursor += 1
      if (i >= runnable.length) return
      const job = runnable[i]

      stats.run += 1
      try {
        const updated = await runArtistGenreEnrichmentJob(job.id, { provider })
        if (updated?.status === 'succeeded') {
          stats.succeeded += 1
          for (const g of updated.canonical_genres) distinctGenres.add(g)
          if (!stats.providers_used.includes(provider.id)) {
            stats.providers_used.push(provider.id)
          }
        } else {
          stats.failed += 1
        }
      } catch (err) {
        if (err instanceof RateLimitedError) {
          stats.rate_limited = true
          stats.last_error = `rate_limited${
            err.retryAfterSeconds !== null ? ` retry=${err.retryAfterSeconds}s` : ''
          }`
          return
        }
        stats.failed += 1
        stats.last_error =
          err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  stats.canonical_genres_added = distinctGenres.size
  return stats
}
