/**
 * lib/fading/types.ts — Phase 5B Fading & Persistence
 *
 * The sixth epistemic layer. Where the prior five answered "what is
 * true", continuity answered "what does the present moment feel
 * like", fading & persistence answer "how has the archive aged?"
 *
 *   Memory:        facts about the listener's record
 *   Identity:      tendencies the listener shows
 *   Resonance:     things that recur to the listener
 *   Room Culture:  the room itself, collectively, over time
 *   Continuity:    how time changes the texture of the present
 *   Fading:        which traces have softened, which have endured
 *
 * The architectural distinction from Phase 4B Resonance:
 *
 *   Resonance asks: what keeps returning?
 *   Fading asks:    which traces survive long absences?
 *
 * A recurring trace returns. A persistent trace also returns, but
 * its first appearance must be OLD. Persistence is recurrence + age.
 *
 * Discipline:
 *   - Persistence threshold strictly higher than recurrence.
 *   - Fading is not failure. The grammar treats fading as natural —
 *     "settled deeper", "drifted into a slower season".
 *   - Default to silence. Three observations are enough.
 */

import type { Confidence } from '@/lib/interpretation'

/** The full set of fading observations the system can emit. Each
 *  routes through a Phase 3G ObservationKind. */
export type FadingState =
  | 'archive-softening'   // user's archive has settled
  | 'persistent-traces'   // some old moments still survive new cycles
  | 'room-drift'          // a room the user invested in has gone quiet for them

/** Per-album persistence record. A persistent moment is one that is
 *  ≥60 days old AND has at least one same-album moment in a cycle
 *  starting ≥30 days after the original. */
export interface PersistentMomentRecord {
  momentId: string
  albumId: string
  ageDays: number
  laterSameAlbumCount: number
}

/** Per-room drift record. A drifted room is one the user has
 *  meaningful history in (span ≥30 days) but has stepped away from
 *  (most recent moment ≥21 days ago). */
export interface DriftedRoomRecord {
  roomSlug: string
  spanDays: number
  daysSinceLastMoment: number
}

/** Fading evidence: the unified shape the aggregator produces.
 *  Extends Phase 3G's Evidence base + carries per-entity records
 *  alongside the threshold maxima. */
export interface FadingEvidence {
  // Phase 3G inherited
  totalMoments: number
  daysSinceLastActivity: number
  contradicts: boolean

  // Phase 5B-specific
  oldMomentCount: number
  persistentMomentCount: number
  driftedRoomCount: number
  persistentMoments: PersistentMomentRecord[]
  driftedRooms: DriftedRoomRecord[]
}

/** FadingObservation: the output of one detector. Same shape as
 *  prior phase observations — consumers render identically: if
 *  line is null, render nothing. */
export interface FadingObservation {
  state: FadingState
  /** Internal — never surfaced to users. */
  confidence: Confidence
  /** The literary line, or null for silence. */
  line: string | null
  /** Short machine-readable reason for audit / dev mode. */
  reason: string
}
