/**
 * scripts/test-compatibility.ts — Phase 6A.10
 *
 * Pure tests for compatibility scoring. No DB, no fetch. Asserts:
 *   - canonicalPair always returns the lex-smaller first; throws on
 *     same-user input
 *   - compatibilityBand cutoffs (strong/clear/emerging/adjacent/limited)
 *   - computeCompatibility is symmetric (score(A,B) === score(B,A))
 *     and deterministic across re-runs
 *   - genre Jaccard math
 *   - archetype scoring: same-primary > cross-listed > unrelated
 *   - trait alignment: same band → 1.0, adjacent → 0.5, gap-2 → 0
 *   - trait normalization scales to W_TRAIT_MAX
 *   - room overlap caps at W_ROOM_MAX
 *   - empty inputs produce score 0 / band 'limited'
 *   - divergence_points populated only for gap ≥ 2
 *
 * Run: npm run test:compatibility
 */

import {
  canonicalPair,
  compatibilityBand,
  compatibilityBandLabel,
  computeCompatibility,
  COMPATIBILITY_ALGORITHM_VERSION,
  type CompatibilityBand,
  type CompatibilityInput,
} from '../lib/identity/compatibility'
import type { TraitBand, TraitKey } from '../lib/identity/traits'

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

function expectThrow(label: string, fn: () => unknown, messageMatch?: RegExp) {
  try {
    fn()
    assert(label, false, 'expected throw, none thrown')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (messageMatch && !messageMatch.test(msg)) {
      assert(label, false, `wrong error: ${msg}`)
    } else {
      assert(label, true)
    }
  }
}

function input(o: Partial<CompatibilityInput> = {}): CompatibilityInput {
  return {
    user_id: o.user_id ?? 'u',
    primary_archetype_key: o.primary_archetype_key ?? null,
    alternate_archetype_keys: o.alternate_archetype_keys ?? [],
    trait_bands: o.trait_bands ?? {},
    top_genres: o.top_genres ?? [],
    top_rooms: o.top_rooms ?? [],
  }
}

console.log('\n── compatibility tests ──\n')

// ── canonicalPair ────────────────────────────────────────────────
console.log('canonicalPair:')
{
  const p = canonicalPair('aaa-1', 'bbb-2')
  assert('lex-smaller first', p.user_id_a === 'aaa-1' && p.user_id_b === 'bbb-2')
  assert('not swapped', p.swapped === false)
}
{
  const p = canonicalPair('zzz', 'aaa')
  assert('swap applied', p.user_id_a === 'aaa' && p.user_id_b === 'zzz')
  assert('swapped flag set', p.swapped === true)
}
expectThrow(
  'same-user input throws',
  () => canonicalPair('x', 'x'),
  /same user_id/,
)

// ── compatibilityBand cutoffs ───────────────────────────────────
console.log('\ncompatibilityBand:')
assert('score 40 → strong', compatibilityBand(40) === 'strong')
assert('35 boundary → strong', compatibilityBand(35) === 'strong')
assert('34 → clear', compatibilityBand(34) === 'clear')
assert('22 boundary → clear', compatibilityBand(22) === 'clear')
assert('21 → emerging', compatibilityBand(21) === 'emerging')
assert('12 boundary → emerging', compatibilityBand(12) === 'emerging')
assert('11 → adjacent', compatibilityBand(11) === 'adjacent')
assert('5 boundary → adjacent', compatibilityBand(5) === 'adjacent')
assert('4 → limited', compatibilityBand(4) === 'limited')
assert('0 → limited', compatibilityBand(0) === 'limited')
assert('negative → limited', compatibilityBand(-1) === 'limited')
assert('NaN → limited', compatibilityBand(Number.NaN) === 'limited')

// ── compatibilityBandLabel ──────────────────────────────────────
console.log('\ncompatibilityBandLabel:')
const ALL_BANDS: CompatibilityBand[] = [
  'strong',
  'clear',
  'emerging',
  'adjacent',
  'limited',
]
for (const b of ALL_BANDS) {
  const label = compatibilityBandLabel(b)
  assert(`${b} → non-empty label`, typeof label === 'string' && label.length > 0)
}

// ── computeCompatibility: empty inputs ──────────────────────────
console.log('\ncomputeCompatibility / empty:')
{
  const a = input({ user_id: 'a' })
  const b = input({ user_id: 'b' })
  const r = computeCompatibility(a, b)
  assert('empty inputs → score 0', r.score === 0)
  assert('empty inputs → band limited', r.band === 'limited')
  assert(
    'all components zero',
    r.components.genre === 0 &&
      r.components.archetype === 0 &&
      r.components.trait === 0 &&
      r.components.room === 0,
  )
  assert('no shared traits / genres / rooms', r.shared_traits.length === 0 && r.shared_genres.length === 0 && r.shared_rooms.length === 0)
}

// ── genre Jaccard ──────────────────────────────────────────────
console.log('\ncomputeCompatibility / genre Jaccard:')
{
  // 100% overlap → score 20
  const a = input({
    user_id: 'a',
    top_genres: [
      { genre: 'jazz', weighted_score: 5 },
      { genre: 'ambient', weighted_score: 3 },
    ],
  })
  const b = input({
    user_id: 'b',
    top_genres: [
      { genre: 'jazz', weighted_score: 6 },
      { genre: 'ambient', weighted_score: 2 },
    ],
  })
  const r = computeCompatibility(a, b)
  assert('100% overlap → genre component 20', r.components.genre === 20)
  assert('shared 2 genres', r.shared_genres.length === 2)
  assert(
    'genres sorted by combined weight',
    r.shared_genres[0].genre === 'jazz',
  )
}
{
  // 1 of 3 overlap = Jaccard 1/3 → 20 * 1/3 ≈ 6.6667
  const a = input({
    top_genres: [
      { genre: 'jazz', weighted_score: 5 },
      { genre: 'indie', weighted_score: 3 },
    ],
  })
  const b = input({
    top_genres: [
      { genre: 'jazz', weighted_score: 5 },
      { genre: 'metal', weighted_score: 3 },
    ],
  })
  const r = computeCompatibility(a, b)
  assert(
    'Jaccard 1/3 → ~6.67',
    Math.abs(r.components.genre - 20 / 3) < 0.01,
  )
}

// ── archetype scoring ──────────────────────────────────────────
console.log('\ncomputeCompatibility / archetype:')
{
  const a = input({ primary_archetype_key: 'nocturnal-explorer' })
  const b = input({ primary_archetype_key: 'nocturnal-explorer' })
  const r = computeCompatibility(a, b)
  assert('same primary → archetype 15', r.components.archetype === 15)
  assert('same_primary flag', r.archetype_alignment.same_primary === true)
  assert('cross_listed false', r.archetype_alignment.cross_listed === false)
}
{
  const a = input({
    primary_archetype_key: 'a',
    alternate_archetype_keys: ['b'],
  })
  const b = input({
    primary_archetype_key: 'b',
    alternate_archetype_keys: ['c'],
  })
  const r = computeCompatibility(a, b)
  assert(
    'B is in A\'s alternates → cross_listed=true, archetype 7',
    r.archetype_alignment.cross_listed === true && r.components.archetype === 7,
  )
}
{
  const a = input({ primary_archetype_key: 'a' })
  const b = input({ primary_archetype_key: 'z' })
  const r = computeCompatibility(a, b)
  assert(
    'unrelated primaries → archetype 0',
    r.components.archetype === 0 &&
      r.archetype_alignment.same_primary === false &&
      r.archetype_alignment.cross_listed === false,
  )
}

// ── trait alignment ────────────────────────────────────────────
console.log('\ncomputeCompatibility / trait alignment:')
{
  // All 7 traits perfectly aligned at same band → trait component = W_TRAIT_MAX = 10
  const all: Partial<Record<TraitKey, TraitBand>> = {
    obscurity_score: 'high',
    exploratory_score: 'high',
    album_focus_score: 'high',
    nocturnal_score: 'high',
    recency_bias_score: 'high',
    genre_breadth_score: 'high',
    consistency_score: 'high',
  }
  const r = computeCompatibility(input({ trait_bands: all }), input({ trait_bands: all }))
  assert('all bands aligned → trait component 10', r.components.trait === 10)
  assert('7 shared_traits entries', r.shared_traits.length === 7)
  assert('all alignment 1.0', r.shared_traits.every((s) => s.alignment === 1))
  assert('no divergence', r.divergence_points.length === 0)
}
{
  // Adjacent bands → 0.5 alignment each
  const r = computeCompatibility(
    input({ trait_bands: { nocturnal_score: 'low' } }),
    input({ trait_bands: { nocturnal_score: 'medium' } }),
  )
  // 1 contributing trait, alignment 0.5, normalized: (10 * 0.5) / 1 = 5
  assert('adjacent → trait component 5', r.components.trait === 5)
  assert('1 shared trait at 0.5', r.shared_traits.length === 1 && r.shared_traits[0].alignment === 0.5)
}
{
  // Gap-2: low vs high → alignment 0, divergence recorded
  const r = computeCompatibility(
    input({ trait_bands: { nocturnal_score: 'low' } }),
    input({ trait_bands: { nocturnal_score: 'high' } }),
  )
  assert('gap-2 → trait component 0', r.components.trait === 0)
  assert('no shared_traits (alignment=0)', r.shared_traits.length === 0)
  assert(
    '1 divergence_point with gap 2',
    r.divergence_points.length === 1 && r.divergence_points[0].gap === 2,
  )
}
{
  // 'unknown' band on either side → skip
  const r = computeCompatibility(
    input({ trait_bands: { nocturnal_score: 'unknown' } }),
    input({ trait_bands: { nocturnal_score: 'high' } }),
  )
  assert('unknown on one side → 0', r.components.trait === 0)
  assert('no shared, no divergence', r.shared_traits.length === 0 && r.divergence_points.length === 0)
}

// ── room overlap ───────────────────────────────────────────────
console.log('\ncomputeCompatibility / room overlap:')
{
  // 3 shared rooms in top-10 each
  const sharedRooms = [
    { room_id: 'r1', slug: 'a', name: 'A', score: 30 },
    { room_id: 'r2', slug: 'b', name: 'B', score: 20 },
    { room_id: 'r3', slug: 'c', name: 'C', score: 10 },
  ]
  const r = computeCompatibility(
    input({ top_rooms: sharedRooms }),
    input({ top_rooms: sharedRooms }),
  )
  assert('3 shared rooms → room component 3', r.components.room === 3)
  assert('shared_rooms has 3 entries', r.shared_rooms.length === 3)
}
{
  // Cap at 10 even with 15 shared
  const many = Array.from({ length: 15 }, (_, i) => ({
    room_id: `r${i}`,
    slug: `s${i}`,
    name: `Room ${i}`,
    score: 100 - i,
  }))
  const r = computeCompatibility(input({ top_rooms: many }), input({ top_rooms: many }))
  // Top-10 each → 10 shared
  assert('room component capped at 10', r.components.room === 10)
}

// ── Symmetry ─────────────────────────────────────────────────────
console.log('\ncomputeCompatibility / symmetry:')
{
  const a = input({
    user_id: 'a',
    primary_archetype_key: 'x',
    trait_bands: { nocturnal_score: 'high', album_focus_score: 'medium' },
    top_genres: [{ genre: 'jazz', weighted_score: 5 }],
    top_rooms: [{ room_id: 'r1', slug: 'a', name: 'A', score: 30 }],
  })
  const b = input({
    user_id: 'b',
    primary_archetype_key: 'x',
    trait_bands: { nocturnal_score: 'high', album_focus_score: 'low' },
    top_genres: [{ genre: 'jazz', weighted_score: 5 }],
    top_rooms: [{ room_id: 'r1', slug: 'a', name: 'A', score: 25 }],
  })
  const ab = computeCompatibility(a, b)
  const ba = computeCompatibility(b, a)
  assert('score is symmetric', ab.score === ba.score)
  assert('band is symmetric', ab.band === ba.band)
  assert('components are symmetric', JSON.stringify(ab.components) === JSON.stringify(ba.components))
}

// ── Determinism ────────────────────────────────────────────────
console.log('\ncomputeCompatibility / determinism:')
{
  const a = input({
    user_id: 'a',
    primary_archetype_key: 'x',
    trait_bands: { nocturnal_score: 'high' },
    top_genres: [
      { genre: 'a', weighted_score: 5 },
      { genre: 'b', weighted_score: 4 },
    ],
    top_rooms: [{ room_id: 'r1', slug: 'a', name: 'A', score: 10 }],
  })
  const b = input({ user_id: 'b' })
  const r1 = JSON.stringify(computeCompatibility(a, b))
  const r2 = JSON.stringify(computeCompatibility(a, b))
  assert('byte-identical across re-runs', r1 === r2)
}

// ── Composite end-to-end ───────────────────────────────────────
console.log('\ncomputeCompatibility / composite:')
{
  // High alignment scenario: same primary + 2/2 genres + 7/7 trait align + 1 shared room
  const allBands: Partial<Record<TraitKey, TraitBand>> = {
    obscurity_score: 'high',
    exploratory_score: 'high',
    album_focus_score: 'high',
    nocturnal_score: 'high',
    recency_bias_score: 'high',
    genre_breadth_score: 'high',
    consistency_score: 'high',
  }
  const a = input({
    primary_archetype_key: 'x',
    trait_bands: allBands,
    top_genres: [
      { genre: 'a', weighted_score: 1 },
      { genre: 'b', weighted_score: 1 },
    ],
    top_rooms: [{ room_id: 'r1', slug: 'a', name: 'A', score: 10 }],
  })
  const r = computeCompatibility(a, a)
  // Genre: 20, archetype: 15, trait: 10, room: 1 → 46
  assert('composite score = 46', r.score === 46)
  assert('strong band', r.band === 'strong')
}

// ── version constant ───────────────────────────────────────────
console.log('\nversion constant:')
assert(
  `COMPATIBILITY_ALGORITHM_VERSION === 'compat_v1'`,
  COMPATIBILITY_ALGORITHM_VERSION === 'compat_v1',
)

console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
