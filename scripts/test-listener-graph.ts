/**
 * scripts/test-listener-graph.ts — Phase 6A.3
 *
 * Pure-function tests for lib/streaming/normalization. Same shape as
 * scripts/test-token-crypto.ts and scripts/test-sync-scheduler.ts —
 * no DB, no fetch, runs anywhere.
 *
 * The DB-backed orchestrator (lib/streaming/listener-graph.ts) is
 * verified end-to-end via the existing smoke flow once a real DB is
 * available (Vercel/Supabase). The deterministic guarantees we care
 * about — same inputs → same outputs, bounded by these formulas —
 * live in the pure functions tested here.
 *
 * Run: npm run test:listener-graph
 */

import {
  canonicalAlbumKey,
  canonicalArtistKey,
  canonicalTrackKey,
  computeAlbumRankWeight,
  computeArtistAffinity,
  computeRankWeight,
  computeRecencyScore,
  computeTrackAffinity,
  mergeArtistGenres,
  roundForStorage,
} from '../lib/streaming/normalization'

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

function approx(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) <= eps
}

console.log('\n── listener-graph normalization tests ──\n')

// ── Canonical keys ───────────────────────────────────────────────
console.log('canonical keys:')
assert(
  'artist: spotify:0WrCpvr… shape',
  canonicalArtistKey('spotify', '0WrCpvrXXFcLuY7Pz') === 'spotify:0WrCpvrXXFcLuY7Pz',
)
assert(
  'album: spotify:5lUVR2… shape',
  canonicalAlbumKey('spotify', '5lUVR2YjPGwY1cYQ8') === 'spotify:5lUVR2YjPGwY1cYQ8',
)
assert(
  'track: spotify:7M7ekL… shape',
  canonicalTrackKey('spotify', '7M7ekLuXuP3') === 'spotify:7M7ekLuXuP3',
)
assert(
  'future apple_music source_id accepted',
  canonicalArtistKey('apple_music', '1234567890') === 'apple_music:1234567890',
)
expectThrow(
  'invalid source_id with hyphen throws',
  () => canonicalArtistKey('Spotify-X', 'abc'),
  /invalid source_id/,
)
expectThrow(
  'empty external id throws',
  () => canonicalArtistKey('spotify', ''),
  /empty/,
)
expectThrow(
  'external id containing ":" throws (ambiguous key)',
  () => canonicalArtistKey('spotify', 'has:colon'),
  /ambiguous/,
)

// ── mergeArtistGenres ────────────────────────────────────────────
console.log('\nmergeArtistGenres:')
{
  const merged = mergeArtistGenres(
    ['Indie Folk', 'indie folk', 'Singer-Songwriter'],
    ['chamber folk', 'singer-songwriter'],
  )
  assert(
    'lowercases + dedupes across Spotify + enrichment',
    JSON.stringify(merged) === JSON.stringify(['indie folk', 'singer-songwriter', 'chamber folk']),
  )
}
{
  // Spotify wins order: indie comes before ambient even though enrichment has ambient first.
  const merged = mergeArtistGenres(['indie'], ['ambient', 'indie'])
  assert('Spotify ordering preserved', merged[0] === 'indie' && merged[1] === 'ambient')
}
{
  assert(
    'nulls/undefined produce empty array',
    JSON.stringify(mergeArtistGenres(null, undefined)) === '[]',
  )
  assert(
    'both empty arrays → empty',
    JSON.stringify(mergeArtistGenres([], [])) === '[]',
  )
}
{
  const whitespace = mergeArtistGenres(['  indie    folk  '], [])
  assert('collapses whitespace + trims', whitespace[0] === 'indie folk')
}
{
  const long = mergeArtistGenres(
    Array.from({ length: 20 }, (_, i) => `genre-${i}`),
    ['extra-1', 'extra-2'],
  )
  assert('caps at 15', long.length === 15)
  assert('cap retains earliest (Spotify-first) genres', long[0] === 'genre-0')
}
{
  // Idempotency: re-merging the merged result with the same enrichment
  // shouldn't change order or length.
  const m1 = mergeArtistGenres(['indie folk', 'ambient'], ['singer-songwriter'])
  const m2 = mergeArtistGenres(m1, ['singer-songwriter'])
  assert(
    'idempotent under re-merge',
    JSON.stringify(m1) === JSON.stringify(m2),
  )
}

// ── computeRankWeight ────────────────────────────────────────────
console.log('\ncomputeRankWeight:')
assert('rank 1 ≈ 0.6309', approx(computeRankWeight(1), 1 / Math.log2(3)))
assert('rank 5 ≈ 0.3562', approx(computeRankWeight(5), 1 / Math.log2(7)))
assert('rank 50 ≈ 0.1754', approx(computeRankWeight(50), 1 / Math.log2(52)))
assert('null → 0.3 (flat)', computeRankWeight(null) === 0.3)
assert('undefined → 0.3', computeRankWeight(undefined) === 0.3)
assert('zero → 0.3 (invalid, fallback)', computeRankWeight(0) === 0.3)
assert('negative → 0.3 (invalid, fallback)', computeRankWeight(-1) === 0.3)
assert('NaN → 0.3 (invalid, fallback)', computeRankWeight(NaN) === 0.3)

// ── computeRecencyScore ─────────────────────────────────────────
console.log('\ncomputeRecencyScore:')
{
  const now = new Date('2026-05-26T12:00:00Z')
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR
  assert('null → 0', computeRecencyScore(null, now) === 0)
  assert('undefined → 0', computeRecencyScore(undefined, now) === 0)
  assert('garbage → 0', computeRecencyScore('not-a-date', now) === 0)
  assert(
    '2h ago → 1.0',
    computeRecencyScore(new Date(now.getTime() - 2 * HOUR), now) === 1.0,
  )
  assert(
    '7 days ago exactly → 1.0',
    computeRecencyScore(new Date(now.getTime() - 7 * DAY), now) === 1.0,
  )
  assert(
    '20 days ago → 0.5',
    computeRecencyScore(new Date(now.getTime() - 20 * DAY), now) === 0.5,
  )
  assert(
    '60 days ago → 0.2',
    computeRecencyScore(new Date(now.getTime() - 60 * DAY), now) === 0.2,
  )
  assert(
    '120 days ago → 0',
    computeRecencyScore(new Date(now.getTime() - 120 * DAY), now) === 0,
  )
  assert(
    'future-dated event → 1.0 (treat as fresh, not negative)',
    computeRecencyScore(new Date(now.getTime() + HOUR), now) === 1.0,
  )
}

// ── computeArtistAffinity ────────────────────────────────────────
console.log('\ncomputeArtistAffinity:')
{
  const base = {
    rankWeight: computeRankWeight(1),
    recencyScore: 1.0,
    playCount: 10,
    recentPlayCount: 5,
  }
  const score = computeArtistAffinity(base)
  // Expected: 0.6309 + 0.5*1 + 0.1*log10(6) + 0.05*log10(6)
  //          = 0.6309 + 0.5 + 0.0778 + 0.0389 = 1.2476
  assert('canonical: rank 1, fresh, 10 plays', approx(score, 1.2476, 0.001))
}
{
  // Same input twice → byte-identical (idempotency under recompute).
  const params = {
    rankWeight: 0.3,
    recencyScore: 0.5,
    playCount: 3,
    recentPlayCount: 0,
  }
  const a = computeArtistAffinity(params)
  const b = computeArtistAffinity(params)
  assert('byte-identical for same inputs', a === b)
}
{
  // Missing data degrades gracefully — rank_weight alone, no zeroing.
  const score = computeArtistAffinity({
    rankWeight: 0.3,
    recencyScore: 0,
    playCount: 0,
    recentPlayCount: 0,
  })
  assert('unranked + no events → rank_weight alone', score === 0.3)
}
{
  // Negative play counts (shouldn't happen) clamp to 0.
  const score = computeArtistAffinity({
    rankWeight: 0,
    recencyScore: 0,
    playCount: -5,
    recentPlayCount: -1,
  })
  assert('negative play counts clamped → 0', score === 0)
}

// ── computeTrackAffinity ────────────────────────────────────────
console.log('\ncomputeTrackAffinity:')
{
  const score = computeTrackAffinity({
    rankWeight: computeRankWeight(1),
    recencyScore: 1.0,
    playCount: 5,
  })
  // 0.6309 + 0.5 + 0.1*log10(6) = 1.2087
  assert('canonical: rank 1, fresh, 5 plays', approx(score, 1.2087, 0.001))
}

// ── computeAlbumRankWeight is just the same curve as artist ───
console.log('\ncomputeAlbumRankWeight:')
assert('album rank 3 same as artist', computeAlbumRankWeight(3) === computeRankWeight(3))
assert('album null → 0.3', computeAlbumRankWeight(null) === 0.3)

// ── roundForStorage matches numeric(*,4) precision ───────────
console.log('\nroundForStorage:')
assert('rounds to 4 decimals', roundForStorage(0.123456) === 0.1235)
assert('handles negatives', roundForStorage(-0.123456) === -0.1235)
assert('exact integers pass through', roundForStorage(5) === 5)

console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
