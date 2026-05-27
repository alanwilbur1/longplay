/**
 * scripts/test-room-ecology.ts — Phase 6A.11
 *
 * Pure tests for room ecology / adjacency math. No DB.
 *   - computeRoomEcology: archetype counts, trait modal/share math,
 *     genre aggregation, energy_profile derivation, determinism
 *   - computeRoomDrift: archetype shifts above the share threshold,
 *     genre emergence/fading, trait modal-band changes, window_days
 *   - shouldAppendRoomEcology: first row, change-triggered,
 *     time-triggered, stable-skip
 *   - computeRoomAdjacency: listener overlap, archetype shares,
 *     genre Jaccard, band cutoffs, symmetry
 *   - canonicalRoomPair: order + swap; same-room throws
 *
 * Run: npm run test:room-ecology
 */

import {
  ACTIVE_LISTENER_AFFINITY_FLOOR,
  adjacencyBand,
  adjacencyBandLabel,
  canonicalRoomPair,
  computeRoomAdjacency,
  computeRoomDrift,
  computeRoomEcology,
  ECOLOGY_ALGORITHM_VERSION,
  ECOLOGY_MIN_DAYS_NO_CHANGE,
  shouldAppendRoomEcology,
  type AdjacencyBand,
  type ListenerEcologyInput,
} from '../lib/ecology/computation'
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

function listener(o: Partial<ListenerEcologyInput> & { user_id: string }): ListenerEcologyInput {
  return {
    user_id: o.user_id,
    affinity_score: o.affinity_score ?? 20,
    primary_archetype_key: o.primary_archetype_key ?? null,
    primary_archetype_label: o.primary_archetype_label ?? null,
    trait_bands: o.trait_bands ?? {},
    top_genres: o.top_genres ?? [],
  }
}

console.log('\n── room ecology tests ──\n')

// ── computeRoomEcology basics ──────────────────────────────────
console.log('computeRoomEcology:')
{
  const r = computeRoomEcology(
    { room_id: 'r1', declared_energy_level: 'medium' },
    [],
  )
  assert('empty listeners → count 0', r.active_listener_count === 0)
  assert('empty archetypes', r.dominant_archetypes.length === 0)
  assert(
    'empty traits (no contributing rows)',
    Object.keys(r.dominant_traits).length === 0,
  )
  assert('energy declared preserved', r.energy_profile.declared === 'medium')
}
{
  const r = computeRoomEcology(
    { room_id: 'r1', declared_energy_level: null },
    [
      listener({
        user_id: 'u1',
        primary_archetype_key: 'nocturnal-explorer',
        primary_archetype_label: 'The Nocturnal Explorer',
      }),
      listener({
        user_id: 'u2',
        primary_archetype_key: 'nocturnal-explorer',
        primary_archetype_label: 'The Nocturnal Explorer',
      }),
      listener({
        user_id: 'u3',
        primary_archetype_key: 'album-loyalist',
        primary_archetype_label: 'The Album Loyalist',
      }),
    ],
  )
  assert('3 listeners', r.active_listener_count === 3)
  assert('top archetype is nocturnal-explorer', r.dominant_archetypes[0]?.archetype_key === 'nocturnal-explorer')
  assert('nocturnal share = 2/3', Math.abs((r.dominant_archetypes[0]?.share ?? 0) - 0.6667) < 0.01)
  assert('album-loyalist 2nd', r.dominant_archetypes[1]?.archetype_key === 'album-loyalist')
}

// ── trait modal + share ────────────────────────────────────────
console.log('\ncomputeRoomEcology / trait distributions:')
{
  const r = computeRoomEcology(
    { room_id: 'r1', declared_energy_level: null },
    [
      listener({ user_id: 'u1', trait_bands: { nocturnal_score: 'high' } }),
      listener({ user_id: 'u2', trait_bands: { nocturnal_score: 'high' } }),
      listener({ user_id: 'u3', trait_bands: { nocturnal_score: 'low' } }),
      listener({ user_id: 'u4', trait_bands: { nocturnal_score: 'unknown' } }),
    ],
  )
  const t = r.dominant_traits.nocturnal_score
  assert('modal band is high (2 of 3 known)', t?.modal_band === 'high')
  assert('n excludes unknown', t?.n === 3)
  assert('high_share ≈ 0.6667', Math.abs((t?.high_share ?? 0) - 0.6667) < 0.01)
  assert('low_share ≈ 0.3333', Math.abs((t?.low_share ?? 0) - 0.3333) < 0.01)
  assert('medium_share = 0', t?.medium_share === 0)
}
{
  // Tie: medium > high > low when tied (center bias).
  const r = computeRoomEcology(
    { room_id: 'r1', declared_energy_level: null },
    [
      listener({ user_id: 'u1', trait_bands: { exploratory_score: 'low' } }),
      listener({ user_id: 'u2', trait_bands: { exploratory_score: 'medium' } }),
      listener({ user_id: 'u3', trait_bands: { exploratory_score: 'high' } }),
    ],
  )
  const t = r.dominant_traits.exploratory_score
  assert('three-way tie → modal medium (center bias)', t?.modal_band === 'medium')
}

// ── genre aggregation ─────────────────────────────────────────
console.log('\ncomputeRoomEcology / genre aggregation:')
{
  const r = computeRoomEcology(
    { room_id: 'r1', declared_energy_level: null },
    [
      listener({
        user_id: 'u1',
        top_genres: [
          { genre: 'jazz', weighted_score: 3 },
          { genre: 'ambient', weighted_score: 1 },
        ],
      }),
      listener({
        user_id: 'u2',
        top_genres: [
          { genre: 'jazz', weighted_score: 2 },
          { genre: 'indie', weighted_score: 1 },
        ],
      }),
    ],
  )
  const jazz = r.dominant_genres.find((g) => g.genre === 'jazz')
  assert('jazz sum = 5', jazz?.sum_weight === 5)
  assert('jazz listener_count = 2', jazz?.listener_count === 2)
  assert(
    'genres sorted by sum_weight desc',
    r.dominant_genres[0]?.genre === 'jazz',
  )
}

// ── energy_profile derivation ─────────────────────────────────
console.log('\ncomputeRoomEcology / energy_profile:')
{
  const r = computeRoomEcology(
    { room_id: 'r1', declared_energy_level: 'high' },
    [
      listener({ user_id: 'u1', trait_bands: { nocturnal_score: 'high' } }),
      listener({ user_id: 'u2', trait_bands: { nocturnal_score: 'high' } }),
    ],
  )
  assert('declared preserved', r.energy_profile.declared === 'high')
  assert('observed_nocturnal = 0.8 (modal high)', r.energy_profile.observed_nocturnal === 0.8)
  assert(
    'observed_exploratory = null (no data)',
    r.energy_profile.observed_exploratory === null,
  )
}

// ── determinism ────────────────────────────────────────────────
console.log('\ncomputeRoomEcology / determinism:')
{
  const inputs: ListenerEcologyInput[] = [
    listener({
      user_id: 'u1',
      primary_archetype_key: 'k1',
      primary_archetype_label: 'L1',
      trait_bands: { nocturnal_score: 'high' },
      top_genres: [{ genre: 'a', weighted_score: 1 }],
    }),
  ]
  const a = JSON.stringify(
    computeRoomEcology({ room_id: 'r1', declared_energy_level: null }, inputs),
  )
  const b = JSON.stringify(
    computeRoomEcology({ room_id: 'r1', declared_energy_level: null }, inputs),
  )
  assert('byte-identical across runs', a === b)
}

// ── computeRoomDrift ──────────────────────────────────────────
console.log('\ncomputeRoomDrift:')
{
  const prev = {
    snapshot_at: '2026-05-01T00:00:00.000Z',
    dominant_archetypes: [
      {
        archetype_key: 'a',
        archetype_label: 'A',
        listener_count: 4,
        share: 0.4,
      },
      {
        archetype_key: 'b',
        archetype_label: 'B',
        listener_count: 2,
        share: 0.2,
      },
    ],
    dominant_traits: {} as Partial<
      Record<TraitKey, ReturnType<typeof computeRoomEcology>['dominant_traits'][TraitKey]>
    >,
    dominant_genres: [
      { genre: 'jazz', sum_weight: 10, listener_count: 5 },
      { genre: 'ambient', sum_weight: 5, listener_count: 3 },
    ],
  }
  const curr = {
    snapshot_at: '2026-05-08T00:00:00.000Z',
    dominant_archetypes: [
      {
        archetype_key: 'a',
        archetype_label: 'A',
        listener_count: 6,
        share: 0.6,
      },
      // 'b' dropped, 'c' added
      {
        archetype_key: 'c',
        archetype_label: 'C',
        listener_count: 4,
        share: 0.4,
      },
    ],
    dominant_traits: {} as Partial<
      Record<TraitKey, ReturnType<typeof computeRoomEcology>['dominant_traits'][TraitKey]>
    >,
    dominant_genres: [
      { genre: 'jazz', sum_weight: 12, listener_count: 6 },
      { genre: 'folk', sum_weight: 8, listener_count: 4 },
    ],
  }
  const d = computeRoomDrift(prev, curr)
  assert(
    'a share rose ≥ 0.15 → recorded',
    d.archetype_shifts.find((s) => s.archetype_key === 'a')?.delta === 0.2,
  )
  assert(
    'c emerged from 0 → recorded',
    d.archetype_shifts.find((s) => s.archetype_key === 'c')?.delta === 0.4,
  )
  assert(
    'b faded',
    d.archetype_shifts.find((s) => s.archetype_key === 'b')?.delta === -0.2,
  )
  assert('emerging genres: folk', d.emerging_genres[0]?.genre === 'folk')
  assert('fading genres: ambient', d.fading_genres[0]?.genre === 'ambient')
  assert('window_days = 7', d.window_days === 7)
  assert('has_meaningful_change=true', d.has_meaningful_change === true)
}
{
  // No change scenario
  const prev = {
    snapshot_at: '2026-05-01T00:00:00.000Z',
    dominant_archetypes: [
      { archetype_key: 'a', archetype_label: 'A', listener_count: 5, share: 0.5 },
    ],
    dominant_traits: {} as Partial<
      Record<TraitKey, ReturnType<typeof computeRoomEcology>['dominant_traits'][TraitKey]>
    >,
    dominant_genres: [{ genre: 'jazz', sum_weight: 5, listener_count: 5 }],
  }
  const curr = {
    snapshot_at: '2026-05-05T00:00:00.000Z',
    dominant_archetypes: [
      { archetype_key: 'a', archetype_label: 'A', listener_count: 5, share: 0.5 },
    ],
    dominant_traits: {} as Partial<
      Record<TraitKey, ReturnType<typeof computeRoomEcology>['dominant_traits'][TraitKey]>
    >,
    dominant_genres: [{ genre: 'jazz', sum_weight: 5, listener_count: 5 }],
  }
  const d = computeRoomDrift(prev, curr)
  assert('stable input → no meaningful change', d.has_meaningful_change === false)
  assert('window_days = 4', d.window_days === 4)
}

// ── shouldAppendRoomEcology ───────────────────────────────────
console.log('\nshouldAppendRoomEcology:')
assert(
  'no previous → always append',
  shouldAppendRoomEcology({ hasPrevious: false, drift: null }) === true,
)
{
  const stable: ReturnType<typeof computeRoomDrift> = {
    archetype_shifts: [],
    emerging_genres: [],
    fading_genres: [],
    trait_modal_shifts: [],
    window_days: 2,
    has_meaningful_change: false,
  }
  assert(
    'stable + short window → skip',
    shouldAppendRoomEcology({ hasPrevious: true, drift: stable }) === false,
  )
  assert(
    `stable + window=${ECOLOGY_MIN_DAYS_NO_CHANGE} → append (time-triggered)`,
    shouldAppendRoomEcology({
      hasPrevious: true,
      drift: { ...stable, window_days: ECOLOGY_MIN_DAYS_NO_CHANGE },
    }) === true,
  )
}
{
  const changed: ReturnType<typeof computeRoomDrift> = {
    archetype_shifts: [],
    emerging_genres: [{ genre: 'jazz' }],
    fading_genres: [],
    trait_modal_shifts: [],
    window_days: 1,
    has_meaningful_change: true,
  }
  assert(
    'meaningful change + short window → append',
    shouldAppendRoomEcology({ hasPrevious: true, drift: changed }) === true,
  )
}

// ── adjacencyBand cutoffs ────────────────────────────────────
console.log('\nadjacencyBand:')
assert('30 → aligned', adjacencyBand(30) === 'aligned')
assert('22 boundary → aligned', adjacencyBand(22) === 'aligned')
assert('21 → overlapping', adjacencyBand(21) === 'overlapping')
assert('14 boundary → overlapping', adjacencyBand(14) === 'overlapping')
assert('13 → adjacent', adjacencyBand(13) === 'adjacent')
assert('6 boundary → adjacent', adjacencyBand(6) === 'adjacent')
assert('5 → disjoint', adjacencyBand(5) === 'disjoint')
assert('0 → disjoint', adjacencyBand(0) === 'disjoint')
assert('negative → disjoint', adjacencyBand(-1) === 'disjoint')

// ── adjacencyBandLabel ───────────────────────────────────────
console.log('\nadjacencyBandLabel:')
const BANDS: AdjacencyBand[] = ['aligned', 'overlapping', 'adjacent', 'disjoint']
for (const b of BANDS) {
  assert(
    `${b} → non-empty label`,
    typeof adjacencyBandLabel(b) === 'string' && adjacencyBandLabel(b).length > 0,
  )
}

// ── computeRoomAdjacency ─────────────────────────────────────
console.log('\ncomputeRoomAdjacency:')
{
  const sharedIds = Array.from({ length: 5 }, (_, i) => `u${i}`)
  const r = computeRoomAdjacency(
    {
      room_id: 'r1',
      active_listener_ids: sharedIds,
      dominant_archetypes: [
        { archetype_key: 'a', archetype_label: 'A', listener_count: 5, share: 0.5 },
      ],
      dominant_genres: [
        { genre: 'jazz', sum_weight: 5, listener_count: 5 },
        { genre: 'ambient', sum_weight: 3, listener_count: 3 },
      ],
    },
    {
      room_id: 'r2',
      active_listener_ids: sharedIds,
      dominant_archetypes: [
        { archetype_key: 'a', archetype_label: 'A', listener_count: 4, share: 0.4 },
      ],
      dominant_genres: [
        { genre: 'jazz', sum_weight: 4, listener_count: 4 },
        { genre: 'ambient', sum_weight: 2, listener_count: 2 },
      ],
    },
  )
  assert('full overlap → listener component 5', r.components.overlap === 5)
  assert(
    'shared archetype → archetype component min(0.5, 0.4) * 10 = 4',
    r.components.archetype === 4,
  )
  assert(
    'jaccard 2/2 → genre component 10',
    r.components.genre === 10,
  )
  assert('composite 19 → overlapping band', r.band === 'overlapping' && r.score === 19)
}
{
  // No overlap → disjoint
  const r = computeRoomAdjacency(
    {
      room_id: 'r1',
      active_listener_ids: ['x'],
      dominant_archetypes: [],
      dominant_genres: [{ genre: 'a', sum_weight: 1, listener_count: 1 }],
    },
    {
      room_id: 'r2',
      active_listener_ids: ['y'],
      dominant_archetypes: [],
      dominant_genres: [{ genre: 'b', sum_weight: 1, listener_count: 1 }],
    },
  )
  assert('no overlap → score 0', r.score === 0)
  assert('band disjoint', r.band === 'disjoint')
}
{
  // Listener overlap capped at 12
  const many = Array.from({ length: 50 }, (_, i) => `u${i}`)
  const r = computeRoomAdjacency(
    {
      room_id: 'r1',
      active_listener_ids: many,
      dominant_archetypes: [],
      dominant_genres: [],
    },
    {
      room_id: 'r2',
      active_listener_ids: many,
      dominant_archetypes: [],
      dominant_genres: [],
    },
  )
  assert(
    'overlap cap at 12 even with 50 shared',
    r.components.overlap === 12 && r.listener_overlap_count === 50,
  )
}

// ── symmetry ─────────────────────────────────────────────────
console.log('\ncomputeRoomAdjacency / symmetry:')
{
  const a = {
    room_id: 'r1',
    active_listener_ids: ['u1', 'u2', 'u3'],
    dominant_archetypes: [
      { archetype_key: 'k', archetype_label: 'K', listener_count: 2, share: 0.4 },
    ],
    dominant_genres: [
      { genre: 'jazz', sum_weight: 5, listener_count: 3 },
    ],
  }
  const b = {
    room_id: 'r2',
    active_listener_ids: ['u2', 'u3', 'u4'],
    dominant_archetypes: [
      { archetype_key: 'k', archetype_label: 'K', listener_count: 1, share: 0.3 },
    ],
    dominant_genres: [
      { genre: 'jazz', sum_weight: 4, listener_count: 2 },
    ],
  }
  const ab = computeRoomAdjacency(a, b)
  const ba = computeRoomAdjacency(b, a)
  assert('score symmetric', ab.score === ba.score)
  assert('band symmetric', ab.band === ba.band)
  assert(
    'components symmetric',
    JSON.stringify(ab.components) === JSON.stringify(ba.components),
  )
}

// ── canonicalRoomPair ────────────────────────────────────────
console.log('\ncanonicalRoomPair:')
{
  const p = canonicalRoomPair('zzz', 'aaa')
  assert('lex-smaller first', p.room_id_a === 'aaa' && p.room_id_b === 'zzz')
  assert('swapped flag set', p.swapped === true)
}
{
  const p = canonicalRoomPair('aaa', 'zzz')
  assert('already canonical', p.swapped === false)
}
expectThrow(
  'same room throws',
  () => canonicalRoomPair('x', 'x'),
  /same room_id/,
)

// ── version + constants ──────────────────────────────────────
console.log('\nconstants:')
assert(
  `ECOLOGY_ALGORITHM_VERSION = 'ecology_v1'`,
  ECOLOGY_ALGORITHM_VERSION === 'ecology_v1',
)
assert(
  `ACTIVE_LISTENER_AFFINITY_FLOOR = 12`,
  ACTIVE_LISTENER_AFFINITY_FLOOR === 12,
)
assert(
  `ECOLOGY_MIN_DAYS_NO_CHANGE = 7`,
  ECOLOGY_MIN_DAYS_NO_CHANGE === 7,
)

console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
