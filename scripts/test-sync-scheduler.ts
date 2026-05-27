/**
 * scripts/test-sync-scheduler.ts — Phase 6A.2B
 *
 * Focused tests for lib/streaming/scheduler-logic — same shape as
 * scripts/test-token-crypto.ts. Asserts:
 *   - cursor moves forward only (idempotent under re-sync)
 *   - exponential backoff math
 *   - cron auth header validation (rejects missing/wrong/timing-safe)
 *   - sync outcome classification (status mapping)
 *   - error summary sanitization (truncation + control-char strip)
 *
 * Pure functions — no DB, no fetch, no Next runtime. Runs anywhere.
 */

import {
  computeNextCursor,
  computeNextSyncAfter,
  validateCronAuth,
  classifySyncOutcome,
  sanitizeErrorSummary,
} from '../lib/streaming/scheduler-logic'

let pass = 0
let fail = 0
const failures: string[] = []

function assert(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass += 1
    console.log(`  ✓ ${label}`)
  } else {
    fail += 1
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\n── sync-scheduler logic tests ──\n')

// ── computeNextCursor ───────────────────────────────────────────────
console.log('computeNextCursor:')
{
  const prev = '2026-05-26T10:00:00.000Z'
  const events = [
    { played_at: '2026-05-26T11:00:00.000Z' },
    { played_at: '2026-05-26T10:30:00.000Z' },
    { played_at: '2026-05-26T11:30:00.000Z' },
  ]
  assert(
    'picks max(played_at) across events',
    computeNextCursor(prev, events) === '2026-05-26T11:30:00.000Z',
  )
}
{
  // Spotify recently-played returns events newer than `after` cursor.
  // Re-running with the same cursor should not move it backward.
  const prev = '2026-05-26T11:30:00.000Z'
  const oldEvents = [
    { played_at: '2026-05-26T10:00:00.000Z' },
    { played_at: '2026-05-26T09:00:00.000Z' },
  ]
  assert(
    'never moves cursor backward (older events than prev)',
    computeNextCursor(prev, oldEvents) === prev,
  )
}
{
  assert(
    'empty events keeps prev cursor',
    computeNextCursor('2026-05-26T10:00:00.000Z', []) === '2026-05-26T10:00:00.000Z',
  )
  assert('null prev + empty events → null', computeNextCursor(null, []) === null)
  assert(
    'null prev + events → max(played_at)',
    computeNextCursor(null, [{ played_at: '2026-05-26T10:00:00.000Z' }]) ===
      '2026-05-26T10:00:00.000Z',
  )
}
{
  // Idempotency under duplicate events (Spotify can return the same
  // play if we re-fetch around the cursor boundary). The cursor
  // should land on the same value whether we ran once or twice.
  const events = [
    { played_at: '2026-05-26T12:00:00.000Z' },
    { played_at: '2026-05-26T12:00:00.000Z' },
    { played_at: '2026-05-26T11:30:00.000Z' },
  ]
  const c1 = computeNextCursor(null, events)
  const c2 = computeNextCursor(c1, events) // re-process same events
  assert('idempotent: re-processing same events lands on same cursor', c1 === c2)
}
{
  // Skip malformed / null timestamps without crashing or moving back.
  const events = [
    { played_at: null },
    { played_at: undefined },
    { played_at: 'not-a-date' },
    { played_at: '2026-05-26T13:00:00.000Z' },
  ]
  assert(
    'tolerates null/undefined/garbage timestamps',
    computeNextCursor('2026-05-26T10:00:00.000Z', events) === '2026-05-26T13:00:00.000Z',
  )
}

// ── computeNextSyncAfter ────────────────────────────────────────────
console.log('\ncomputeNextSyncAfter:')
{
  const now = new Date('2026-05-26T12:00:00.000Z')
  // Use jitter=0.5 (midpoint) so the ±10% jitter zeros out — makes
  // the assertions deterministic.
  const HOUR = 60 * 60 * 1000
  const ms = (d: Date) => d.getTime() - now.getTime()
  assert('failures=0 → ~1h', ms(computeNextSyncAfter(0, now, 0.5)) === HOUR)
  assert('failures=1 → ~2h', ms(computeNextSyncAfter(1, now, 0.5)) === 2 * HOUR)
  assert('failures=2 → ~4h', ms(computeNextSyncAfter(2, now, 0.5)) === 4 * HOUR)
  assert('failures=3 → ~8h', ms(computeNextSyncAfter(3, now, 0.5)) === 8 * HOUR)
  assert('failures=4 → ~16h', ms(computeNextSyncAfter(4, now, 0.5)) === 16 * HOUR)
  assert('failures=5 → capped at 24h', ms(computeNextSyncAfter(5, now, 0.5)) === 24 * HOUR)
  assert('failures=10 → capped at 24h', ms(computeNextSyncAfter(10, now, 0.5)) === 24 * HOUR)
}
{
  const now = new Date('2026-05-26T12:00:00.000Z')
  const HOUR = 60 * 60 * 1000
  // jitter=0 → -10%, jitter=1 → +10%
  const lo = computeNextSyncAfter(0, now, 0).getTime() - now.getTime()
  const hi = computeNextSyncAfter(0, now, 1).getTime() - now.getTime()
  assert('jitter min ≈ 0.9 * 1h', lo === Math.round(0.9 * HOUR))
  assert('jitter max ≈ 1.1 * 1h', hi === Math.round(1.1 * HOUR))
}

// ── validateCronAuth ────────────────────────────────────────────────
console.log('\nvalidateCronAuth:')
{
  const secret = 'my-cron-secret-abc123'
  assert('null header → false', validateCronAuth(null, secret) === false)
  assert('empty header → false', validateCronAuth('', secret) === false)
  assert('undefined header → false', validateCronAuth(undefined, secret) === false)
  assert('plain secret without "Bearer " → false', validateCronAuth(secret, secret) === false)
  assert(
    'wrong secret → false',
    validateCronAuth('Bearer wrong-value', secret) === false,
  )
  assert(
    'correct header → true',
    validateCronAuth(`Bearer ${secret}`, secret) === true,
  )
  assert('null secret → false', validateCronAuth(`Bearer ${secret}`, null) === false)
  assert(
    'empty secret → false',
    validateCronAuth(`Bearer ${secret}`, '') === false,
  )
  // Different-length headers must fail without leaking via timing
  assert(
    'different lengths → false (no timing oracle)',
    validateCronAuth(`Bearer ${secret}x`, secret) === false,
  )
}

// ── classifySyncOutcome ─────────────────────────────────────────────
console.log('\nclassifySyncOutcome:')
{
  const base = { ok: true, error: null }
  assert(
    'ok + no error + no hydration_error → ok',
    classifySyncOutcome(base) === 'ok',
  )
  assert(
    'ok + hydration_error → partial',
    classifySyncOutcome({ ...base, hydration_error: '401: token expired' }) === 'partial',
  )
  assert(
    'ok + enrichment_state=rate_limited → partial',
    classifySyncOutcome({ ...base, enrichment_state: 'rate_limited' }) === 'partial',
  )
  assert(
    'refresh stage error → reauth_required',
    classifySyncOutcome({
      ok: false,
      error: { stage: 'refresh', message: 'invalid_grant' },
    }) === 'reauth_required',
  )
  assert(
    'error message mentions 429 → rate_limited',
    classifySyncOutcome({
      ok: false,
      error: { stage: 'sync', message: 'HTTP 429: Too Many Requests' },
    }) === 'rate_limited',
  )
  assert(
    'generic error → failed',
    classifySyncOutcome({
      ok: false,
      error: { stage: 'favorite_artists-upsert', message: 'unique constraint' },
    }) === 'failed',
  )
}

// ── sanitizeErrorSummary ────────────────────────────────────────────
console.log('\nsanitizeErrorSummary:')
{
  assert('null → null', sanitizeErrorSummary(null) === null)
  assert('undefined → null', sanitizeErrorSummary(undefined) === null)
  assert('empty string → null', sanitizeErrorSummary('') === null)
  assert('short message passes through', sanitizeErrorSummary('boom') === 'boom')
  const long = 'x'.repeat(800)
  const sanitized = sanitizeErrorSummary(long)!
  assert(
    'long message truncates to ≤500',
    sanitized.length <= 500 && sanitized.endsWith('…[truncated]'),
  )
  const withControl = 'before\x00\x07after\nstill-ok'
  const cleaned = sanitizeErrorSummary(withControl)!
  assert(
    'strips control chars (keeps newlines)',
    !cleaned.includes('\x00') && !cleaned.includes('\x07') && cleaned.includes('\n'),
  )
}

console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
