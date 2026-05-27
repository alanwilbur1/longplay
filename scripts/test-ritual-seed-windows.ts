/**
 * scripts/test-ritual-seed-windows.ts — Phase 6B.2
 *
 * Pure-function tests for lib/ritual/seed-windows.ts. The seed
 * script depends entirely on this math being right; getting Monday-
 * 00:00-UTC wrong would shift every cycle window by a day.
 *
 * Run: npm run test:ritual-seed-windows
 */

import {
  mondayOnOrBefore,
  seedWeekWindows,
  weekWindowFromMonday,
} from '../lib/ritual/seed-windows'

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
  console.log('\n── ritual seed-window tests ──\n')

  // ── mondayOnOrBefore ─────────────────────────────────────────
  console.log('mondayOnOrBefore:')
  // 2026-05-25 is a Monday (verified externally).
  const mondayIso = '2026-05-25T00:00:00.000Z'
  const tuesdayIso = '2026-05-26T15:30:00.000Z'
  const sundayIso = '2026-05-31T22:00:00.000Z'

  assert(
    'Monday → same Monday',
    mondayOnOrBefore(mondayIso).toISOString() === mondayIso,
  )
  assert(
    'Tuesday → previous Monday',
    mondayOnOrBefore(tuesdayIso).toISOString() === mondayIso,
  )
  assert(
    'Sunday → previous Monday',
    mondayOnOrBefore(sundayIso).toISOString() === mondayIso,
  )
  assert(
    'accepts Date input',
    mondayOnOrBefore(new Date(tuesdayIso)).toISOString() === mondayIso,
  )
  assert(
    'accepts epoch ms input',
    mondayOnOrBefore(Date.parse(tuesdayIso)).toISOString() === mondayIso,
  )

  // Boundary: Sunday 23:59 UTC should still resolve to the prior
  // Monday, not the next day. Tests inclusive Monday + exclusive
  // next-Monday boundary.
  assert(
    'Sunday 23:59:59.999 → previous Monday',
    mondayOnOrBefore('2026-05-31T23:59:59.999Z').toISOString() === mondayIso,
  )
  assert(
    'next Monday 00:00:00.000 → next Monday',
    mondayOnOrBefore('2026-06-01T00:00:00.000Z').toISOString() ===
      '2026-06-01T00:00:00.000Z',
  )

  // ── weekWindowFromMonday ─────────────────────────────────────
  console.log('\nweekWindowFromMonday:')
  const w = weekWindowFromMonday(new Date(mondayIso))
  assert('starts_at = Monday 00:00', w.starts_at === '2026-05-25T00:00:00.000Z')
  assert(
    'lock_at = Monday + 5d (Saturday 00:00)',
    w.lock_at === '2026-05-30T00:00:00.000Z',
  )
  assert(
    'reflection_opens_at = Monday + 5d',
    w.reflection_opens_at === '2026-05-30T00:00:00.000Z',
  )
  assert(
    'reflection_closes_at = next Monday 00:00',
    w.reflection_closes_at === '2026-06-01T00:00:00.000Z',
  )
  assert(
    'reflection_closes_at == next week starts_at (cycles abut)',
    w.reflection_closes_at ===
      weekWindowFromMonday(new Date('2026-06-01T00:00:00Z')).starts_at,
  )

  // ── seedWeekWindows ─────────────────────────────────────────
  console.log('\nseedWeekWindows:')
  const triple = seedWeekWindows(tuesdayIso)
  assert(
    'archived precedes active (no overlap)',
    triple.archived.reflection_closes_at === triple.active.starts_at,
  )
  assert(
    'active precedes upcoming (no overlap)',
    triple.active.reflection_closes_at === triple.upcoming.starts_at,
  )
  assert(
    'reference inside Tuesday → active window contains reference time',
    Date.parse(triple.active.starts_at) <= Date.parse(tuesdayIso) &&
      Date.parse(tuesdayIso) < Date.parse(triple.active.reflection_closes_at),
  )

  // Determinism across a one-second drift.
  const ref1 = '2026-05-26T15:30:00.000Z'
  const ref2 = '2026-05-26T15:30:01.000Z'
  const w1 = seedWeekWindows(ref1).active
  const w2 = seedWeekWindows(ref2).active
  assert(
    'same week reference → same active window',
    JSON.stringify(w1) === JSON.stringify(w2),
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
