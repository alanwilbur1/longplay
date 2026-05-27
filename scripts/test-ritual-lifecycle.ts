/**
 * scripts/test-ritual-lifecycle.ts — Phase 6B.1
 *
 * Pure-function tests for lib/ritual/lifecycle.ts. No DB, no fetch.
 *
 * Coverage:
 *   - computeCycleStatusForTime boundary semantics (inclusive lower,
 *     exclusive upper)
 *   - validateRitualCycleWindow catches every ordering violation
 *   - shouldRefreshCycleStatus honors the explicit-archive sticky rule
 *   - nextParticipationState transition matrix (legal + illegal,
 *     idempotency, withdrawn-is-sink)
 *   - nextReflectionState transition matrix
 *   - canWriteReflection gate (drafts during active; publish only
 *     during reflection; freeze during archived)
 *   - canJoinCycle gate
 *
 * Run: npm run test:ritual-lifecycle
 */

import {
  canJoinCycle,
  canWriteReflection,
  computeCycleStatusForTime,
  nextParticipationState,
  nextReflectionState,
  shouldRefreshCycleStatus,
  validateRitualCycleWindow,
} from '../lib/ritual/lifecycle'
import type {
  RitualCycleStatus,
  RitualCycleWindow,
  RitualParticipantState,
  RitualReflectionState,
} from '../lib/ritual/types'

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
  console.log('\n── ritual lifecycle tests ──\n')

  // Canonical 7-day cycle window for boundary testing.
  // starts:        2026-06-01T00:00:00Z
  // lock:          2026-06-04T00:00:00Z
  // reflect_opens: 2026-06-04T00:00:00Z   (= lock for this fixture)
  // reflect_close: 2026-06-08T00:00:00Z
  const w: RitualCycleWindow = {
    starts_at: '2026-06-01T00:00:00.000Z',
    lock_at: '2026-06-04T00:00:00.000Z',
    reflection_opens_at: '2026-06-04T00:00:00.000Z',
    reflection_closes_at: '2026-06-08T00:00:00.000Z',
  }

  // ── computeCycleStatusForTime ──────────────────────────────────
  console.log('computeCycleStatusForTime:')
  assert(
    'before starts_at → upcoming',
    computeCycleStatusForTime(w, '2026-05-31T23:59:59.999Z') === 'upcoming',
  )
  assert(
    'exactly at starts_at → active (lower bound inclusive)',
    computeCycleStatusForTime(w, '2026-06-01T00:00:00.000Z') === 'active',
  )
  assert(
    'just before reflection_opens_at → active',
    computeCycleStatusForTime(w, '2026-06-03T23:59:59.999Z') === 'active',
  )
  assert(
    'exactly at reflection_opens_at → reflection (lower bound inclusive)',
    computeCycleStatusForTime(w, '2026-06-04T00:00:00.000Z') === 'reflection',
  )
  assert(
    'just before reflection_closes_at → reflection',
    computeCycleStatusForTime(w, '2026-06-07T23:59:59.999Z') === 'reflection',
  )
  assert(
    'exactly at reflection_closes_at → archived (upper bound exclusive)',
    computeCycleStatusForTime(w, '2026-06-08T00:00:00.000Z') === 'archived',
  )
  assert(
    'long after reflection_closes_at → archived',
    computeCycleStatusForTime(w, '2027-01-01T00:00:00.000Z') === 'archived',
  )

  // Accepts Date / number / ISO string interchangeably.
  assert(
    'accepts Date input',
    computeCycleStatusForTime(w, new Date('2026-06-02T12:00:00Z')) === 'active',
  )
  assert(
    'accepts epoch ms input',
    computeCycleStatusForTime(
      w,
      Date.parse('2026-06-02T12:00:00Z'),
    ) === 'active',
  )

  // ── validateRitualCycleWindow ──────────────────────────────────
  console.log('\nvalidateRitualCycleWindow:')
  assert('canonical window → null (valid)', validateRitualCycleWindow(w) === null)
  assert(
    'lock_at before starts_at → error',
    typeof validateRitualCycleWindow({
      ...w,
      lock_at: '2026-05-30T00:00:00Z',
    }) === 'string',
  )
  assert(
    'reflection_opens_at before lock_at → error',
    typeof validateRitualCycleWindow({
      ...w,
      reflection_opens_at: '2026-06-02T00:00:00Z',
      lock_at: '2026-06-04T00:00:00Z',
    }) === 'string',
  )
  assert(
    'reflection_closes_at before reflection_opens_at → error',
    typeof validateRitualCycleWindow({
      ...w,
      reflection_opens_at: '2026-06-04T00:00:00Z',
      reflection_closes_at: '2026-06-03T00:00:00Z',
    }) === 'string',
  )
  assert(
    'malformed starts_at → error',
    typeof validateRitualCycleWindow({
      ...w,
      starts_at: 'not-a-date',
    }) === 'string',
  )
  assert(
    'starts_at == lock_at == reflection_opens_at (degenerate) → valid (all gates collapse to instant)',
    validateRitualCycleWindow({
      ...w,
      starts_at: '2026-06-01T00:00:00Z',
      lock_at: '2026-06-01T00:00:00Z',
      reflection_opens_at: '2026-06-01T00:00:00Z',
    }) === null,
  )

  // ── shouldRefreshCycleStatus ───────────────────────────────────
  console.log('\nshouldRefreshCycleStatus:')
  assert(
    'persisted=active, time-derived=active → no refresh',
    shouldRefreshCycleStatus('active', null, w, '2026-06-02T12:00:00Z') === false,
  )
  assert(
    'persisted=upcoming, time-derived=active → needs refresh',
    shouldRefreshCycleStatus('upcoming', null, w, '2026-06-02T12:00:00Z') === true,
  )
  assert(
    'persisted=active, time-derived=reflection → needs refresh',
    shouldRefreshCycleStatus('active', null, w, '2026-06-05T12:00:00Z') === true,
  )
  assert(
    'persisted=archived → NEVER refresh (sticky)',
    shouldRefreshCycleStatus('archived', null, w, '2026-06-02T12:00:00Z') === false,
  )
  assert(
    'archived_at set + persisted=active → NEVER refresh (explicit archive sticks)',
    shouldRefreshCycleStatus(
      'active',
      '2026-06-02T12:00:00Z',
      w,
      '2026-06-02T13:00:00Z',
    ) === false,
  )

  // ── nextParticipationState ─────────────────────────────────────
  console.log('\nnextParticipationState (state machine):')
  // Happy path: joined → listening → completed → reflected
  assert(
    'joined + start_listening → listening',
    nextParticipationState('joined', 'start_listening') === 'listening',
  )
  assert(
    'listening + complete → completed',
    nextParticipationState('listening', 'complete') === 'completed',
  )
  assert(
    'completed + reflect → reflected',
    nextParticipationState('completed', 'reflect') === 'reflected',
  )

  // Shortcuts: skip ahead is allowed
  assert(
    'joined + complete → completed (skip listening)',
    nextParticipationState('joined', 'complete') === 'completed',
  )
  assert(
    'joined + reflect → reflected (skip everything)',
    nextParticipationState('joined', 'reflect') === 'reflected',
  )

  // Idempotency: same transition twice is fine
  assert(
    'listening + start_listening → listening (idempotent)',
    nextParticipationState('listening', 'start_listening') === 'listening',
  )
  assert(
    'completed + complete → completed (idempotent)',
    nextParticipationState('completed', 'complete') === 'completed',
  )
  assert(
    'reflected + reflect → reflected (idempotent)',
    nextParticipationState('reflected', 'reflect') === 'reflected',
  )

  // Withdraw can fire from any non-terminal state
  assert(
    'joined + withdraw → withdrawn',
    nextParticipationState('joined', 'withdraw') === 'withdrawn',
  )
  assert(
    'listening + withdraw → withdrawn',
    nextParticipationState('listening', 'withdraw') === 'withdrawn',
  )
  assert(
    'completed + withdraw → withdrawn',
    nextParticipationState('completed', 'withdraw') === 'withdrawn',
  )
  assert(
    'reflected + withdraw → withdrawn (yes — re-evaluation right preserved)',
    nextParticipationState('reflected', 'withdraw') === 'withdrawn',
  )

  // Withdrawn is a sink — no transitions out
  const withdrawnTransitions: ParticipationTransition[] = [
    'start_listening',
    'complete',
    'reflect',
    'withdraw',
  ]
  for (const t of withdrawnTransitions) {
    assert(
      `withdrawn + ${t} → null (sink)`,
      nextParticipationState('withdrawn', t) === null,
    )
  }

  // ── nextReflectionState ────────────────────────────────────────
  console.log('\nnextReflectionState:')
  assert(
    'draft + publish → published',
    nextReflectionState('draft', 'publish') === 'published',
  )
  assert(
    'published + unpublish → draft',
    nextReflectionState('published', 'unpublish') === 'draft',
  )
  assert(
    'published + archive → archived',
    nextReflectionState('published', 'archive') === 'archived',
  )
  assert(
    'draft + archive → archived',
    nextReflectionState('draft', 'archive') === 'archived',
  )
  assert(
    'archived + publish → published (re-activate)',
    nextReflectionState('archived', 'publish') === 'published',
  )
  assert(
    'archived + unarchive → draft',
    nextReflectionState('archived', 'unarchive') === 'draft',
  )

  // Idempotency
  assert(
    'published + publish → published (idempotent)',
    nextReflectionState('published', 'publish') === 'published',
  )
  assert(
    'draft + unpublish → draft (idempotent)',
    nextReflectionState('draft', 'unpublish') === 'draft',
  )

  // Illegal
  assert(
    'published + unarchive → null',
    nextReflectionState('published', 'unarchive') === null,
  )

  // ── canWriteReflection ─────────────────────────────────────────
  console.log('\ncanWriteReflection (gate):')
  const draftStates: RitualReflectionState[] = ['draft']
  const cycleStatesAllowingDrafts: RitualCycleStatus[] = [
    'upcoming',
    'active',
    'reflection',
  ]
  for (const s of cycleStatesAllowingDrafts) {
    assert(
      `cycle=${s} draft write → allowed`,
      canWriteReflection(s, 'draft').ok === true,
    )
  }
  assert(
    'cycle=archived draft write → blocked',
    canWriteReflection('archived', 'draft').ok === false,
  )
  assert(
    'cycle=upcoming publish → blocked',
    canWriteReflection('upcoming', 'published').ok === false,
  )
  assert(
    'cycle=active publish → blocked',
    canWriteReflection('active', 'published').ok === false,
  )
  assert(
    'cycle=reflection publish → allowed',
    canWriteReflection('reflection', 'published').ok === true,
  )
  assert(
    'cycle=archived publish → blocked',
    canWriteReflection('archived', 'published').ok === false,
  )
  void draftStates // suppress unused

  // ── canJoinCycle ───────────────────────────────────────────────
  console.log('\ncanJoinCycle:')
  assert('upcoming → can join', canJoinCycle('upcoming') === true)
  assert('active → can join', canJoinCycle('active') === true)
  assert(
    'reflection → cannot join (window closed)',
    canJoinCycle('reflection') === false,
  )
  assert('archived → cannot join', canJoinCycle('archived') === false)

  console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
  if (fail > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

// Type re-export so the test file's local `ParticipationTransition`
// alias compiles when imported below.
import type { ParticipationTransition } from '../lib/ritual/lifecycle'

main().catch((err) => {
  console.error('test failed:', err)
  process.exit(1)
})
