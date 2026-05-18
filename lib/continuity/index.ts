/**
 * lib/continuity — Phase 5A Emotional Continuity
 *
 * The fifth epistemic layer. Where the four prior layers answered
 * "what is true?", continuity answers "what does the present moment
 * feel like, given everything that has and hasn't happened?"
 *
 * Time itself becomes the subject. Returning after absence, a cycle
 * about to close, a cycle just opening — these are moments the
 * system can acknowledge without ever asking the listener to act.
 *
 * Public surface (client- and server-safe):
 *
 *   Types:
 *     - ContinuityState, Continuity, ContinuityEvidence
 *
 *   Pure helpers (testing / dev introspection):
 *     - selectContinuity(evidence)            priority-ordered single state
 *     - DETECTORS.*                           direct access to each detector
 *     - isSpoken(continuity)                  type-guard for non-null line
 *     - gatherCycleContinuity(start, end)     pure, no DB
 *     - mergeContinuity(a, b)                 compose two Evidence shapes
 *
 *   Server-action surfaces:
 *     - getUserContinuity()                   home, archive, identity
 *     - getCycleContinuity(start, end)        room-only
 *     - getCombinedContinuity(start, end)     active room (user + cycle)
 *
 *   Language:
 *     - returningShortLine, returningLongLine
 *     - cycleArrivalLine, cycleClosingLine
 *
 * Note: gatherUserContinuity (the auth-scoped DB read) is intentionally
 * NOT re-exported here because it imports server-only modules
 * (next/headers cookies). Callers reach it via getUserContinuity().
 *
 * Discipline:
 *
 *   1. AT MOST ONE LINE per surface. The selector enforces this.
 *
 *   2. Default to silence. No "still gathering" fallback for
 *      continuity — that would be performing atmosphere.
 *
 *   3. Time is the subject. "The cycle is closing", "the room has
 *      carried on" — never instructs the listener.
 *
 *   4. No urgency, no streaks, no nudges.
 */

export type {
  ContinuityState,
  Continuity,
  ContinuityEvidence,
} from './types'

export {
  selectContinuity,
  DETECTORS,
  isSpoken,
} from './detectors'

// Only the pure helpers from aggregate are re-exported. The auth-
// scoped gatherUserContinuity is server-only and reached via
// getUserContinuity below.
export {
  gatherCycleContinuity,
  mergeContinuity,
} from './aggregate'

export {
  getUserContinuity,
  getCycleContinuity,
  getCombinedContinuity,
} from './server'

export {
  returningShortLine,
  returningLongLine,
  cycleArrivalLine,
  cycleClosingLine,
} from './language'
