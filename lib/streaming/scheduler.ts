import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { syncProviderForUser, type SyncOutcome } from './sync'
import {
  classifySyncOutcome,
  sanitizeErrorSummary,
  type SyncRunStatus,
} from './scheduler-logic'
import type { SourceId } from './types'

/**
 * lib/streaming/scheduler.ts — Phase 6A.2B
 *
 * The cron-driven sync scheduler. Selects active connections that are
 * due (next_sync_after <= now or null), runs syncProviderForUser
 * concurrency-limited, aggregates per-connection outcomes into a
 * batch summary. Per-connection failures are isolated — a 401 from
 * one user's sync cannot poison the rest of the batch.
 *
 * No new schema; relies on the columns + listening_sync_runs table
 * added in 0012_sync_cursors_and_runs.sql. syncProviderForUser itself
 * owns the per-connection state updates (cursors, consecutive_failures,
 * next_sync_after) and the run-log insert.
 *
 * Apple Music is intentionally excluded — the provider scaffold's
 * sync() returns empties, and there are no live apple_music
 * connections in the wild. Filter is `source_id = 'spotify'`; widen
 * when the Apple Music wiring lands.
 */

export interface SchedulerOptions {
  /** Max connections to attempt per invocation. */
  batchSize?: number
  /** Max parallel syncs at any moment. */
  concurrency?: number
}

export interface SchedulerPerConnection {
  connection_id: string
  user_id: string
  source_id: SourceId
  status: SyncRunStatus
  duration_ms: number
  /** Sanitized one-line error summary; never tokens. Null on success. */
  error_summary: string | null
}

export interface SchedulerResult {
  ok: true
  scanned: number
  attempted: number
  ok_count: number
  partial: number
  rate_limited: number
  reauth_required: number
  failed: number
  skipped: number
  duration_ms: number
  per_connection: SchedulerPerConnection[]
}

const DEFAULT_BATCH = 50
const DEFAULT_CONCURRENCY = 4

/**
 * Run one scheduler tick. Safe to invoke from a cron route handler.
 *
 * Selection rules:
 *   - source_id = 'spotify'           (apple_music excluded; see above)
 *   - status    = 'active'            (skips revoked / error / reauth_required)
 *   - next_sync_after IS NULL OR <= now()
 *   - ORDER BY next_sync_after NULLS FIRST (FIFO; first-time syncs prioritized)
 *   - LIMIT batchSize
 *
 * Each selected connection is processed via syncProviderForUser with
 * trigger='cron'. That function updates its own scheduler state
 * (cursor / consecutive_failures / next_sync_after) and inserts a
 * listening_sync_runs row.
 */
export async function runScheduledSync(
  opts: SchedulerOptions = {},
): Promise<SchedulerResult> {
  const batchSize = Math.max(1, Math.min(opts.batchSize ?? DEFAULT_BATCH, 200))
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? DEFAULT_CONCURRENCY, 16))

  const startedAt = new Date()
  const admin = getSupabaseAdminClient()
  const nowIso = startedAt.toISOString()

  // ── Selection ──────────────────────────────────────────────────────
  // PostgREST's `.or(...)` lets us express the NULL-or-due condition
  // in one filter. The supporting index is:
  //   CREATE INDEX … ON listening_connections
  //     (source_id, status, next_sync_after NULLS FIRST)
  //     WHERE status = 'active';
  const { data: candidates, error: selErr } = await admin
    .from('listening_connections')
    .select('id, user_id, source_id, status, next_sync_after')
    .eq('source_id', 'spotify')
    .eq('status', 'active')
    .or(`next_sync_after.is.null,next_sync_after.lte.${nowIso}`)
    .order('next_sync_after', { ascending: true, nullsFirst: true })
    .limit(batchSize)

  if (selErr) {
    // Selection itself failed — nothing to do; return a structured
    // shape so the cron route can log + respond 500 cleanly.
    return {
      ok: true,
      scanned: 0,
      attempted: 0,
      ok_count: 0,
      partial: 0,
      rate_limited: 0,
      reauth_required: 0,
      failed: 0,
      skipped: 0,
      duration_ms: Date.now() - startedAt.getTime(),
      per_connection: [
        {
          connection_id: 'selection',
          user_id: '',
          source_id: 'spotify',
          status: 'failed',
          duration_ms: 0,
          error_summary: sanitizeErrorSummary(selErr.message),
        },
      ],
    }
  }

  type Candidate = {
    id: string
    user_id: string
    source_id: SourceId
    status: string
  }
  const rows = (candidates ?? []) as unknown as Candidate[]
  const scanned = rows.length

  // ── Concurrency-limited fanout ─────────────────────────────────────
  // Tiny worker pool — no external dep. Each worker pulls the next
  // index off the shared cursor; per-connection try/catch isolates
  // failures (a thrown sync doesn't kill its sibling workers).
  const perConn: SchedulerPerConnection[] = []
  let cursor = 0
  async function worker() {
    while (true) {
      const i = cursor
      cursor += 1
      if (i >= rows.length) return
      const row = rows[i]
      const t0 = Date.now()
      let outcome: SyncOutcome
      try {
        outcome = await syncProviderForUser(row.user_id, row.source_id, {
          trigger: 'cron',
        })
      } catch (err) {
        // syncProviderForUser is meant to swallow most errors; if it
        // still throws, surface as a per-connection failure without
        // breaking the batch.
        perConn.push({
          connection_id: row.id,
          user_id: row.user_id,
          source_id: row.source_id,
          status: 'failed',
          duration_ms: Date.now() - t0,
          error_summary: sanitizeErrorSummary(
            err instanceof Error ? err.message : String(err),
          ),
        })
        continue
      }
      const status = classifySyncOutcome({
        ok: outcome.ok,
        error: outcome.error,
        hydration_error: outcome.hydration_error,
        enrichment_state: outcome.enrichment_state,
        refreshed: outcome.refreshed,
      })
      perConn.push({
        connection_id: row.id,
        user_id: row.user_id,
        source_id: row.source_id,
        status,
        duration_ms: Date.now() - t0,
        error_summary: sanitizeErrorSummary(outcome.error?.message ?? null),
      })
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  // ── Aggregate ──────────────────────────────────────────────────────
  let ok_count = 0
  let partial = 0
  let rate_limited = 0
  let reauth_required = 0
  let failed = 0
  let skipped = 0
  for (const r of perConn) {
    switch (r.status) {
      case 'ok':
        ok_count += 1
        break
      case 'partial':
        partial += 1
        break
      case 'rate_limited':
        rate_limited += 1
        break
      case 'reauth_required':
        reauth_required += 1
        break
      case 'skipped':
        skipped += 1
        break
      case 'failed':
      default:
        failed += 1
        break
    }
  }

  return {
    ok: true,
    scanned,
    attempted: perConn.length,
    ok_count,
    partial,
    rate_limited,
    reauth_required,
    failed,
    skipped,
    duration_ms: Date.now() - startedAt.getTime(),
    per_connection: perConn,
  }
}
