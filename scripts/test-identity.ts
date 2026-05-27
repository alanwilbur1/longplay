/**
 * scripts/test-identity.ts — Phase 6A.6
 *
 * Pure tests for trait formulas + archetype matcher. No DB, no
 * fetch. Same shape as the other test:* scripts.
 *
 * Asserts:
 *   - each trait formula handles canonical, edge, and insufficient-
 *     data inputs deterministically
 *   - banding cut points are stable
 *   - archetype matcher: predicate fitness math, ineligibility on
 *     missing traits, deterministic ranking + tie-break, top-N
 *     and min-confidence filters
 *   - same trait scores → same archetype output (idempotency)
 *
 * Run: npm run test:identity
 */

import {
  computeAlbumFocusScore,
  computeConsistencyScore,
  computeExploratoryScore,
  computeGenreBreadthScore,
  computeNocturnalScore,
  computeObscurityScore,
  computeRecencyBiasScore,
  TRAIT_KEYS,
  type TraitKey,
} from '../lib/identity/traits'
import {
  ARCHETYPE_CATALOG,
  matchArchetype,
  predicateFitness,
  rankArchetypes,
  type ArchetypeDefinition,
} from '../lib/identity/archetypes'

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

function approx(a: number | null, b: number, eps = 1e-4): boolean {
  return a !== null && Math.abs(a - b) <= eps
}

console.log('\n── identity (traits + archetypes) tests ──\n')

// ── obscurity_score ────────────────────────────────────────────────
console.log('computeObscurityScore:')
{
  const r = computeObscurityScore([
    { popularity: 20 },
    { popularity: 40 },
    { popularity: 60 },
  ])
  // mean = 40, score = 1 - 40/100 = 0.6
  assert('three artists, mean popularity 40 → 0.6', approx(r.trait_score, 0.6))
  assert('band is medium', r.trait_band === 'medium')
  assert('n_artists_observed=3', (r.contributing_factors as Record<string, number>).n_artists_observed === 3)
}
{
  const r = computeObscurityScore([{ popularity: null }, { popularity: null }])
  assert('all popularity null → score null', r.trait_score === null)
  assert('band unknown', r.trait_band === 'unknown')
}
{
  const r = computeObscurityScore([])
  assert('empty input → null', r.trait_score === null && r.trait_band === 'unknown')
}
{
  // Mix: some valid, some null — observed should use only valid ones.
  const r = computeObscurityScore([
    { popularity: 80 },
    { popularity: null },
    { popularity: 20 },
  ])
  // mean = 50, score = 0.5
  assert('mixed null/valid uses only valid', approx(r.trait_score, 0.5))
  assert(
    'contributing_factors records both counts',
    (r.contributing_factors as Record<string, number>).n_artists_observed === 2 &&
      (r.contributing_factors as Record<string, number>).n_artists_total === 3,
  )
}
{
  // Out-of-range popularity (Spotify edge) is rejected.
  const r = computeObscurityScore([{ popularity: 150 }, { popularity: 50 }])
  assert('out-of-range popularity ignored', approx(r.trait_score, 1 - 50 / 100))
}

// ── exploratory_score ──────────────────────────────────────────────
console.log('\ncomputeExploratoryScore:')
{
  const r = computeExploratoryScore({
    distinctRecentArtists: 5,
    totalRankedArtists: 20,
  })
  assert('5/20 → 0.25', approx(r.trait_score, 0.25))
}
{
  const r = computeExploratoryScore({
    distinctRecentArtists: 30,
    totalRankedArtists: 20,
  })
  assert('caps at 1.0 when ratio > 1', r.trait_score === 1)
}
{
  const r = computeExploratoryScore({
    distinctRecentArtists: 0,
    totalRankedArtists: 0,
  })
  assert('no ranked artists → null', r.trait_score === null)
}

// ── album_focus_score ─────────────────────────────────────────────
console.log('\ncomputeAlbumFocusScore:')
{
  const r = computeAlbumFocusScore({ savedAlbumCount: 30, topTrackCount: 20 })
  assert('30/(30+20) → 0.6', approx(r.trait_score, 0.6))
}
{
  const r = computeAlbumFocusScore({ savedAlbumCount: 0, topTrackCount: 0 })
  assert('both zero → null', r.trait_score === null)
}

// ── nocturnal_score ────────────────────────────────────────────────
console.log('\ncomputeNocturnalScore:')
{
  // 10 events, 4 at night.
  const events = [
    { played_at: '2026-05-26T23:00:00Z' }, // night
    { played_at: '2026-05-26T02:00:00Z' }, // night
    { played_at: '2026-05-26T05:00:00Z' }, // night
    { played_at: '2026-05-26T22:30:00Z' }, // night
    { played_at: '2026-05-26T07:00:00Z' }, // day
    { played_at: '2026-05-26T13:00:00Z' }, // day
    { played_at: '2026-05-26T15:00:00Z' }, // day
    { played_at: '2026-05-26T18:00:00Z' }, // day
    { played_at: '2026-05-26T20:00:00Z' }, // day
    { played_at: '2026-05-26T21:59:00Z' }, // day (boundary)
  ]
  const r = computeNocturnalScore(events)
  assert('4/10 → 0.4', approx(r.trait_score, 0.4))
}
{
  const r = computeNocturnalScore([])
  assert('empty → null', r.trait_score === null)
}
{
  const r = computeNocturnalScore([{ played_at: 'not-a-date' }])
  assert('all garbage timestamps → null', r.trait_score === null)
}
{
  // 6:00 UTC is NOT night (boundary is exclusive on the high side).
  const r = computeNocturnalScore([
    { played_at: '2026-05-26T05:59:00Z' }, // night
    { played_at: '2026-05-26T06:00:00Z' }, // day
  ])
  assert('06:00 UTC boundary excludes (day)', approx(r.trait_score, 0.5))
}

// ── recency_bias_score ────────────────────────────────────────────
console.log('\ncomputeRecencyBiasScore:')
{
  const r = computeRecencyBiasScore({
    totalPlayCount: 60,
    recentPlayCount: 40,
  })
  // 40 / (60 + 40) = 0.4
  assert('40/(60+40) → 0.4', approx(r.trait_score, 0.4))
}
{
  const r = computeRecencyBiasScore({ totalPlayCount: 0, recentPlayCount: 0 })
  assert('both zero → null', r.trait_score === null)
}

// ── genre_breadth_score ───────────────────────────────────────────
console.log('\ncomputeGenreBreadthScore:')
{
  assert(
    '10 genres → 0.5 (10/20)',
    approx(computeGenreBreadthScore({ distinctGenreCount: 10 }).trait_score, 0.5),
  )
  assert(
    '20 genres → 1.0',
    computeGenreBreadthScore({ distinctGenreCount: 20 }).trait_score === 1,
  )
  assert(
    '50 genres saturates at 1.0',
    computeGenreBreadthScore({ distinctGenreCount: 50 }).trait_score === 1,
  )
  assert(
    '0 genres → null',
    computeGenreBreadthScore({ distinctGenreCount: 0 }).trait_score === null,
  )
}

// ── consistency_score ────────────────────────────────────────────
console.log('\ncomputeConsistencyScore:')
{
  // Top genre is half of total weight → 0.5
  const r = computeConsistencyScore([
    { genre: 'a', weighted_score: 10 },
    { genre: 'b', weighted_score: 5 },
    { genre: 'c', weighted_score: 5 },
  ])
  assert('top genre weight / total → 0.5', approx(r.trait_score, 0.5))
}
{
  // Single genre dominates.
  const r = computeConsistencyScore([
    { genre: 'a', weighted_score: 20 },
    { genre: 'b', weighted_score: 1 },
  ])
  assert('dominated genre → high consistency', approx(r.trait_score, 20 / 21))
}
{
  const r = computeConsistencyScore([])
  assert('empty genres → null', r.trait_score === null)
}
{
  // All zeros — pathological but possible.
  const r = computeConsistencyScore([
    { genre: 'a', weighted_score: 0 },
    { genre: 'b', weighted_score: 0 },
  ])
  assert('all-zero weights → null', r.trait_score === null)
}

// ── Banding cutpoints ────────────────────────────────────────────
console.log('\nbanding cutpoints:')
assert(
  '0.32 → low',
  computeAlbumFocusScore({ savedAlbumCount: 32, topTrackCount: 68 }).trait_band === 'low',
)
assert(
  '0.34 → medium',
  computeAlbumFocusScore({ savedAlbumCount: 34, topTrackCount: 66 }).trait_band === 'medium',
)
assert(
  '0.66 → high',
  computeAlbumFocusScore({ savedAlbumCount: 66, topTrackCount: 34 }).trait_band === 'high',
)

// ── predicateFitness ─────────────────────────────────────────────
console.log('\npredicateFitness:')
assert(
  'inside range → 1.0',
  predicateFitness(0.7, { min: 0.6, max: 0.8 }) === 1,
)
assert(
  'at exact min → 1.0',
  predicateFitness(0.6, { min: 0.6, max: 0.8 }) === 1,
)
assert(
  'at exact max → 1.0',
  predicateFitness(0.8, { min: 0.6, max: 0.8 }) === 1,
)
assert(
  'just outside (0.5 vs [0.6, 0.8]): 1 - 0.1/0.5 = 0.8',
  approx(predicateFitness(0.5, { min: 0.6, max: 0.8 }), 0.8),
)
assert(
  'far below (0.0 vs [0.6, 0.8]) → 0',
  predicateFitness(0.0, { min: 0.6, max: 0.8 }) === 0,
)
assert(
  'far above (1.0 vs [0.0, 0.4]): 1 - 0.6/0.5 → clamps to 0',
  predicateFitness(1.0, { min: 0.0, max: 0.4 }) === 0,
)

// ── matchArchetype ──────────────────────────────────────────────
console.log('\nmatchArchetype:')
{
  const arch: ArchetypeDefinition = {
    key: 'test',
    label: 'Test',
    description: 'x',
    predicates: {
      obscurity_score: { min: 0.5, max: 1.0 },
      album_focus_score: { min: 0.4, max: 1.0 },
    },
  }
  const m = matchArchetype(arch, {
    obscurity_score: 0.7,
    album_focus_score: 0.6,
    exploratory_score: null,
    nocturnal_score: null,
    recency_bias_score: null,
    genre_breadth_score: null,
    consistency_score: null,
  } as Record<TraitKey, number | null>)
  assert('both predicates satisfied → confidence 1.0', m.confidence === 1)
  assert('not ineligible', m.ineligible === false)
  assert(
    'two trait_contributions, both 1.0',
    m.trait_contributions.length === 2 &&
      m.trait_contributions.every((c) => c.contribution === 1),
  )
}
{
  const arch: ArchetypeDefinition = {
    key: 'test',
    label: 'Test',
    description: 'x',
    predicates: { obscurity_score: { min: 0.5, max: 1.0 } },
  }
  const m = matchArchetype(arch, {
    obscurity_score: null,
  } as unknown as Record<TraitKey, number | null>)
  assert('missing required trait → ineligible', m.ineligible === true)
  assert('confidence forced to 0 when ineligible', m.confidence === 0)
}

// ── rankArchetypes ──────────────────────────────────────────────
console.log('\nrankArchetypes:')
{
  // Listener with strong album+consistency profile — should match
  // album-loyalist with high confidence.
  const traits = {
    obscurity_score: 0.5,
    exploratory_score: 0.2,
    album_focus_score: 0.8,
    nocturnal_score: 0.3,
    recency_bias_score: 0.2,
    genre_breadth_score: 0.4,
    consistency_score: 0.6,
  } as Record<TraitKey, number | null>
  const ranked = rankArchetypes(ARCHETYPE_CATALOG, traits, 3, 0.4)
  assert('at least one archetype matched', ranked.length > 0)
  assert(
    'primary is album-loyalist or deep-catalog-romantic',
    ranked[0].key === 'album-loyalist' ||
      ranked[0].key === 'deep-catalog-romantic',
  )
  assert(
    'confidences are descending',
    ranked.every((m, i) => i === 0 || m.confidence <= ranked[i - 1].confidence),
  )
  assert('limited to top 3', ranked.length <= 3)
}
{
  // User with no listening data at all — every trait null.
  const traits = TRAIT_KEYS.reduce(
    (acc, k) => {
      acc[k] = null
      return acc
    },
    {} as Record<TraitKey, number | null>,
  )
  const ranked = rankArchetypes(ARCHETYPE_CATALOG, traits)
  assert('null-everywhere user → no archetype assigned', ranked.length === 0)
}
{
  // Determinism: same input → same output.
  const traits = {
    obscurity_score: 0.5,
    exploratory_score: 0.5,
    album_focus_score: 0.5,
    nocturnal_score: 0.5,
    recency_bias_score: 0.5,
    genre_breadth_score: 0.5,
    consistency_score: 0.5,
  } as Record<TraitKey, number | null>
  const a = rankArchetypes(ARCHETYPE_CATALOG, traits).map((m) => m.key).join(',')
  const b = rankArchetypes(ARCHETYPE_CATALOG, traits).map((m) => m.key).join(',')
  assert('deterministic ranking across re-runs', a === b)
}
{
  // Min confidence filter: a very low-fit profile produces nothing.
  const traits = {
    obscurity_score: 0.0,
    exploratory_score: 0.0,
    album_focus_score: 0.0,
    nocturnal_score: 0.0,
    recency_bias_score: 0.0,
    genre_breadth_score: 0.0,
    consistency_score: 0.0,
  } as Record<TraitKey, number | null>
  const ranked = rankArchetypes(ARCHETYPE_CATALOG, traits, 3, 0.4)
  // Some archetypes prefer low scores on certain traits, so a few
  // may still match. The key invariant: every returned archetype
  // meets the min confidence threshold.
  assert(
    'every returned archetype ≥ minConfidence',
    ranked.every((m) => m.confidence >= 0.4),
  )
}

console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
