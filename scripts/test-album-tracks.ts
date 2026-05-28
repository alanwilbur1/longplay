/**
 * scripts/test-album-tracks.ts — Phase 6B.5
 *
 * Pure-function tests for formatTrackDuration. The data layer's read
 * + write paths are DB-bound and exercised by manual deploy probes
 * (the hydration script logs counts). The formatter is the only
 * pure-of-React, pure-of-DB piece that warrants automation.
 */

// Import from the tag-less pure module so tsx can resolve it
// without the `server-only` runtime dependency that lib/data/* pulls in.
import { formatTrackDuration } from '../lib/album-tracks-format'

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
  console.log('\n── album track tests ──\n')
  console.log('formatTrackDuration:')

  assert('null → null', formatTrackDuration(null) === null)
  assert('undefined → null', formatTrackDuration(undefined) === null)
  assert('NaN → null', formatTrackDuration(NaN) === null)
  assert('negative → null', formatTrackDuration(-1) === null)
  assert('0 → "0:00"', formatTrackDuration(0) === '0:00')
  assert('1 sec → "0:01"', formatTrackDuration(1000) === '0:01')
  assert('1 min → "1:00"', formatTrackDuration(60 * 1000) === '1:00')
  assert(
    '3:21 (201_000ms) → "3:21"',
    formatTrackDuration(3 * 60 * 1000 + 21 * 1000) === '3:21',
  )
  assert(
    '5:22 (322_000ms) — Wolves Act I+II',
    formatTrackDuration(5 * 60 * 1000 + 22 * 1000) === '5:22',
  )
  // Rounding: 3 min 21.4 sec → "3:21" (rounded to 3:21)
  assert(
    'sub-second rounds nearest',
    formatTrackDuration(3 * 60 * 1000 + 21 * 1000 + 400) === '3:21',
  )
  assert(
    'sub-second rounds up',
    formatTrackDuration(3 * 60 * 1000 + 21 * 1000 + 600) === '3:22',
  )
  // Hour-spanning compositions (e.g. Disintegration Loops disc 1)
  assert(
    '1h 2m 15s → "1:02:15"',
    formatTrackDuration(3600 * 1000 + 2 * 60 * 1000 + 15 * 1000) === '1:02:15',
  )
  assert(
    'exactly 1 hour → "1:00:00"',
    formatTrackDuration(3600 * 1000) === '1:00:00',
  )
  assert(
    'just under 1 hour → "59:59"',
    formatTrackDuration(3600 * 1000 - 1000) === '59:59',
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
