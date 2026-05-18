/**
 * lib/resonance/types.ts — Phase 4B Resonance & Return
 *
 * Resonance is distinct from identity and from memory.
 *
 *   Memory (Phase 3F):    facts about the listener's record
 *                         "you marked 5 moments"
 *   Identity (Phase 4A):  tendencies the listener shows
 *                         "your listening is gathering around a few rooms"
 *   Resonance (Phase 4B): things that keep returning to the listener
 *                         "certain rooms continue returning"
 *
 * The grammar is the discipline. Identity treats the listener as
 * subject; resonance treats the things-that-recur as subject. The
 * difference matters — it determines whether the surface feels like
 * personality assignment or like quiet observation.
 *
 * Resonance never names a specific room, album, curator, or other
 * listener. Same surveilling discipline as Phase 4A. The thing that
 * is returning is acknowledged abstractly.
 */

import type { Confidence, Evidence } from '@/lib/interpretation'

/** The full set of resonances the system can currently emit. Each is
 *  an observation about WHAT keeps returning, not about the listener.
 *  Adding a kind requires the same three things as Phase 4A:
 *  evidence source, Phase 3G ObservationKind that gates it, literary
 *  line in language.ts. Two for Phase 4B; resist adding more. */
export type ResonanceKind =
  | 'album-recurrence'   // "a few albums have begun resurfacing"
  | 'room-persistence'   // "certain rooms continue returning"

/** Per-album recurrence record (one entry per distinct album the user
 *  has moments on). */
export interface AlbumRecurrenceRecord {
  albumId: string
  cycleCount: number       // distinct cycles containing moments on this album
  spanDays: number         // days between earliest and latest such cycle
}

/** Per-room persistence record (one entry per distinct room the user
 *  has moments in). */
export interface RoomPersistenceRecord {
  roomId: string
  cycleCount: number       // distinct cycles with user-moments in this room
  spanDays: number         // days between earliest and latest such cycle
}

/** Resonance evidence: the aggregator's output. Extends the Phase 3G
 *  Evidence with the per-entity records and the summary maxima used
 *  by the rules. */
export interface ResonanceEvidence extends Evidence {
  albumRecurrences: AlbumRecurrenceRecord[]
  roomPersistences: RoomPersistenceRecord[]
}

/** Resonance: the output of one detector. Same shape as Tendency
 *  (Phase 4A) — consumers can render the two with the same logic:
 *  if line is null, render nothing. */
export interface Resonance {
  kind: ResonanceKind
  /** Internal — never surfaced to the user. */
  confidence: Confidence
  /** The literary line, or null for silence. */
  line: string | null
  /** Short machine-readable reason for audit / debug. */
  reason: string
}
