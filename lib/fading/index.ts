/**
 * lib/fading — Phase 5B Fading & Persistence
 *
 * The sixth epistemic layer. Where the prior five answered "what is
 * true", "what does the present feel like", fading & persistence
 * answer "how has the archive aged?"
 *
 *   Memory:        facts about the listener's record
 *   Identity:      tendencies the listener shows
 *   Resonance:     things that recur to the listener
 *   Room Culture:  the room itself, collectively
 *   Continuity:    how time changes the texture of the present
 *   Fading:        which traces have softened, which have endured
 *
 * Persistence is structurally harder to earn than recurrence (Phase
 * 4B). A persistent moment is OLD (≥60 days) AND has continued
 * relevance via same-album recurrence in a cycle ≥30 days after the
 * original. Recurrence alone is not enough.
 *
 * Public surface (client-safe imports):
 *
 *   Types:
 *     - FadingState, FadingObservation, FadingEvidence
 *
 *   Pure helpers:
 *     - detectFading(evidence)               all detectors, including silent
 *
 *   Server-action:
 *     - getSpokenFadingObservations()        filtered to non-null lines
 *
 *   Language:
 *     - archiveSofteningLine
 *     - persistentTracesLine
 *     - roomDriftLine(count)
 *     - fadingSectionHeader, fadingFootnote
 *
 * Note: gatherFadingEvidence (the auth-scoped DB read) is intentionally
 * NOT re-exported here because it imports server-only modules
 * (next/headers cookies). Callers reach it via the server.ts surface.
 */

export type {
  FadingState,
  FadingObservation,
  FadingEvidence,
  PersistentMomentRecord,
  DriftedRoomRecord,
} from './types'

export { detectFading } from './detectors'

export { getSpokenFadingObservations } from './server'

export {
  archiveSofteningLine,
  persistentTracesLine,
  roomDriftLine,
  fadingSectionHeader,
  fadingFootnote,
} from './language'
