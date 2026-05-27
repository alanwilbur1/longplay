/**
 * scripts/test-identity-drift.ts — Phase 6A.9
 *
 * Pure tests for the drift computation and decision rules. No DB.
 * Covers:
 *   - computeDrift: trait threshold, archetype transition, genre
 *     emergence/fading, room emergence/fading, window_days math
 *   - has_meaningful_change flag is correctly true/false
 *   - shouldAppendHistory rules: first row, change-triggered,
 *     time-triggered, skip-when-stable
 *   - drift-presentation: sentence formatting per direction +
 *     magnitude band, archetype transition formatting, windowDays
 *     phrase bucketing
 *   - determinism: same inputs → byte-identical output
 *
 * Run: npm run test:identity-drift
 */

import {
  ARCHETYPE_CONFIDENCE_THRESHOLD,
  computeDrift,
  shouldAppendHistory,
  TRAIT_DRIFT_THRESHOLD,
  HISTORY_MIN_DAYS_NO_CHANGE,
  type IdentitySnapshotForDrift,
} from '../lib/identity/drift'
import {
  archetypeTransitionSentence,
  driftSummaryLines,
  traitDriftSentence,
  windowDaysPhrase,
} from '../lib/identity/drift-presentation'
import { TRAIT_KEYS, type TraitKey } from '../lib/identity/traits'

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

// Helper builders ───────────────────────────────────────────────
function fullTraitSnap(
  overrides: Partial<Record<TraitKey, number>>,
): IdentitySnapshotForDrift['trait_snapshot'] {
  const out: Record<string, { score: number | null; band: 'low' | 'medium' | 'high' | 'unknown' }> = {}
  for (const k of TRAIT_KEYS) {
    const score = overrides[k] ?? null
    out[k] = {
      score,
      band:
        score === null
          ? 'unknown'
          : score < 0.33
            ? 'low'
            : score < 0.66
              ? 'medium'
              : 'high',
    }
  }
  return out as IdentitySnapshotForDrift['trait_snapshot']
}

function snapshot(opts: {
  at?: string
  primary?: { key: string; label: string; conf: number } | null
  traits?: Partial<Record<TraitKey, number>>
  genres?: Array<{ genre: string; weighted_score: number }>
  rooms?: Array<{ room_id: string; slug?: string; name?: string; score: number }>
}): IdentitySnapshotForDrift {
  return {
    snapshot_at: opts.at ?? '2026-05-01T00:00:00.000Z',
    primary_archetype_key: opts.primary?.key ?? null,
    primary_confidence: opts.primary?.conf ?? null,
    archetypes: opts.primary
      ? [
          {
            archetype_key: opts.primary.key,
            archetype_label: opts.primary.label,
            confidence_score: opts.primary.conf,
            rank: 1,
          },
        ]
      : [],
    trait_snapshot: fullTraitSnap(opts.traits ?? {}),
    top_genres: opts.genres ?? [],
    top_rooms: (opts.rooms ?? []).map((r) => ({
      room_id: r.room_id,
      slug: r.slug ?? null,
      name: r.name ?? null,
      score: r.score,
    })),
  }
}

console.log('\n── identity drift tests ──\n')

// ── trait drift thresholds ──────────────────────────────────────
console.log('computeDrift / trait threshold:')
{
  // 0.16 delta — clears 0.15 threshold
  const prev = snapshot({ traits: { nocturnal_score: 0.4 } })
  const curr = snapshot({
    at: '2026-05-08T00:00:00.000Z',
    traits: { nocturnal_score: 0.56 },
  })
  const d = computeDrift(prev, curr)
  assert('0.16 delta registers as rising', d.rising_traits.length === 1)
  assert('correct trait', d.rising_traits[0]?.trait_key === 'nocturnal_score')
  assert('delta sign positive', d.rising_traits[0]?.delta === 0.16)
  assert('window_days = 7', d.window_days === 7)
  assert('has_meaningful_change=true', d.has_meaningful_change === true)
}
{
  // 0.14 delta — below threshold
  const prev = snapshot({ traits: { nocturnal_score: 0.4 } })
  const curr = snapshot({
    at: '2026-05-08T00:00:00.000Z',
    traits: { nocturnal_score: 0.54 },
  })
  const d = computeDrift(prev, curr)
  assert('0.14 delta is below threshold', d.rising_traits.length === 0)
}
{
  // Falling direction sorted by magnitude
  const prev = snapshot({
    traits: { obscurity_score: 0.8, exploratory_score: 0.7 },
  })
  const curr = snapshot({
    at: '2026-05-08T00:00:00.000Z',
    traits: { obscurity_score: 0.4, exploratory_score: 0.5 },
  })
  const d = computeDrift(prev, curr)
  assert('two traits fell', d.falling_traits.length === 2)
  assert(
    'obscurity drop (-0.4) sorts first by |delta|',
    d.falling_traits[0]?.trait_key === 'obscurity_score',
  )
  assert('all rising empty', d.rising_traits.length === 0)
}
{
  // Same input twice → same output (determinism)
  const prev = snapshot({ traits: { nocturnal_score: 0.4 } })
  const curr = snapshot({
    at: '2026-05-08T00:00:00.000Z',
    traits: { nocturnal_score: 0.6 },
  })
  const a = JSON.stringify(computeDrift(prev, curr))
  const b = JSON.stringify(computeDrift(prev, curr))
  assert('deterministic across re-runs', a === b)
}
{
  // Null score on one side → trait skipped (no fake delta)
  const prev = snapshot({ traits: {} }) // all null
  const curr = snapshot({
    at: '2026-05-08T00:00:00.000Z',
    traits: { nocturnal_score: 0.9 },
  })
  const d = computeDrift(prev, curr)
  assert('null-to-value skipped (no fake delta)', d.rising_traits.length === 0)
}

// ── archetype transition ────────────────────────────────────────
console.log('\ncomputeDrift / archetype transition:')
{
  const prev = snapshot({
    primary: { key: 'nocturnal-explorer', label: 'The Nocturnal Explorer', conf: 0.7 },
  })
  const curr = snapshot({
    at: '2026-05-08T00:00:00.000Z',
    primary: { key: 'album-loyalist', label: 'The Album Loyalist', conf: 0.65 },
  })
  const d = computeDrift(prev, curr)
  assert(
    'transition recorded',
    d.archetype_transition?.from_key === 'nocturnal-explorer' &&
      d.archetype_transition?.to_key === 'album-loyalist',
  )
  assert(
    'labels preserved',
    d.archetype_transition?.from_label === 'The Nocturnal Explorer' &&
      d.archetype_transition?.to_label === 'The Album Loyalist',
  )
  assert(
    'confidence_change null when archetype changes',
    d.archetype_confidence_change === null,
  )
  assert('has_meaningful_change=true', d.has_meaningful_change === true)
}
{
  // Same archetype, confidence rose
  const prev = snapshot({
    primary: { key: 'a', label: 'A', conf: 0.55 },
  })
  const curr = snapshot({
    at: '2026-05-08T00:00:00.000Z',
    primary: { key: 'a', label: 'A', conf: 0.78 },
  })
  const d = computeDrift(prev, curr)
  assert('no transition recorded', d.archetype_transition === null)
  assert(
    'confidence_change = 0.23',
    Math.abs((d.archetype_confidence_change ?? 0) - 0.23) < 0.001,
  )
  // 0.23 clears the 0.1 threshold
  assert('clears confidence threshold', Math.abs(d.archetype_confidence_change ?? 0) >= ARCHETYPE_CONFIDENCE_THRESHOLD)
}
{
  // Confidence change below threshold but archetype unchanged →
  // confidence_change is reported but doesn't trip has_meaningful_change
  // (unless something else also changes).
  const prev = snapshot({
    primary: { key: 'a', label: 'A', conf: 0.6 },
  })
  const curr = snapshot({
    at: '2026-05-08T00:00:00.000Z',
    primary: { key: 'a', label: 'A', conf: 0.65 },
  })
  const d = computeDrift(prev, curr)
  assert('small confidence delta still recorded', d.archetype_confidence_change === 0.05)
  assert(
    'small delta + no other changes → not meaningful',
    d.has_meaningful_change === false,
  )
}

// ── genre + room emergence ──────────────────────────────────────
console.log('\ncomputeDrift / genres + rooms:')
{
  const prev = snapshot({
    genres: [
      { genre: 'indie folk', weighted_score: 2 },
      { genre: 'ambient', weighted_score: 1 },
    ],
  })
  const curr = snapshot({
    at: '2026-05-08T00:00:00.000Z',
    genres: [
      { genre: 'indie folk', weighted_score: 2 },
      { genre: 'spiritual jazz', weighted_score: 1.5 },
    ],
  })
  const d = computeDrift(prev, curr)
  assert(
    'spiritual jazz emerged',
    d.emerging_genres.length === 1 && d.emerging_genres[0].genre === 'spiritual jazz',
  )
  assert(
    'ambient faded',
    d.fading_genres.length === 1 && d.fading_genres[0].genre === 'ambient',
  )
  assert('has_meaningful_change=true', d.has_meaningful_change === true)
}
{
  const prev = snapshot({
    rooms: [{ room_id: 'r1', slug: 'a', score: 30 }],
  })
  const curr = snapshot({
    at: '2026-05-08T00:00:00.000Z',
    rooms: [{ room_id: 'r2', slug: 'b', score: 35 }],
  })
  const d = computeDrift(prev, curr)
  assert(
    'r2 emerged',
    d.emerging_rooms.length === 1 && d.emerging_rooms[0].room_id === 'r2',
  )
  assert(
    'r1 faded',
    d.fading_rooms.length === 1 && d.fading_rooms[0].room_id === 'r1',
  )
}

// ── window_days ────────────────────────────────────────────────
console.log('\ncomputeDrift / window_days:')
assert(
  '7-day window',
  computeDrift(
    snapshot({ at: '2026-05-01T00:00:00.000Z' }),
    snapshot({ at: '2026-05-08T00:00:00.000Z' }),
  ).window_days === 7,
)
assert(
  'same instant → 0 days',
  computeDrift(
    snapshot({ at: '2026-05-01T00:00:00.000Z' }),
    snapshot({ at: '2026-05-01T00:00:00.000Z' }),
  ).window_days === 0,
)

// ── shouldAppendHistory ────────────────────────────────────────
console.log('\nshouldAppendHistory:')
assert(
  'no previous → always append',
  shouldAppendHistory({ hasPrevious: false, drift: null }) === true,
)
{
  const stable: ReturnType<typeof computeDrift> = {
    archetype_transition: null,
    archetype_confidence_change: null,
    rising_traits: [],
    falling_traits: [],
    emerging_genres: [],
    fading_genres: [],
    emerging_rooms: [],
    fading_rooms: [],
    window_days: 2,
    has_meaningful_change: false,
  }
  assert(
    'no change + window=2 → skip',
    shouldAppendHistory({ hasPrevious: true, drift: stable }) === false,
  )
  assert(
    `no change + window=${HISTORY_MIN_DAYS_NO_CHANGE} → append (time-triggered)`,
    shouldAppendHistory({
      hasPrevious: true,
      drift: { ...stable, window_days: HISTORY_MIN_DAYS_NO_CHANGE },
    }) === true,
  )
}
{
  // Meaningful change always appends, regardless of window
  const changed: ReturnType<typeof computeDrift> = {
    archetype_transition: null,
    archetype_confidence_change: null,
    rising_traits: [{ trait_key: 'nocturnal_score', prev_score: 0.4, curr_score: 0.6, delta: 0.2 }],
    falling_traits: [],
    emerging_genres: [],
    fading_genres: [],
    emerging_rooms: [],
    fading_rooms: [],
    window_days: 1,
    has_meaningful_change: true,
  }
  assert(
    'meaningful change + window=1 → append',
    shouldAppendHistory({ hasPrevious: true, drift: changed }) === true,
  )
}

// ── trait drift sentences ──────────────────────────────────────
console.log('\ntraitDriftSentence:')
{
  const s1 = traitDriftSentence({
    trait_key: 'nocturnal_score',
    prev_score: 0.3,
    curr_score: 0.5,
    delta: 0.2,
  })
  assert('0.20 rising → "rose"', /rose(?! noticeably)/.test(s1), s1)
  const s2 = traitDriftSentence({
    trait_key: 'nocturnal_score',
    prev_score: 0.3,
    curr_score: 0.65,
    delta: 0.35,
  })
  assert('0.35 rising → "rose noticeably"', s2.includes('rose noticeably'))
  const s3 = traitDriftSentence({
    trait_key: 'nocturnal_score',
    prev_score: 0.3,
    curr_score: 0.46,
    delta: 0.16,
  })
  assert('0.16 rising → "edged up"', s3.includes('edged up'))
  const s4 = traitDriftSentence({
    trait_key: 'album_focus_score',
    prev_score: 0.7,
    curr_score: 0.3,
    delta: -0.4,
  })
  assert(
    '-0.40 falling → "eased noticeably"',
    s4.includes('eased noticeably'),
  )
  assert('label is "Album focus"', s4.startsWith('Album focus'))
}

// ── archetype transition sentences ──────────────────────────────
console.log('\narchetypeTransitionSentence:')
assert(
  'both → arrow',
  archetypeTransitionSentence({
    from_key: 'a',
    from_label: 'A',
    to_key: 'b',
    to_label: 'B',
  }) === 'A → B',
)
assert(
  'only to → "Now: B"',
  archetypeTransitionSentence({
    from_key: null,
    from_label: null,
    to_key: 'b',
    to_label: 'B',
  }) === 'Now: B',
)
assert(
  'only from → "Last identified: A"',
  archetypeTransitionSentence({
    from_key: 'a',
    from_label: 'A',
    to_key: null,
    to_label: null,
  }) === 'Last identified: A',
)
assert(
  'neither → ""',
  archetypeTransitionSentence({
    from_key: null,
    from_label: null,
    to_key: null,
    to_label: null,
  }) === '',
)

// ── windowDaysPhrase bucketing ────────────────────────────────
console.log('\nwindowDaysPhrase:')
assert('0 → "recently"', windowDaysPhrase(0) === 'recently')
assert('1 → "since yesterday"', windowDaysPhrase(1) === 'since yesterday')
assert('2 → "since 2 days ago"', windowDaysPhrase(2) === 'since 2 days ago')
assert('7 → "over the last 7 days"', windowDaysPhrase(7) === 'over the last 7 days')
assert(
  '14 → "over the last 2 weeks"',
  windowDaysPhrase(14) === 'over the last 2 weeks',
)
assert(
  '30 → "over the last 1 month"',
  windowDaysPhrase(30) === 'over the last 1 month',
)
assert(
  '180 → "over the last 6 months"',
  windowDaysPhrase(180) === 'over the last 6 months',
)

// ── driftSummaryLines composition ─────────────────────────────
console.log('\ndriftSummaryLines:')
{
  // Archetype transition + two trait drifts → up to 3 lines.
  const lines = driftSummaryLines({
    archetype_transition: {
      from_key: 'a',
      from_label: 'A',
      to_key: 'b',
      to_label: 'B',
    },
    archetype_confidence_change: null,
    rising_traits: [
      { trait_key: 'nocturnal_score', prev_score: 0.3, curr_score: 0.55, delta: 0.25 },
    ],
    falling_traits: [
      { trait_key: 'recency_bias_score', prev_score: 0.7, curr_score: 0.5, delta: -0.2 },
    ],
    emerging_genres: [{ genre: 'jazz', weighted_score: 1 }],
    fading_genres: [],
    emerging_rooms: [],
    fading_rooms: [],
    window_days: 7,
    has_meaningful_change: true,
  })
  assert('emits 3 lines', lines.length === 3)
  assert('first line is transition', lines[0].includes('→'))
  // Archetype transition was emitted → no emerging-genres line
  // (covered above clause). Just verify length cap.
  assert('lines capped at 3', lines.length <= 3)
}
{
  // No drift → empty array.
  const lines = driftSummaryLines({
    archetype_transition: null,
    archetype_confidence_change: null,
    rising_traits: [],
    falling_traits: [],
    emerging_genres: [],
    fading_genres: [],
    emerging_rooms: [],
    fading_rooms: [],
    window_days: 7,
    has_meaningful_change: false,
  })
  assert('empty drift → empty lines', lines.length === 0)
}

// ── threshold constants exposed ───────────────────────────────
console.log('\nthreshold constants:')
assert(
  `TRAIT_DRIFT_THRESHOLD === 0.15`,
  TRAIT_DRIFT_THRESHOLD === 0.15,
)
assert(
  `ARCHETYPE_CONFIDENCE_THRESHOLD === 0.1`,
  ARCHETYPE_CONFIDENCE_THRESHOLD === 0.1,
)
assert(
  `HISTORY_MIN_DAYS_NO_CHANGE === 7`,
  HISTORY_MIN_DAYS_NO_CHANGE === 7,
)

console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
