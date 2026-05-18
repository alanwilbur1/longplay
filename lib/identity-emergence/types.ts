/**
 * lib/identity-emergence/types.ts — Phase 4A Identity Emergence
 *
 * The vocabulary of "tendencies" — the things the system is permitted
 * to *notice* (not claim) about a listener once enough longitudinal
 * evidence exists. Every tendency:
 *
 *   1. extends the Phase 3G Evidence shape with identity-specific
 *      aggregations (per-room return distribution, moment-type
 *      ratios, cycles engaged with);
 *   2. routes through `assess(...)` against a Phase 3G observation
 *      kind to determine eligibility;
 *   3. returns a literary line (or null for silence) — never a label,
 *      never a personality type, never a specific room/album name.
 */

import type { Confidence, Evidence } from '@/lib/interpretation'

/** The full set of tendencies the system can currently emit. Each is
 *  an observation about shape of behavior, not an identity claim.
 *  Adding a tendency requires three things: (a) a real evidence
 *  source, (b) a Phase 3G ObservationKind whose `assess()` gates it,
 *  (c) a literary line in `language.ts`. */
export type TendencyKind =
  | 'recurring-rooms'        // "some rooms are beginning to recur"
  | 'room-distribution'      // "your listening is moving across rooms" /
                             // "your listening is gathering around a few rooms"
  | 'marking-style'          // "a preference for written reflection may be forming" /
                             // "you tend to mark briefly more often than to write"

/** Per-room return record (one entry per distinct room the user has
 *  recorded a listen_start event for). */
export interface RoomReturnRecord {
  roomSlug: string
  returns: number
  cyclesActive: number
}

/** Identity evidence: the unified shape the aggregator produces.
 *  Extends the Phase 3G Evidence shape with identity-specific
 *  aggregations. Optional fields throughout so partial evidence is
 *  honest about what's missing. */
export interface IdentityEvidence extends Evidence {
  /** Per-room return distribution (computed from listen_start events
   *  joined to cycles). */
  roomReturnDistribution: RoomReturnRecord[]

  /** Moment counts grouped by type ('mark', 'annotation', 'reflection',
   *  'save', etc.). Missing types are zero. */
  momentsByType: Record<string, number>

  /** Distinct cycle ids the user has any event in. */
  cyclesEngagedWith: string[]
}

/** Tendency: the output of one detector. The shape is symmetric with
 *  the Phase 3G Assessment so consumers can render the same way for
 *  every kind: if `line === null`, render nothing. */
export interface Tendency {
  kind: TendencyKind
  /** Internal — never surfaced to the user. For dev-mode telemetry. */
  confidence: Confidence
  /** The literary line, or null for silence. */
  line: string | null
  /** Short machine-readable reason for audit / debug. */
  reason: string
}
