/**
 * lib/room-culture/types.ts — Phase 4C Room Culture
 *
 * Room Culture is the third epistemic register, distinct from
 * Identity (Phase 4A) and Resonance (Phase 4B):
 *
 *   Memory:        facts about the listener's record
 *   Identity:      tendencies the listener shows
 *   Resonance:     things that recur to the listener
 *   Room Culture:  the room's own collective texture over time
 *
 * Anonymity is the load-bearing constraint. Every signal here is an
 * aggregate computed across all listeners in a room — never a per-
 * member quantity, never a comparison between individuals. The room
 * speaks collectively; individual listeners are not exposed in any
 * observation.
 *
 * Grammar discipline: the ROOM is the grammatical subject. "This
 * room has grown quieter" / "Reflections tend to linger here" /
 * "Listeners often return". Never "you" — that would be identity,
 * not culture.
 */

import type { Confidence, Evidence } from '@/lib/interpretation'

/** The full set of room-culture observations the system can emit.
 *  Each one routes through a Phase 3G ObservationKind and requires
 *  multi-cycle room history before it is permitted to speak. */
export type RoomObservationKind =
  | 'pace-shift'         // "this room has grown quieter / busier over recent cycles"
  | 'marking-character'  // "reflections tend to linger / marks tend to stay brief"
  | 'return-character'   // "listeners often return / attention here tends to pass through"

/** Room culture evidence: the aggregator's output for a single room.
 *  Inherits Phase 3G's Evidence base so the universal contradicts /
 *  dormant guards still apply, and extends with room-scoped fields
 *  added in Phase 4C. All fields are AGGREGATES — no per-member data
 *  may live on this shape. */
export interface RoomCultureEvidence extends Evidence {
  /** The room being observed. */
  roomId: string
  /** Slug for debug / dev introspection. Not surfaced to users via
   *  observations — the room is the subject implicitly because the
   *  observations render on the room's own page. */
  roomSlug: string
}

/** RoomObservation: the output of one detector. Same shape as
 *  Tendency and Resonance from prior phases — consumers render
 *  identically: if line is null, render nothing. */
export interface RoomObservation {
  kind: RoomObservationKind
  /** Internal — never surfaced to users. */
  confidence: Confidence
  /** The literary line, or null for silence. */
  line: string | null
  /** Short machine-readable reason for audit / dev mode. */
  reason: string
}
