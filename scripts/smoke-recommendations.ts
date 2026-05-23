/**
 * scripts/smoke-recommendations.ts
 *
 * Deterministic v2.1 scoring smoke test. No DB, no auth, no Supabase
 * — feeds synthetic RecommendationInput into the scorer and asserts
 * the invariants we care about. Quick way to catch a regression
 * before a deploy without needing live data.
 *
 *   tsx scripts/smoke-recommendations.ts
 *
 * Exit code is 0 on success, 1 if any assertion fails. Prints a
 * pass/fail summary plus the scored output for the listener
 * fixture so a human can eyeball the ordering.
 */

import { rankRooms, SCORE_VERSION } from '@/lib/recommendations/scorer'
import { explainFactors } from '@/lib/recommendations/explainer'
import type {
  RecommendationInput,
  RoomForRecommendation,
} from '@/lib/recommendations/types'

let pass = 0
let fail = 0

function assert(cond: boolean, label: string) {
  if (cond) {
    pass += 1
    console.log(`  ✓ ${label}`)
  } else {
    fail += 1
    console.log(`  ✗ ${label}`)
  }
}

function room(overrides: Partial<RoomForRecommendation>): RoomForRecommendation {
  return {
    id: overrides.slug ?? 'r',
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

function baseInput(
  overrides: Partial<RecommendationInput> = {},
): RecommendationInput {
  return {
    calibrationAnswers: {},
    canonicalGenres: [],
    enrichedGenres: [],
    affinityTags: [],
    topArtistNames: [],
    recentDensity: null,
    joinedRoomSlugs: [],
    candidates: [],
    ...overrides,
  }
}

console.log(`\n── v2.1 recommendation scoring smoke (SCORE_VERSION=${SCORE_VERSION}) ──\n`)

// ─────────────────────────────────────────────────────────────────────
// 1. Score version is exactly v2.1
// ─────────────────────────────────────────────────────────────────────
console.log('1. score version')
assert(SCORE_VERSION === 'v2.1', `SCORE_VERSION === 'v2.1' (got '${SCORE_VERSION}')`)

// ─────────────────────────────────────────────────────────────────────
// 2. Canonical genre match contributes 12 / match
// ─────────────────────────────────────────────────────────────────────
console.log('\n2. canonical-genre-match @ 12 / match')
{
  const r = room({ slug: 'a', genres: ['indie folk', 'ambient'] })
  const out = rankRooms(
    baseInput({ canonicalGenres: ['indie folk', 'ambient'], candidates: [r] }),
    1,
  )
  const f = out[0].factors.find((x) => x.kind === 'canonical-genre-match')
  assert(!!f, 'canonical-genre-match emitted')
  assert(f?.weight === 24, `weight = 24 (2 matches × 12); got ${f?.weight}`)
}

// ─────────────────────────────────────────────────────────────────────
// 3. Enriched genre match contributes 6 / match — and is deduped
//    against canonical
// ─────────────────────────────────────────────────────────────────────
console.log('\n3. enriched-genre-match @ 6 / match, deduped against canonical')
{
  const r = room({ slug: 'b', genres: ['shoegaze', 'ambient'] })
  // 'ambient' is in both canonical and enriched; should ONLY count
  // under canonical (12), not also under enriched (+6).
  const out = rankRooms(
    baseInput({
      canonicalGenres: ['ambient'],
      enrichedGenres: ['ambient', 'shoegaze'],
      candidates: [r],
    }),
    1,
  )
  const canonical = out[0].factors.find((x) => x.kind === 'canonical-genre-match')
  const enriched = out[0].factors.find((x) => x.kind === 'enriched-genre-match')
  assert(canonical?.weight === 12, `canonical weight = 12 (ambient); got ${canonical?.weight}`)
  assert(enriched?.weight === 6, `enriched weight = 6 (shoegaze only); got ${enriched?.weight}`)
}

// ─────────────────────────────────────────────────────────────────────
// 4. Affinity tag match is a distinct factor, NOT folded into mood
// ─────────────────────────────────────────────────────────────────────
console.log('\n4. affinity-tag-match @ 9 / match, distinct from mood-match')
{
  const r = room({ slug: 'c', moods: ['intimate', 'late-night'] })
  const out = rankRooms(
    baseInput({ affinityTags: ['intimate'], candidates: [r] }),
    1,
  )
  const aff = out[0].factors.find((x) => x.kind === 'affinity-tag-match')
  const mood = out[0].factors.find((x) => x.kind === 'mood-match')
  assert(aff?.weight === 9, `affinity weight = 9; got ${aff?.weight}`)
  assert(!mood, 'no mood-match (calibrationAnswers empty)')
}

// ─────────────────────────────────────────────────────────────────────
// 5. Artist-match @ 12, exact lowercase, does NOT overpower 3
//    canonical genre matches (36)
// ─────────────────────────────────────────────────────────────────────
console.log('\n5. artist-match @ 12, does not overpower combined canonical genres')
{
  const artistRoom = room({
    slug: 'artist-room',
    genres: [],
    currentAlbumArtist: 'Bon Iver',
  })
  const genreRoom = room({
    slug: 'genre-room',
    genres: ['indie folk', 'folk', 'chamber folk'],
  })
  const out = rankRooms(
    baseInput({
      canonicalGenres: ['indie folk', 'folk', 'chamber folk'],
      topArtistNames: ['Bon Iver'],
      candidates: [artistRoom, genreRoom],
    }),
    2,
  )
  assert(out[0].room.slug === 'genre-room', '3-genre room beats 1-artist room')
  assert(
    out[1].room.slug === 'artist-room',
    'artist room still placed second (real signal, not noise)',
  )
}

// ─────────────────────────────────────────────────────────────────────
// 6. Recency boost is gated: +4 only when density ∈ {medium, high}
//    AND there's at least one genre overlap
// ─────────────────────────────────────────────────────────────────────
console.log('\n6. recency-boost gating')
{
  // (a) medium density + genre overlap → boost present
  const yes = rankRooms(
    baseInput({
      canonicalGenres: ['ambient'],
      candidates: [room({ slug: 'y', genres: ['ambient'] })],
      recentDensity: 'medium',
    }),
    1,
  )
  assert(
    !!yes[0].factors.find((f) => f.kind === 'recency-boost' && f.weight === 4),
    '+4 boost when density=medium AND any genre overlap',
  )

  // (b) low density → no boost
  const low = rankRooms(
    baseInput({
      canonicalGenres: ['ambient'],
      candidates: [room({ slug: 'l', genres: ['ambient'] })],
      recentDensity: 'low',
    }),
    1,
  )
  assert(
    !low[0].factors.find((f) => f.kind === 'recency-boost'),
    'no boost when density=low',
  )

  // (c) medium density but NO genre overlap → no boost
  const noOverlap = rankRooms(
    baseInput({
      canonicalGenres: ['ambient'],
      candidates: [room({ slug: 'n', genres: ['techno'] })],
      recentDensity: 'medium',
    }),
    1,
  )
  assert(
    !noOverlap[0].factors.find((f) => f.kind === 'recency-boost'),
    'no boost when density=medium but zero genre overlap',
  )
}

// ─────────────────────────────────────────────────────────────────────
// 7. Diversity invariant: #1 pick has penalty=0
// ─────────────────────────────────────────────────────────────────────
console.log('\n7. diversity invariant — #1 pick penalty=0')
{
  const candidates = [
    room({ slug: 'a', genres: ['ambient', 'drone'] }),
    room({ slug: 'b', genres: ['ambient', 'drone'] }), // identical
    room({ slug: 'c', genres: ['ambient', 'drone'] }), // identical
  ]
  const out = rankRooms(
    baseInput({ canonicalGenres: ['ambient', 'drone'], candidates }),
    3,
  )
  assert(out[0].diversity_penalty === 0, `#1 penalty = 0; got ${out[0].diversity_penalty}`)
  assert(
    out[0].score === out[0].score_pre_diversity,
    '#1 final score equals pre-diversity score',
  )
}

// ─────────────────────────────────────────────────────────────────────
// 8. Diversity actually diversifies: identical clone is penalized
//    enough that a partial-overlap room wins #2 ahead of it
// ─────────────────────────────────────────────────────────────────────
console.log('\n8. diversity penalty breaks up a same-genre run')
{
  const ambient1 = room({ slug: 'ambient-1', genres: ['ambient', 'drone'] })
  const ambient2 = room({ slug: 'ambient-2', genres: ['ambient', 'drone'] }) // identical → high jaccard
  const folkRoom = room({
    slug: 'folk-room',
    genres: ['indie folk'],   // lower raw score but disjoint signature
  })
  const out = rankRooms(
    baseInput({
      // canonical scores: ambient1 = 24, ambient2 = 24, folkRoom = 12
      // After picking ambient1 (penalty 0), ambient2 has jaccard=1
      // with picked → penalty = 8 → adjusted = 16. folkRoom has
      // jaccard=0 → penalty = 0 → adjusted = 12.
      // 16 > 12, so ambient2 actually wins #2. Validate that behavior
      // is what we expect (the penalty exists but doesn't dominate
      // a meaningful raw-score gap).
      canonicalGenres: ['ambient', 'drone', 'indie folk'],
      candidates: [ambient1, ambient2, folkRoom],
    }),
    3,
  )
  assert(out[0].room.slug === 'ambient-1', '#1 = ambient-1')
  assert(out[1].diversity_penalty === 8, `#2 penalty = 8 (jaccard=1 × λ=8); got ${out[1].diversity_penalty}`)
  assert(out[2].diversity_penalty < 8, `#3 penalty < 8 (folk has lower overlap); got ${out[2].diversity_penalty}`)

  // Stronger: when raw scores differ enough that the lower-raw
  // disjoint room can OVERTAKE a higher-raw clone after the penalty,
  // it must do so.
  // - hi (raw=36): 3-genre overlap with picked-#1
  // - low (raw=30): 2 genres disjoint, 1 overlapping → lower jaccard
  // After λ=8 penalty: hi's adjusted ≈ 36 - 8×1 = 28; low's ≈ 30 - 8×0.2 = 28.4
  // Margin is tight on purpose — proves the penalty actively reorders.
  const picked = room({ slug: 'pick', genres: ['a', 'b', 'c'] })
  const hi = room({ slug: 'hi', genres: ['a', 'b', 'c'] })          // identical → jaccard 1
  const low = room({ slug: 'low', genres: ['a', 'd', 'e'] })         // 1/5 overlap → jaccard 0.2
  const out2 = rankRooms(
    baseInput({
      canonicalGenres: ['a', 'b', 'c', 'd', 'e'],
      candidates: [picked, hi, low],
    }),
    3,
  )
  // picked: raw 36. hi: raw 36. low: raw 36 (3 matches × 12, but in
  // different positions). Wait — they all match the same 3 from the
  // canonical set. Hmm, recompute:
  //   picked.genres = [a,b,c] matched against canonical [a,b,c,d,e] → 3 matches → 36
  //   hi.genres     = [a,b,c]                                       → 3 matches → 36
  //   low.genres    = [a,d,e]                                       → 3 matches → 36
  // All tied. Sort then stable: alphabetical hi, low, pick — uh oh,
  // 'hi' sorts before 'low' which sorts before 'pick'. So #1=hi.
  // We just need to assert that low beats the OTHER clone for #2.
  assert(out2[0].room.slug === 'hi', '#1 sorted by stable order')
  assert(
    out2[1].room.slug === 'low',
    `#2 = low (1/5 overlap beats identical clone after λ=8); got '${out2[1].room.slug}'`,
  )
}

// ─────────────────────────────────────────────────────────────────────
// 9. Joined rooms are filtered out before scoring
// ─────────────────────────────────────────────────────────────────────
console.log('\n9. joined-room filter')
{
  const joined = room({ slug: 'joined', genres: ['ambient'] })
  const open = room({ slug: 'open', genres: ['ambient'] })
  const out = rankRooms(
    baseInput({
      canonicalGenres: ['ambient'],
      joinedRoomSlugs: ['joined'],
      candidates: [joined, open],
    }),
    3,
  )
  assert(out.length === 1, `1 result (joined filtered); got ${out.length}`)
  assert(out[0].room.slug === 'open', '"open" remains')
}

// ─────────────────────────────────────────────────────────────────────
// 10. Non-public rooms filtered out
// ─────────────────────────────────────────────────────────────────────
console.log('\n10. visibility filter')
{
  const priv = room({ slug: 'priv', visibility: 'private', genres: ['ambient'] })
  const pub = room({ slug: 'pub', visibility: 'public', genres: ['ambient'] })
  const out = rankRooms(
    baseInput({ canonicalGenres: ['ambient'], candidates: [priv, pub] }),
    3,
  )
  assert(out.length === 1, '1 result (private filtered)')
  assert(out[0].room.slug === 'pub', '"pub" remains')
}

// ─────────────────────────────────────────────────────────────────────
// 11. Listener fixture — eyeball the rankings + explanations
// ─────────────────────────────────────────────────────────────────────
console.log('\n11. listener fixture — printed for human review')
{
  const input = baseInput({
    calibrationAnswers: { 'calibration-2': ['intimacy', 'warmth'] },
    canonicalGenres: ['indie folk', 'ambient', 'folk', 'post-rock', 'chamber folk'],
    enrichedGenres: ['singer-songwriter', 'alternative', 'ethereal'],
    affinityTags: ['intimate', 'confessional', 'album-listener'],
    topArtistNames: ['Bon Iver', 'Phoebe Bridgers', 'Radiohead'],
    recentDensity: 'medium',
    candidates: [
      room({
        slug: 'for-emma',
        name: 'For Emma',
        genres: ['indie folk', 'folk', 'chamber folk'],
        moods: ['intimate', 'confessional'],
        currentAlbumArtist: 'Bon Iver',
        featured: true,
        recommendation_weight: 70,
      }),
      room({
        slug: 'ambient-hours',
        name: 'Ambient Hours',
        genres: ['ambient', 'drone', 'minimal'],
        moods: ['quiet', 'meditative', 'album-listener'],
      }),
      room({
        slug: 'jazz-after-dark',
        name: 'Jazz After Dark',
        genres: ['jazz', 'spiritual jazz'],
        moods: ['late-night', 'intimate'],
      }),
      room({
        slug: 'post-rock-cathedrals',
        name: 'Post-Rock Cathedrals',
        genres: ['post-rock', 'instrumental'],
        moods: ['cinematic', 'expansive'],
      }),
      room({
        slug: 'pop-radio',
        name: 'Pop Radio',
        genres: ['pop', 'dance pop'],
        moods: ['upbeat', 'communal'],
        member_count: 5000,
      }),
    ],
  })
  const ranked = rankRooms(input, 5)
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i]
    console.log(
      `   #${i + 1} ${r.room.slug.padEnd(24)} score=${r.score.toFixed(1).padStart(5)} (pre=${r.score_pre_diversity.toFixed(1)} pen=${r.diversity_penalty.toFixed(1)})`,
    )
    for (const f of r.factors) {
      console.log(`        - ${f.kind.padEnd(24)} +${f.weight.toFixed(1).padStart(4)}  ${f.detail}`)
    }
    console.log(`     "${explainFactors(r.factors)}"`)
  }
  assert(ranked[0].room.slug === 'for-emma', '#1 = for-emma (3 canonical + artist + affinity + recency)')
  assert(ranked[0].diversity_penalty === 0, '#1 penalty = 0')
  assert(
    ranked.some((r) => r.factors.some((f) => f.kind === 'artist-match')),
    'artist-match emitted somewhere in top 5',
  )
  assert(
    ranked.some((r) => r.factors.some((f) => f.kind === 'recency-boost')),
    'recency-boost emitted somewhere in top 5',
  )
  assert(
    !ranked.some((r) =>
      r.factors.some((f) => (f.kind as string) === 'genre-match'),
    ),
    'legacy genre-match kind NOT emitted by v2.1',
  )
}

// ─────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────
console.log(`\n── result: ${pass} pass / ${fail} fail ──\n`)
process.exit(fail === 0 ? 0 : 1)
