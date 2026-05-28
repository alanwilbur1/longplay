/**
 * scripts/test-ritual-observations.ts — Phase 6B.3
 *
 * Pure-function tests for lib/ritual/observations.ts. No DB, no
 * fetch. Asserts:
 *   - bucketHourOfDay correctly maps UTC hours into the four
 *     editorial buckets (late_night / morning / afternoon / evening)
 *   - detectTimeOfDayCluster honors minSample and minShare gates
 *   - averageCompletionDays returns null below the sample threshold
 *     and the correct average above it
 *   - deriveCycleObservations:
 *     - returns empty for an empty cycle
 *     - emits the headline count line whenever participation > 0
 *     - emits the time-of-day signal only with sufficient sample
 *     - emits a pacing signal only when the average is decisive
 *   - relativeDaysUntil handles today/tomorrow/in-N-days/past/distant
 *
 * Run: npm run test:ritual-observations
 */

import {
  averageCompletionDays,
  bucketHourOfDay,
  deriveCycleObservations,
  detectTimeOfDayCluster,
  participationCounts,
  relativeDaysUntil,
  timeOfDayPhrase,
} from '../lib/ritual/observations'
import type { RitualParticipantState } from '../lib/ritual/types'

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

async function main() {
  console.log('\n── ritual observations tests ──\n')

  // ── bucketHourOfDay ────────────────────────────────────────────
  console.log('bucketHourOfDay:')
  assert('00:30 UTC → late_night', bucketHourOfDay('2026-06-01T00:30:00Z') === 'late_night')
  assert('05:59 UTC → late_night', bucketHourOfDay('2026-06-01T05:59:00Z') === 'late_night')
  assert('06:00 UTC → morning', bucketHourOfDay('2026-06-01T06:00:00Z') === 'morning')
  assert('11:59 UTC → morning', bucketHourOfDay('2026-06-01T11:59:00Z') === 'morning')
  assert('12:00 UTC → afternoon', bucketHourOfDay('2026-06-01T12:00:00Z') === 'afternoon')
  assert('17:59 UTC → afternoon', bucketHourOfDay('2026-06-01T17:59:00Z') === 'afternoon')
  assert('18:00 UTC → evening', bucketHourOfDay('2026-06-01T18:00:00Z') === 'evening')
  assert('23:59 UTC → evening', bucketHourOfDay('2026-06-01T23:59:00Z') === 'evening')
  assert('malformed → null', bucketHourOfDay('not-a-date') === null)

  // ── timeOfDayPhrase ───────────────────────────────────────────
  console.log('\ntimeOfDayPhrase:')
  assert("late_night → 'late at night'", timeOfDayPhrase('late_night') === 'late at night')
  assert("evening → 'in the evening'", timeOfDayPhrase('evening') === 'in the evening')

  // ── detectTimeOfDayCluster ────────────────────────────────────
  console.log('\ndetectTimeOfDayCluster:')
  // 4 reflections all in evening — below the default minSample of 5.
  const four = [
    '2026-06-01T19:00:00Z',
    '2026-06-01T20:00:00Z',
    '2026-06-01T21:00:00Z',
    '2026-06-01T22:00:00Z',
  ]
  assert(
    'sample of 4 → null (below minSample)',
    detectTimeOfDayCluster(four) === null,
  )
  // 5 reflections all in evening — above threshold, share=1.0.
  const fiveEvening = [...four, '2026-06-01T23:00:00Z']
  const cluster1 = detectTimeOfDayCluster(fiveEvening)
  assert('5 evening reflections → evening cluster', cluster1?.bucket === 'evening')
  assert('share = 1.0', cluster1?.share === 1)
  assert('count = 5', cluster1?.count === 5)
  // 5 reflections evenly split across buckets — no dominant cluster.
  const split = [
    '2026-06-01T02:00:00Z', // late_night
    '2026-06-01T08:00:00Z', // morning
    '2026-06-01T14:00:00Z', // afternoon
    '2026-06-01T20:00:00Z', // evening
    '2026-06-01T22:00:00Z', // evening
  ]
  assert(
    'evenly split sample → null (no majority)',
    detectTimeOfDayCluster(split) === null,
  )
  // 6 reflections — 4 evening + 2 spread — share = 4/6 > 0.5, returns evening.
  const sixSkewed = [
    '2026-06-01T07:00:00Z',
    '2026-06-01T15:00:00Z',
    '2026-06-01T19:00:00Z',
    '2026-06-01T20:00:00Z',
    '2026-06-01T21:00:00Z',
    '2026-06-01T22:00:00Z',
  ]
  const cluster3 = detectTimeOfDayCluster(sixSkewed)
  assert('4/6 evening → evening cluster', cluster3?.bucket === 'evening')
  assert('share = 0.6667', Math.abs((cluster3?.share ?? 0) - 4 / 6) < 1e-9)
  // Custom thresholds.
  assert(
    'minShare=0.9 + 6 with 4 evening → null',
    detectTimeOfDayCluster(sixSkewed, { minShare: 0.9 }) === null,
  )

  // ── averageCompletionDays ────────────────────────────────────
  console.log('\naverageCompletionDays:')
  assert(
    'empty sample → null',
    averageCompletionDays([]) === null,
  )
  const threeCompleted = [
    { joined_at: '2026-06-01T00:00:00Z', completed_at: '2026-06-02T00:00:00Z' },
    { joined_at: '2026-06-01T00:00:00Z', completed_at: '2026-06-03T00:00:00Z' },
    { joined_at: '2026-06-01T00:00:00Z', completed_at: '2026-06-04T00:00:00Z' },
  ]
  assert(
    'sample of 3 → null (default minSample=4)',
    averageCompletionDays(threeCompleted) === null,
  )
  const fourCompleted = [
    ...threeCompleted,
    { joined_at: '2026-06-01T00:00:00Z', completed_at: '2026-06-05T00:00:00Z' },
  ]
  assert(
    'sample of 4 → average 2.5 days',
    averageCompletionDays(fourCompleted) === 2.5,
  )
  // Participants without completed_at are ignored.
  const mixed = [
    ...fourCompleted,
    { joined_at: '2026-06-01T00:00:00Z', completed_at: null },
    { joined_at: '2026-06-01T00:00:00Z', completed_at: null },
  ]
  assert(
    'null completed_at ignored',
    averageCompletionDays(mixed) === 2.5,
  )
  // Negative deltas (completed before joined) ignored.
  const invalid = [
    ...fourCompleted,
    { joined_at: '2026-06-10T00:00:00Z', completed_at: '2026-06-05T00:00:00Z' },
  ]
  assert(
    'completed_at before joined_at ignored',
    averageCompletionDays(invalid) === 2.5,
  )

  // ── participationCounts ───────────────────────────────────────
  console.log('\nparticipationCounts:')
  const mixedStates: { state: RitualParticipantState }[] = [
    { state: 'joined' },
    { state: 'joined' },
    { state: 'listening' },
    { state: 'completed' },
    { state: 'reflected' },
    { state: 'withdrawn' },
  ]
  const c = participationCounts(mixedStates)
  assert('joined=2', c.joined === 2)
  assert('listening=1', c.listening === 1)
  assert('completed=1', c.completed === 1)
  assert('reflected=1', c.reflected === 1)
  assert('withdrawn=1', c.withdrawn === 1)

  // ── deriveCycleObservations ──────────────────────────────────
  console.log('\nderiveCycleObservations:')
  assert(
    'empty cycle → [] (suppresses entire section)',
    deriveCycleObservations({
      cycle_number: 1,
      participants: [],
      publishedReflections: [],
    }).length === 0,
  )
  const oneListenerLines = deriveCycleObservations({
    cycle_number: 1,
    participants: [{ joined_at: '2026-06-01T00:00:00Z', completed_at: null, reflected_at: null, state: 'joined' }],
    publishedReflections: [],
  })
  assert(
    'single listener → one line, singular phrasing',
    oneListenerLines.length === 1 &&
      oneListenerLines[0].startsWith('One listener'),
  )
  const fiveLine = deriveCycleObservations({
    cycle_number: 1,
    participants: Array.from({ length: 5 }, () => ({
      joined_at: '2026-06-01T00:00:00Z',
      completed_at: null,
      reflected_at: null,
      state: 'joined' as RitualParticipantState,
    })),
    publishedReflections: [],
  })
  assert(
    '5 joined, 0 reflections → headline only, no time signal',
    fiveLine.length === 1 && fiveLine[0].includes('5 listeners'),
  )
  const richLines = deriveCycleObservations({
    cycle_number: 3,
    participants: [
      { joined_at: '2026-06-01T00:00:00Z', completed_at: '2026-06-05T00:00:00Z', reflected_at: null, state: 'completed' },
      { joined_at: '2026-06-01T00:00:00Z', completed_at: '2026-06-05T00:00:00Z', reflected_at: null, state: 'completed' },
      { joined_at: '2026-06-01T00:00:00Z', completed_at: '2026-06-06T00:00:00Z', reflected_at: null, state: 'completed' },
      { joined_at: '2026-06-01T00:00:00Z', completed_at: '2026-06-06T00:00:00Z', reflected_at: null, state: 'completed' },
      { joined_at: '2026-06-01T00:00:00Z', completed_at: null, reflected_at: null, state: 'joined' },
    ],
    publishedReflections: [
      { created_at: '2026-06-05T20:00:00Z' },
      { created_at: '2026-06-05T21:00:00Z' },
      { created_at: '2026-06-05T22:00:00Z' },
      { created_at: '2026-06-06T19:00:00Z' },
      { created_at: '2026-06-06T20:00:00Z' },
    ],
  })
  assert(
    'rich cycle → headline + evening cluster + slow pacing',
    richLines.length === 3,
  )
  assert(
    'rich cycle includes "in the evening"',
    richLines.some((l) => l.includes('in the evening')),
  )
  assert(
    'rich cycle includes "listens slowly"',
    richLines.some((l) => l.includes('listens slowly')),
  )

  // ── relativeDaysUntil ────────────────────────────────────────
  console.log('\nrelativeDaysUntil:')
  const ref = '2026-06-01T12:00:00Z'
  assert(
    'same day → today',
    relativeDaysUntil('2026-06-01T23:00:00Z', ref) === 'today',
  )
  assert(
    'next day → tomorrow',
    relativeDaysUntil('2026-06-02T01:00:00Z', ref) === 'tomorrow',
  )
  assert(
    '3 days out → in 3 days',
    relativeDaysUntil('2026-06-04T12:00:00Z', ref) === 'in 3 days',
  )
  assert(
    '6 days out → in 6 days',
    relativeDaysUntil('2026-06-07T12:00:00Z', ref) === 'in 6 days',
  )
  assert(
    '7 days out → null (caller falls back to absolute date)',
    relativeDaysUntil('2026-06-08T12:00:00Z', ref) === null,
  )
  assert(
    'past day → null',
    relativeDaysUntil('2026-05-30T12:00:00Z', ref) === null,
  )
  assert(
    'malformed target → null',
    relativeDaysUntil('not-a-date', ref) === null,
  )

  console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
  if (fail > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('test failed:', err)
  process.exit(1)
})
