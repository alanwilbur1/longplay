/**
 * lib/streaming/scheduler-logic.ts — Phase 6A.2B
 *
 * Pure functions used by the scheduler. No Supabase, no fetch, no IO
 * — easy to unit-test, and importable from non-server contexts (the
 * test script in scripts/test-sync-scheduler.ts runs without a DB).
 *
 * The DB-backed scheduler in scheduler.ts composes these.
 */

export type SyncRunStatus =
  | 'ok'
  | 'partial'
  | 'skipped'
  | 'failed'
  | 'rate_limited'
  | 'reauth_required'

/**
 * Compute the new recently_played_cursor after a sync round.
 *
 * Returns the max(played_at) across the supplied events. If `events`
 * is empty (or contains no valid timestamps), returns `prevCursor`
 * unchanged — never reset the cursor backwards.
 *
 * Inputs are ISO strings; output is an ISO string or null when both
 * sides are empty.
 */
export function computeNextCursor(
  prevCursor: string | null,
  events: Array<{ played_at: string | null | undefined }>,
): string | null {
  let max: number = prevCursor ? Date.parse(prevCursor) : Number.NEGATIVE_INFINITY
  if (Number.isNaN(max)) max = Number.NEGATIVE_INFINITY
  let moved = false
  for (const e of events) {
    if (!e.played_at) continue
    const t = Date.parse(e.played_at)
    if (Number.isNaN(t)) continue
    if (t > max) {
      max = t
      moved = true
    }
  }
  if (moved) return new Date(max).toISOString()
  return prevCursor
}

/**
 * Exponential backoff for the next scheduler attempt.
 *
 *   failures 0 (success) → 1h
 *   failures 1           → 2h
 *   failures 2           → 4h
 *   failures 3           → 8h
 *   failures 4           → 16h
 *   failures ≥ 5         → 24h (cap)
 *
 * Jitter of ±10% is added to spread load across cron-tick boundaries.
 */
export function computeNextSyncAfter(
  consecutiveFailures: number,
  now: Date = new Date(),
  jitter: number = Math.random(),
): Date {
  const HOUR = 60 * 60 * 1000
  const CAP = 24 * HOUR
  let delay: number
  if (consecutiveFailures <= 0) {
    delay = 1 * HOUR
  } else {
    const exp = Math.min(consecutiveFailures, 5)
    delay = Math.min(HOUR * Math.pow(2, exp - 0), CAP)
    // consecutive_failures=1 → 2h, =2 → 4h, =3 → 8h, =4 → 16h, ≥5 → 24h
  }
  // ±10% jitter
  const jitterMs = (jitter - 0.5) * 0.2 * delay
  return new Date(now.getTime() + delay + jitterMs)
}

/**
 * Constant-time-ish (length + char-by-char) header comparison for the
 * Vercel cron secret. Avoids string === string short-circuit timing
 * leaks. Not paranoid-grade — Vercel's edge already rate-limits and
 * Authorization headers aren't a typical timing-attack target — but
 * better than `===` for a security-adjacent comparison.
 */
export function validateCronAuth(
  headerValue: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret || typeof secret !== 'string' || secret.length === 0) return false
  if (!headerValue || typeof headerValue !== 'string') return false
  const expected = `Bearer ${secret}`
  if (headerValue.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= headerValue.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Map a sync outcome into the listening_sync_runs.status enum.
 *
 * Reads the same shape SyncOutcome exposes (lib/streaming/sync.ts) but
 * without importing it — pure on the input keys so the test script can
 * exercise the mapping in isolation.
 */
export function classifySyncOutcome(o: {
  ok: boolean
  error: { stage: string; message: string } | null
  hydration_error?: string | null
  enrichment_state?: 'rate_limited' | null
  refreshed?: boolean
}): SyncRunStatus {
  if (o.error) {
    const msg = (o.error.message ?? '').toLowerCase()
    // refresh → reauth_required (the sync code itself moves the
    // connection to that status; we mirror it here for the run log)
    if (o.error.stage === 'refresh' || msg.includes('reauth')) {
      return 'reauth_required'
    }
    if (msg.includes('429') || msg.includes('rate limit')) {
      return 'rate_limited'
    }
    return 'failed'
  }
  // Enrichment-side rate limit is a partial — sync persisted data,
  // just couldn't drain the enrichment round. Surface so the operator
  // can see "data flowed, enrichment was throttled".
  if (o.enrichment_state === 'rate_limited') return 'partial'
  // Hydration error is a partial — favorites + events landed, but
  // some artist genre/popularity fields are missing.
  if (o.hydration_error) return 'partial'
  if (o.ok) return 'ok'
  // No error and !ok — defensive default. Shouldn't happen given
  // current sync.ts contract, but better to log than to assume.
  return 'failed'
}

/**
 * Truncate + sanitize an error message for the listening_sync_runs
 * audit log. The DB CHECK constraint caps at 500 chars; we cap at 480
 * here so the elision marker can fit.
 *
 * Strips ASCII control chars (the kind that show up when a stray
 * provider response body lands in an error message — they don't
 * compromise the secret posture per se, but they break the UI when
 * someone reads listening_sync_runs in a dashboard).
 */
export function sanitizeErrorSummary(raw: string | null | undefined): string | null {
  if (!raw) return null
  // eslint-disable-next-line no-control-regex
  const cleaned = String(raw).replace(/[\x00-\x08\x0B-\x1F\x7F]/g, ' ')
  if (cleaned.length <= 500) return cleaned
  return cleaned.slice(0, 480) + '…[truncated]'
}
