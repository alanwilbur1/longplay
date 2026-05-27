/**
 * scripts/test-spotify-hydration-policy.ts — Phase 6A.12
 *
 * Pure-function tests for lib/streaming/hydration-policy. Runs anywhere
 * — no DB, no fetch, no Next runtime.
 *
 * Asserts:
 *   - SPOTIFY_CATALOG_HYDRATION_MODE parsing (default → 'auto')
 *   - shouldAttemptHydration honors 'disabled'
 *   - classifyHydrationOutcome maps 403/probe-403 → 'restricted'
 *   - classifyHydrationOutcome maps 403 + full fallback recovery → 'ok'
 *   - classifyHydrationOutcome maps rate-limited shape → 'rate_limited'
 *   - classifyHydrationOutcome maps empty collected → 'ok'
 *   - isUserFacingHydrationError returns false for every known status
 *     (catalog restriction must NEVER produce a red user-facing error)
 *
 * Run: npm run test:spotify-hydration-policy
 */

import {
  classifyHydrationOutcome,
  isUserFacingHydrationError,
  parseHydrationMode,
  shouldAttemptHydration,
} from '../lib/streaming/hydration-policy'

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

console.log('\n── spotify hydration policy tests ──\n')

// ── parseHydrationMode ───────────────────────────────────────────
console.log('parseHydrationMode:')
assert('null → auto', parseHydrationMode(null) === 'auto')
assert('undefined → auto', parseHydrationMode(undefined) === 'auto')
assert('empty string → auto', parseHydrationMode('') === 'auto')
assert("'auto' → auto", parseHydrationMode('auto') === 'auto')
assert("'AUTO' (case) → auto", parseHydrationMode('AUTO') === 'auto')
assert("'enabled' → enabled", parseHydrationMode('enabled') === 'enabled')
assert("'disabled' → disabled", parseHydrationMode('disabled') === 'disabled')
assert("'  disabled  ' (whitespace) → disabled", parseHydrationMode('  disabled  ') === 'disabled')
assert("unknown value → auto (safe default)", parseHydrationMode('xyz') === 'auto')

// ── shouldAttemptHydration ───────────────────────────────────────
console.log('\nshouldAttemptHydration:')
assert('enabled → attempt', shouldAttemptHydration('enabled') === true)
assert('auto → attempt', shouldAttemptHydration('auto') === true)
assert('disabled → skip', shouldAttemptHydration('disabled') === false)

// ── classifyHydrationOutcome ────────────────────────────────────
console.log('\nclassifyHydrationOutcome:')

const baseInput = {
  mode: 'auto' as const,
  skipped: false,
  collected: 50,
  hydrated: 50,
  rate_limited: false,
  last_status: null as number | null,
  probe_single_status: null as number | null,
  fully_recovered_via_fallback: false,
}

assert(
  'happy path: every artist hydrated → ok',
  classifyHydrationOutcome(baseInput) === 'ok',
)

assert(
  'collected === 0 → ok (nothing to do)',
  classifyHydrationOutcome({ ...baseInput, collected: 0, hydrated: 0 }) === 'ok',
)

assert(
  'mode=disabled, skipped=true → disabled',
  classifyHydrationOutcome({
    ...baseInput,
    mode: 'disabled',
    skipped: true,
    hydrated: 0,
  }) === 'disabled',
)

assert(
  'rate_limited=true → rate_limited (regardless of status)',
  classifyHydrationOutcome({
    ...baseInput,
    rate_limited: true,
    hydrated: 20,
    last_status: 429,
  }) === 'rate_limited',
)

assert(
  'batch 403 + probe 403 → restricted (catalog blocked)',
  classifyHydrationOutcome({
    ...baseInput,
    hydrated: 0,
    last_status: 403,
    probe_single_status: 403,
  }) === 'restricted',
)

assert(
  'batch 403 + fallback fully recovered → ok',
  classifyHydrationOutcome({
    ...baseInput,
    hydrated: 50,
    last_status: 403,
    probe_single_status: 200,
    fully_recovered_via_fallback: true,
  }) === 'ok',
)

assert(
  'collected > 0 but hydrated = 0 (unknown reason) → restricted',
  classifyHydrationOutcome({
    ...baseInput,
    hydrated: 0,
    last_status: 500,
  }) === 'restricted',
)

assert(
  'partial: hydrated < collected → partial',
  classifyHydrationOutcome({
    ...baseInput,
    hydrated: 20,
    last_status: 200,
  }) === 'partial',
)

// ── isUserFacingHydrationError ──────────────────────────────────
console.log('\nisUserFacingHydrationError:')
assert(
  'ok is never user-facing error',
  isUserFacingHydrationError('ok') === false,
)
assert(
  'restricted is INTERNAL state, not a user-facing error',
  isUserFacingHydrationError('restricted') === false,
)
assert(
  'disabled is operator config, not a user-facing error',
  isUserFacingHydrationError('disabled') === false,
)
assert(
  'rate_limited is transient, not a user-facing error',
  isUserFacingHydrationError('rate_limited') === false,
)
assert(
  'partial is not a user-facing error (Last.fm fills gaps)',
  isUserFacingHydrationError('partial') === false,
)

console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
