/**
 * scripts/test-affinity-cache.ts — Phase 6A.5
 *
 * Pure tests for the Layer 4 cache-hot serving path's join + MMR
 * compatibility. No DB, no fetch — exercises:
 *   - joinCachedScoresToRooms matching by room_id
 *   - rankByMMR produces identical output for cached-score input
 *     vs. live-score input with the same numeric scores
 *   - rankByMMR's tie-breaking is deterministic
 *
 * The DB-backed recompute path (recomputeRoomAffinities,
 * readCachedRoomAffinities) is verified end-to-end against a real
 * Supabase post-deploy. Pure functions only here.
 *
 * Run: npm run test:affinity-cache
 */

import { joinCachedScoresToRooms } from '../lib/recommendations/affinity-cache'
import { rankByMMR, type ScoredCandidate } from '../lib/recommendations/scorer'
import type {
  ExplanationFactor,
  RoomForRecommendation,
} from '../lib/recommendations/types'

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

function room(overrides: Partial<RoomForRecommendation>): RoomForRecommendation {
  return {
    id: overrides.id ?? overrides.slug ?? 'r',
    slug: overrides.slug ?? 'r',
    name: overrides.name ?? 'Room',
    description: '',
    tagline: null,
    type: 'editorial',
    visibility: 'public',
    genres: [],
    moods: [],
    energy_level: null,
    cadence: null,
    featured: false,
    cover_art: null,
    recommendation_weight: 50,
    member_count: 0,
    currentAlbumArtist: null,
    currentAlbumEmotionalTags: [],
    currentAlbumSonicTags: [],
    ...overrides,
  }
}

function factor(kind: ExplanationFactor['kind'], weight: number): ExplanationFactor {
  return { kind, weight, detail: '' }
}

console.log('\n── affinity-cache tests ──\n')

// ── joinCachedScoresToRooms ─────────────────────────────────────
console.log('joinCachedScoresToRooms:')
{
  const candidates = [
    room({ id: 'r1', slug: 'a' }),
    room({ id: 'r2', slug: 'b' }),
    room({ id: 'r3', slug: 'c' }),
  ]
  const cached = [
    {
      room_id: 'r1',
      score: 30,
      score_version: 'v2.1',
      factor_breakdown: [factor('canonical-genre-match', 12)],
      source_snapshot_computed_at: null,
      computed_at: '2026-05-26T10:00:00Z',
    },
    {
      room_id: 'r2',
      score: 18,
      score_version: 'v2.1',
      factor_breakdown: [factor('mood-match', 9)],
      source_snapshot_computed_at: null,
      computed_at: '2026-05-26T10:00:00Z',
    },
    // r3 deliberately missing from cache
  ]
  const out = joinCachedScoresToRooms(cached, candidates)
  assert('returns only rooms with a cached row', out.length === 2)
  assert(
    'first scored is r1 with score 30',
    out[0].room.id === 'r1' && out[0].score === 30,
  )
  assert(
    'factors are carried through',
    out[0].factors.length === 1 && out[0].factors[0].kind === 'canonical-genre-match',
  )
  assert(
    'cached row for non-candidate room is dropped',
    !out.some((s) => s.room.id === 'r3'),
  )
}
{
  // Cached row for a room that's no longer in candidates (deleted /
  // dropped below top-50 by weight) should be skipped silently.
  const candidates = [room({ id: 'r1', slug: 'a' })]
  const cached = [
    {
      room_id: 'r1',
      score: 10,
      score_version: 'v2.1',
      factor_breakdown: [],
      source_snapshot_computed_at: null,
      computed_at: 't',
    },
    {
      room_id: 'deleted-room-id',
      score: 50,
      score_version: 'v2.1',
      factor_breakdown: [],
      source_snapshot_computed_at: null,
      computed_at: 't',
    },
  ]
  const out = joinCachedScoresToRooms(cached, candidates)
  assert('orphan cached row is filtered out', out.length === 1 && out[0].room.id === 'r1')
}
{
  // Empty inputs.
  assert(
    'empty cached → empty output',
    joinCachedScoresToRooms([], [room({ id: 'r1' })]).length === 0,
  )
  assert(
    'empty candidates → empty output',
    joinCachedScoresToRooms(
      [
        {
          room_id: 'r1',
          score: 10,
          score_version: 'v2.1',
          factor_breakdown: [],
          source_snapshot_computed_at: null,
          computed_at: 't',
        },
      ],
      [],
    ).length === 0,
  )
}

// ── rankByMMR with cached-shape scores ─────────────────────────────
console.log('\nrankByMMR:')
{
  // Simple ranking: highest score wins, no MMR penalty (no genre/mood
  // overlap → jaccard=0).
  const scored: ScoredCandidate[] = [
    { room: room({ id: 'r1', slug: 'a' }), score: 50, factors: [] },
    { room: room({ id: 'r2', slug: 'b' }), score: 30, factors: [] },
    { room: room({ id: 'r3', slug: 'c' }), score: 70, factors: [] },
  ]
  const ranked = rankByMMR(scored, 3)
  assert(
    '#1 by raw score',
    ranked[0].room.id === 'r3' && ranked[0].score === 70,
  )
  assert('#1 diversity_penalty is 0 (MMR invariant)', ranked[0].diversity_penalty === 0)
  assert('#2 picked next', ranked[1].room.id === 'r1')
}
{
  // Two highly-similar rooms should not both rank if a less-similar
  // alternative exists with a comparable score.
  const scored: ScoredCandidate[] = [
    {
      room: room({
        id: 'r1',
        slug: 'a',
        genres: ['ambient', 'electronic'],
        moods: ['nocturnal'],
      }),
      score: 50,
      factors: [],
    },
    {
      room: room({
        id: 'r2',
        slug: 'b',
        genres: ['ambient', 'electronic'],
        moods: ['nocturnal'],
      }),
      score: 49,
      factors: [],
    },
    {
      room: room({
        id: 'r3',
        slug: 'c',
        genres: ['jazz', 'modal'],
        moods: ['contemplative'],
      }),
      score: 45,
      factors: [],
    },
  ]
  const ranked = rankByMMR(scored, 2)
  assert(
    'MMR pulls in a diverse #2 over a near-duplicate higher score',
    ranked[0].room.id === 'r1' && ranked[1].room.id === 'r3',
  )
  assert(
    'diverse #2 has higher diversity_penalty=0 because r3 ≠ r1',
    ranked[1].diversity_penalty === 0,
  )
}
{
  // Tie-break determinism: equal scores → featured wins → higher
  // member_count → slug asc. Same tie-break order as live rankRooms.
  const scored: ScoredCandidate[] = [
    {
      room: room({
        id: 'b1',
        slug: 'b-room',
        featured: false,
        member_count: 100,
      }),
      score: 50,
      factors: [],
    },
    {
      room: room({
        id: 'a1',
        slug: 'a-room',
        featured: true,
        member_count: 10,
      }),
      score: 50,
      factors: [],
    },
    {
      room: room({
        id: 'c1',
        slug: 'c-room',
        featured: false,
        member_count: 200,
      }),
      score: 50,
      factors: [],
    },
  ]
  const ranked = rankByMMR(scored, 3)
  assert('featured wins first', ranked[0].room.id === 'a1')
  assert(
    'higher member_count wins among non-featured',
    ranked[1].room.id === 'c1' && ranked[2].room.id === 'b1',
  )
}
{
  // Determinism: same input → same output across calls.
  const scored: ScoredCandidate[] = [
    { room: room({ id: 'r1', slug: 'a' }), score: 50, factors: [] },
    { room: room({ id: 'r2', slug: 'b' }), score: 50, factors: [] },
    { room: room({ id: 'r3', slug: 'c' }), score: 50, factors: [] },
  ]
  const a = rankByMMR(scored, 3).map((r) => r.room.id).join(',')
  const b = rankByMMR(scored, 3).map((r) => r.room.id).join(',')
  assert('deterministic across re-runs', a === b)
}
{
  // Cached score equivalence: a ScoredCandidate built from cached row
  // (numeric score + factor array) MMR-ranks identically to one built
  // from live scoreRoom. Verified by feeding the same shape twice.
  const candidates = [room({ id: 'r1', slug: 'a' }), room({ id: 'r2', slug: 'b' })]
  const factors = [factor('canonical-genre-match', 12)]
  const live: ScoredCandidate[] = [
    { room: candidates[0], score: 30, factors },
    { room: candidates[1], score: 18, factors },
  ]
  const cached: ScoredCandidate[] = [
    { room: candidates[0], score: 30, factors },
    { room: candidates[1], score: 18, factors },
  ]
  const liveRanked = rankByMMR(live, 2)
  const cachedRanked = rankByMMR(cached, 2)
  assert(
    'live and cached produce identical ranked output for same scores',
    JSON.stringify(liveRanked) === JSON.stringify(cachedRanked),
  )
}

console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
