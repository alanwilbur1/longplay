/**
 * lib/continuity/types.ts — Phase 5A Emotional Continuity
 *
 * The fifth epistemic register, distinct from the four prior layers:
 *
 *   Memory:           facts about the record
 *   Identity:         tendencies the listener shows
 *   Resonance:        things that recur to the listener
 *   Room Culture:     the room itself, collectively, over time
 *   Continuity:       how the present moment FEELS given everything
 *                     that has and hasn't happened recently
 *
 * Continuity is fundamentally about time deltas — the gap between
 * the listener's last visit and now, the cycle's age, the cycle's
 * proximity to its end. The system acknowledges the passage of time
 * without ever demanding the listener's attention.
 *
 * Discipline:
 *   - One state per surface. Never stack.
 *   - States are mutually exclusive at render time, even when
 *     evidence supports multiple — the selector picks one.
 *   - Threshold-gated: a 2-day absence is not continuity, it's just
 *     yesterday.
 *   - Default to silence.
 */

/** The full set of continuity states the system can currently emit.
 *  Each describes a temporal texture, not an action to take. */
export type ContinuityState =
  | 'returning-after-absence'       // 3–13 days since last activity
  | 'returning-after-long-absence'  // 14+ days since last activity
  | 'cycle-arrival'                 // current cycle started today/yesterday
  | 'cycle-closing'                 // current cycle ends today/tomorrow

/** Evidence shape — pure inputs, no DB references. Aggregators
 *  produce this; detectors consume it. */
export interface ContinuityEvidence {
  /** Days since the user's most recent participation_event.
   *  Undefined when unauthenticated or when the user has never been
   *  active. Detectors treat undefined as "no signal" — silent. */
  daysSinceUserLastActivity?: number

  /** ISO date (yyyy-mm-dd) of the current cycle's start. */
  cycleStartDate?: string

  /** ISO date (yyyy-mm-dd) of the current cycle's end. */
  cycleEndDate?: string

  /** ISO date for today. Allows deterministic testing — defaulted
   *  by aggregators when not provided. */
  today?: string
}

/** Continuity: the output of the detection process. Same shape as
 *  Tendency / Resonance / RoomObservation from prior phases —
 *  consumers render identically: if line is null, render nothing. */
export interface Continuity {
  state: ContinuityState | 'none'
  /** The literary line, or null for silence. */
  line: string | null
  /** Audit / dev-mode reason. */
  reason: string
}
