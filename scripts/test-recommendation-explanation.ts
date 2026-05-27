/**
 * scripts/test-recommendation-explanation.ts — Phase 6A.8
 *
 * Pure tests for lib/recommendations/explanation.ts. No DB, no
 * React, no fetch. Asserts:
 *   - affinityBand cutoffs (strong/moderate/emerging/tentative)
 *   - factorGroup mapping covers every ExplanationFactor.kind in
 *     lib/recommendations/types.ts
 *   - factorKindLabel produces a non-empty label for every kind
 *   - topFactorsForDisplay sorts desc + drops zero weights +
 *     tie-breaks deterministically
 *   - groupFactorsForDisplay preserves canonical group order,
 *     sorts within group, drops empty groups
 *   - factorGroupLabel covers every group key
 *
 * Run: npm run test:recommendation-explanation
 */

import {
  affinityBand,
  affinityBandLabel,
  factorGroup,
  factorGroupLabel,
  factorKindLabel,
  groupFactorsForDisplay,
  topFactorsForDisplay,
  type AffinityBand,
  type FactorGroup,
} from '../lib/recommendations/explanation'
import type { ExplanationFactor } from '../lib/recommendations/types'

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

const ALL_KINDS: ExplanationFactor['kind'][] = [
  'genre-match',
  'canonical-genre-match',
  'enriched-genre-match',
  'affinity-tag-match',
  'artist-match',
  'recency-boost',
  'mood-match',
  'context-match',
  'energy-match',
  'featured',
  'first-room-friendly',
  'popular',
]

const ALL_GROUPS: FactorGroup[] = [
  'genre',
  'trait',
  'artist',
  'editorial',
  'community',
]

const ALL_BANDS: AffinityBand[] = ['strong', 'moderate', 'emerging', 'tentative']

console.log('\n── recommendation explanation tests ──\n')

// ── affinityBand cutoffs ───────────────────────────────────────
console.log('affinityBand:')
assert('score 50 → strong', affinityBand(50) === 'strong')
assert('score 30 boundary → strong', affinityBand(30) === 'strong')
assert('score 29 → moderate', affinityBand(29) === 'moderate')
assert('score 18 boundary → moderate', affinityBand(18) === 'moderate')
assert('score 17 → emerging', affinityBand(17) === 'emerging')
assert('score 8 boundary → emerging', affinityBand(8) === 'emerging')
assert('score 7 → tentative', affinityBand(7) === 'tentative')
assert('score 0 → tentative', affinityBand(0) === 'tentative')
assert('negative → tentative', affinityBand(-5) === 'tentative')
assert('NaN → tentative', affinityBand(Number.NaN) === 'tentative')
assert('Infinity → tentative (non-finite sentinel)', affinityBand(Infinity) === 'tentative')

// ── affinityBandLabel covers all bands ─────────────────────────
console.log('\naffinityBandLabel:')
for (const b of ALL_BANDS) {
  const label = affinityBandLabel(b)
  assert(`${b} → non-empty label`, typeof label === 'string' && label.length > 0)
}

// ── factorGroup covers every kind ──────────────────────────────
console.log('\nfactorGroup:')
for (const k of ALL_KINDS) {
  const g = factorGroup(k)
  assert(`${k} → ${g}`, ALL_GROUPS.includes(g))
}
assert('genre kinds bucket as genre', factorGroup('canonical-genre-match') === 'genre')
assert('trait kinds bucket as trait', factorGroup('recency-boost') === 'trait')
assert('artist-match → artist', factorGroup('artist-match') === 'artist')
assert('featured → editorial', factorGroup('featured') === 'editorial')
assert('popular → community', factorGroup('popular') === 'community')

// ── factorKindLabel ────────────────────────────────────────────
console.log('\nfactorKindLabel:')
for (const k of ALL_KINDS) {
  const label = factorKindLabel(k)
  assert(`${k} → non-empty label`, typeof label === 'string' && label.length > 0)
}

// ── factorGroupLabel ───────────────────────────────────────────
console.log('\nfactorGroupLabel:')
for (const g of ALL_GROUPS) {
  const label = factorGroupLabel(g)
  assert(`${g} → non-empty label`, typeof label === 'string' && label.length > 0)
}

// ── topFactorsForDisplay ───────────────────────────────────────
console.log('\ntopFactorsForDisplay:')
{
  const factors: ExplanationFactor[] = [
    { kind: 'mood-match', weight: 9, detail: 'a' },
    { kind: 'canonical-genre-match', weight: 12, detail: 'b' },
    { kind: 'artist-match', weight: 12, detail: 'c' },
    { kind: 'featured', weight: 5, detail: 'd' },
  ]
  const top = topFactorsForDisplay(factors, 3)
  assert('returns top 3', top.length === 3)
  assert('highest weight first', top[0].weight === 12)
  // Tie-break: alphabetical by kind. 'artist-match' < 'canonical-genre-match'.
  assert(
    'ties broken alphabetically (artist-match before canonical-genre-match)',
    top[0].kind === 'artist-match' && top[1].kind === 'canonical-genre-match',
  )
}
{
  // Zero-weight factors dropped.
  const factors: ExplanationFactor[] = [
    { kind: 'mood-match', weight: 9, detail: 'a' },
    { kind: 'featured', weight: 0, detail: 'b' },
    { kind: 'popular', weight: 0, detail: 'c' },
  ]
  const top = topFactorsForDisplay(factors, 3)
  assert('zero-weight factors filtered out', top.length === 1)
  assert('remaining factor is the non-zero one', top[0].kind === 'mood-match')
}
{
  // Empty input → empty output.
  assert(
    'empty factors → empty array',
    topFactorsForDisplay([], 3).length === 0,
  )
}

// ── groupFactorsForDisplay ─────────────────────────────────────
console.log('\ngroupFactorsForDisplay:')
{
  const factors: ExplanationFactor[] = [
    { kind: 'popular', weight: 1, detail: 'a' },
    { kind: 'canonical-genre-match', weight: 12, detail: 'b' },
    { kind: 'artist-match', weight: 12, detail: 'c' },
    { kind: 'featured', weight: 5, detail: 'd' },
    { kind: 'recency-boost', weight: 4, detail: 'e' },
  ]
  const groups = groupFactorsForDisplay(factors)
  // Canonical order: genre → trait → artist → editorial → community.
  // No empty groups.
  const groupOrder = groups.map((g) => g.group)
  assert(
    'groups in canonical order',
    JSON.stringify(groupOrder) ===
      JSON.stringify(['genre', 'trait', 'artist', 'editorial', 'community']),
  )
  assert('each group non-empty', groups.every((g) => g.factors.length > 0))
}
{
  // Empty groups dropped.
  const factors: ExplanationFactor[] = [
    { kind: 'canonical-genre-match', weight: 12, detail: 'a' },
    { kind: 'recency-boost', weight: 4, detail: 'b' },
  ]
  const groups = groupFactorsForDisplay(factors)
  assert('only present groups returned', groups.length === 2)
  assert(
    'genre group first',
    groups[0].group === 'genre' && groups[1].group === 'trait',
  )
}
{
  // Within-group weight desc.
  const factors: ExplanationFactor[] = [
    { kind: 'canonical-genre-match', weight: 6, detail: 'lo' },
    { kind: 'enriched-genre-match', weight: 12, detail: 'hi' },
  ]
  const groups = groupFactorsForDisplay(factors)
  assert('1 group', groups.length === 1)
  assert(
    'within-group weight desc',
    groups[0].factors[0].weight === 12 && groups[0].factors[1].weight === 6,
  )
}
{
  // Zero-weight factors also dropped at group time.
  const factors: ExplanationFactor[] = [
    { kind: 'mood-match', weight: 0, detail: 'z' },
    { kind: 'canonical-genre-match', weight: 8, detail: 'a' },
  ]
  const groups = groupFactorsForDisplay(factors)
  assert('zero-weight dropped', groups.length === 1 && groups[0].group === 'genre')
}

console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
