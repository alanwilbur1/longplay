/**
 * scripts/test-identity-presentation.ts — Phase 6A.7
 *
 * Pure tests for lib/identity/presentation.ts (display formatting
 * helpers used by the identity UI). No DB, no React, no fetch.
 *
 * Verifies:
 *   - TRAIT_DISPLAY entries exist and have all band copies
 *   - bandPosition maps cleanly and unknown → 0
 *   - confidenceLabel band cutoffs
 *   - relativeTimeAgo bucketing across multiple ranges
 *   - presentation catalog stays in sync with TRAIT_KEYS catalog
 *     (parity test — catches added/removed traits in traits.ts that
 *     weren't reflected in presentation.ts)
 *
 * Run: npm run test:identity-presentation
 */

import {
  bandPosition,
  confidenceLabel,
  relativeTimeAgo,
  TRAIT_DISPLAY,
} from '../lib/identity/presentation'
import { TRAIT_KEYS } from '../lib/identity/traits'

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

console.log('\n── identity presentation tests ──\n')

// ── TRAIT_DISPLAY parity with TRAIT_KEYS ───────────────────────────
console.log('TRAIT_DISPLAY parity:')
for (const k of TRAIT_KEYS) {
  const d = TRAIT_DISPLAY[k]
  assert(`entry exists for ${k}`, !!d)
  if (d) {
    assert(`${k}: has label`, typeof d.label === 'string' && d.label.length > 0)
    assert(`${k}: has framing`, typeof d.framing === 'string' && d.framing.length > 0)
    for (const band of ['low', 'medium', 'high', 'unknown'] as const) {
      const copy = d.bandCopy[band]
      assert(
        `${k}: ${band} band copy present`,
        typeof copy === 'string' && copy.length > 0,
      )
    }
  }
}
// Reverse parity — no orphan entries in TRAIT_DISPLAY beyond TRAIT_KEYS.
{
  const known = new Set(TRAIT_KEYS as readonly string[])
  for (const k of Object.keys(TRAIT_DISPLAY)) {
    assert(`TRAIT_DISPLAY[${k}] is in TRAIT_KEYS`, known.has(k))
  }
}

// ── bandPosition ──────────────────────────────────────────────────
console.log('\nbandPosition:')
assert('low → 1', bandPosition('low') === 1)
assert('medium → 2', bandPosition('medium') === 2)
assert('high → 3', bandPosition('high') === 3)
assert('unknown → 0', bandPosition('unknown') === 0)
assert('null → 0', bandPosition(null) === 0)
assert('undefined → 0', bandPosition(undefined) === 0)

// ── confidenceLabel cutoffs ───────────────────────────────────────
console.log('\nconfidenceLabel:')
assert('0.95 → Strong match', confidenceLabel(0.95) === 'Strong match')
assert('0.85 boundary → Strong match', confidenceLabel(0.85) === 'Strong match')
assert('0.84 → Clear match', confidenceLabel(0.84) === 'Clear match')
assert('0.65 boundary → Clear match', confidenceLabel(0.65) === 'Clear match')
assert('0.5 → Emerging match', confidenceLabel(0.5) === 'Emerging match')
assert('0.4 boundary → Emerging match', confidenceLabel(0.4) === 'Emerging match')
assert('0.39 → Tentative', confidenceLabel(0.39) === 'Tentative')
assert('0 → Tentative', confidenceLabel(0) === 'Tentative')

// ── relativeTimeAgo ───────────────────────────────────────────────
console.log('\nrelativeTimeAgo:')
{
  const now = new Date('2026-05-27T12:00:00Z')
  const MIN = 60 * 1000
  assert('null → "never"', relativeTimeAgo(null, now) === 'never')
  assert('undefined → "never"', relativeTimeAgo(undefined, now) === 'never')
  assert('garbage → "unknown"', relativeTimeAgo('not-a-date', now) === 'unknown')
  assert(
    '30s ago → "just now"',
    relativeTimeAgo(new Date(now.getTime() - 30 * 1000).toISOString(), now) === 'just now',
  )
  assert(
    '5m ago → "5m ago"',
    relativeTimeAgo(new Date(now.getTime() - 5 * MIN).toISOString(), now) === '5m ago',
  )
  assert(
    '3h ago → "3h ago"',
    relativeTimeAgo(new Date(now.getTime() - 3 * 60 * MIN).toISOString(), now) === '3h ago',
  )
  assert(
    '5 days ago → "5d ago"',
    relativeTimeAgo(new Date(now.getTime() - 5 * 24 * 60 * MIN).toISOString(), now) === '5d ago',
  )
  assert(
    '60 days ago → "2mo ago"',
    relativeTimeAgo(new Date(now.getTime() - 60 * 24 * 60 * MIN).toISOString(), now) === '2mo ago',
  )
  assert(
    '730 days ago → "2y ago"',
    relativeTimeAgo(new Date(now.getTime() - 730 * 24 * 60 * MIN).toISOString(), now) === '2y ago',
  )
  // Future-dated → 0 seconds elapsed → "just now"
  assert(
    'future-dated → "just now"',
    relativeTimeAgo(new Date(now.getTime() + 60 * MIN).toISOString(), now) === 'just now',
  )
}

console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
