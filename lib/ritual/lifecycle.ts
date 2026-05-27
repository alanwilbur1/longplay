/**
 * lib/ritual/lifecycle.ts — Phase 6B.1
 *
 * Pure functions governing ritual cycle lifecycle transitions and
 * participation state machines. NO DB. NO fetch. Everything here is
 * deterministic and unit-testable in isolation.
 *
 * The DB-backed sweep + write paths live in lib/ritual/cycles.ts and
 * lib/ritual/participation.ts; they import from this file to ensure
 * the clock/state logic is shared.
 *
 * Architectural invariants:
 *   - Cycle status is a PURE function of (timestamps, clock). Never
 *     dependent on participation counts or external state.
 *   - Transitions are MONOTONIC. A cycle never moves backward.
 *   - Participation state transitions are MONOTONIC EXCEPT
 *     'withdrawn' is a sink — once withdrawn, only ops that revive
 *     the participant (out of scope for 6B.1) move out.
 */

import type {
  RitualCycleStatus,
  RitualCycleWindow,
  RitualParticipantState,
  RitualReflectionState,
} from './types'

// ── Cycle status from clock ────────────────────────────────────────

/**
 * Compute the canonical status of a cycle at a point in time.
 *
 * Strictly time-derived. Inputs are ISO timestamps; output is one of
 * the four status strings.
 *
 *   now < starts_at                                    → 'upcoming'
 *   starts_at ≤ now < reflection_opens_at              → 'active'
 *   reflection_opens_at ≤ now < reflection_closes_at   → 'reflection'
 *   now ≥ reflection_closes_at                         → 'archived'
 *
 * Boundary convention: lower-bound INCLUSIVE, upper-bound EXCLUSIVE.
 * A cycle whose reflection window closes "today at 23:59:59.999" is
 * still in 'reflection' at 23:59:59.999 and becomes 'archived' at
 * 24:00:00.000.
 */
export function computeCycleStatusForTime(
  window: RitualCycleWindow,
  now: Date | string | number = Date.now(),
): RitualCycleStatus {
  const t = toEpochMs(now)
  const startMs = toEpochMs(window.starts_at)
  const reflectionOpenMs = toEpochMs(window.reflection_opens_at)
  const reflectionCloseMs = toEpochMs(window.reflection_closes_at)

  if (t < startMs) return 'upcoming'
  if (t < reflectionOpenMs) return 'active'
  if (t < reflectionCloseMs) return 'reflection'
  return 'archived'
}

/**
 * Validate that a window's four timestamps form a legal lifecycle.
 * Returns null on success, a short reason string on failure.
 *
 * The DB CHECK constraints enforce the same invariants, but this
 * helper lets callers reject malformed input BEFORE round-tripping.
 */
export function validateRitualCycleWindow(
  window: RitualCycleWindow,
): string | null {
  const startMs = toEpochMs(window.starts_at)
  const lockMs = toEpochMs(window.lock_at)
  const reflectionOpenMs = toEpochMs(window.reflection_opens_at)
  const reflectionCloseMs = toEpochMs(window.reflection_closes_at)
  if (!Number.isFinite(startMs)) return 'starts_at is not a valid timestamp'
  if (!Number.isFinite(lockMs)) return 'lock_at is not a valid timestamp'
  if (!Number.isFinite(reflectionOpenMs))
    return 'reflection_opens_at is not a valid timestamp'
  if (!Number.isFinite(reflectionCloseMs))
    return 'reflection_closes_at is not a valid timestamp'
  if (lockMs < startMs) return 'lock_at must be >= starts_at'
  if (reflectionOpenMs < lockMs)
    return 'reflection_opens_at must be >= lock_at'
  if (reflectionCloseMs < reflectionOpenMs)
    return 'reflection_closes_at must be >= reflection_opens_at'
  return null
}

/**
 * True when a persisted cycle_status is stale relative to the clock
 * — i.e. needs the sweep service to write a fresh status.
 *
 * Distinct from "advanced" because the sweep also needs to handle
 * the rare case where a cycle was archived early (archived_at set)
 * but the clock hasn't caught up. In that case the persisted status
 * is 'archived' and the time-derived is something earlier — the
 * persisted status WINS (explicit archive is sticky).
 */
export function shouldRefreshCycleStatus(
  persistedStatus: RitualCycleStatus,
  archivedAt: string | null,
  window: RitualCycleWindow,
  now: Date | string | number = Date.now(),
): boolean {
  // Explicit archive is sticky. Never revert from archived.
  if (persistedStatus === 'archived') return false
  if (archivedAt) return false
  const derived = computeCycleStatusForTime(window, now)
  return derived !== persistedStatus
}

// ── Participation state machine ────────────────────────────────────

/**
 * Allowed transitions for ritual_participants.participation_state.
 *
 *                  ┌──── withdraw ──────┐
 *                  │                    ▼
 *   joined → listening → completed → reflected ─ withdraw → withdrawn
 *      │         │           │           │
 *      └─────────┴───────────┴───────────┘
 *      withdraw can fire from any non-terminal state.
 *
 * Phase 6B.1 ships withdrawn as a sink — recovery from withdrawn is
 * deliberately out of scope until 6B.2 decides what re-join semantics
 * look like. The state machine here enforces that withdrawn is final.
 *
 * The function returns the target state on success, or null when the
 * transition is illegal. Callers should map null to a clean user-
 * facing error.
 */
export type ParticipationTransition =
  | 'start_listening'
  | 'complete'
  | 'reflect'
  | 'withdraw'

export function nextParticipationState(
  current: RitualParticipantState,
  transition: ParticipationTransition,
): RitualParticipantState | null {
  if (current === 'withdrawn') return null

  switch (transition) {
    case 'start_listening':
      // Once-only forward move. Idempotent at 'listening' or later.
      if (current === 'joined') return 'listening'
      if (
        current === 'listening' ||
        current === 'completed' ||
        current === 'reflected'
      )
        return current // idempotent
      return null
    case 'complete':
      if (current === 'joined' || current === 'listening') return 'completed'
      if (current === 'completed' || current === 'reflected') return current
      return null
    case 'reflect':
      if (
        current === 'joined' ||
        current === 'listening' ||
        current === 'completed'
      )
        return 'reflected'
      if (current === 'reflected') return current
      return null
    case 'withdraw':
      return 'withdrawn'
    default:
      return null
  }
}

// ── Reflection state machine ───────────────────────────────────────

/**
 * Allowed reflection_state transitions.
 *
 *   draft → published        (author publishes for peer-select policy)
 *   draft → archived         (author abandons before publishing)
 *   published → draft        (author un-publishes; goes back to drafting)
 *   published → archived     (author retracts)
 *   archived → published     (author un-archives; reactivates)
 *
 * Returns the target state on success or null on illegal transition.
 */
export type ReflectionTransition =
  | 'publish'
  | 'archive'
  | 'unpublish'
  | 'unarchive'

export function nextReflectionState(
  current: RitualReflectionState,
  transition: ReflectionTransition,
): RitualReflectionState | null {
  switch (transition) {
    case 'publish':
      if (current === 'draft' || current === 'archived') return 'published'
      if (current === 'published') return 'published' // idempotent
      return null
    case 'unpublish':
      if (current === 'published') return 'draft'
      if (current === 'draft') return 'draft' // idempotent
      return null
    case 'archive':
      if (current === 'draft' || current === 'published') return 'archived'
      if (current === 'archived') return 'archived'
      return null
    case 'unarchive':
      if (current === 'archived') return 'draft'
      return null
    default:
      return null
  }
}

/**
 * Determines whether reflection writes are permitted for a given
 * cycle status. Submission is allowed BEFORE the official reflection
 * window opens — listeners can draft as soon as the cycle exists —
 * but no further writes after the cycle is archived.
 *
 *   upcoming   → drafts only (publish blocked until 'reflection')
 *   active     → drafts only (publish blocked until 'reflection')
 *   reflection → drafts + publish allowed
 *   archived   → no writes (frozen)
 */
export function canWriteReflection(
  cycleStatus: RitualCycleStatus,
  asState: RitualReflectionState,
): { ok: true } | { ok: false; reason: string } {
  if (cycleStatus === 'archived') {
    return {
      ok: false,
      reason: 'cycle is archived; reflections are frozen',
    }
  }
  if (asState === 'published' && cycleStatus !== 'reflection') {
    return {
      ok: false,
      reason:
        'reflections may be published only while the cycle is in the reflection window',
    }
  }
  return { ok: true }
}

/**
 * Whether new participants may join a cycle. Once lock_at passes
 * (cycle has transitioned to reflection or archived), no new joins.
 * Existing participants may continue to complete/reflect.
 */
export function canJoinCycle(cycleStatus: RitualCycleStatus): boolean {
  return cycleStatus === 'upcoming' || cycleStatus === 'active'
}

// ── Internal helpers ───────────────────────────────────────────────

function toEpochMs(input: Date | string | number): number {
  if (input instanceof Date) return input.getTime()
  if (typeof input === 'number') return input
  return Date.parse(input)
}
