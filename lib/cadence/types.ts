/**
 * lib/cadence/types.ts — Phase 3C.1 Ritual Cadence Engine
 *
 * The listener-side ritual phase that LongPlay moves through each week.
 * Distinct from Room.weeklyPhase (the room-side cycle phase, which tracks
 * which content the room has unlocked). The ritual phase is universal:
 * a Wednesday is "Difficult Listening" regardless of which room you're
 * standing in.
 *
 * These types are the public surface of the engine. Components consume
 * them; nothing else should redefine ritual phases anywhere.
 */

export type RitualPhase =
  | 'arrival'              // Monday    — first emotional contact
  | 'first-impressions'    // Tuesday   — instinctive reactions
  | 'difficult-listening'  // Wednesday — patience, returning to hard moments
  | 'reflection'           // Thursday  — meaning-making, annotation
  | 'synthesis'            // Friday    — the album as a whole
  | 'carry-forward'        // Sat/Sun   — residue, memory, archival reflection

/** The emotional register the day is meant to inhabit. */
export type EmotionalTone =
  | 'anticipatory'
  | 'instinctive'
  | 'introspective'
  | 'interpretive'
  | 'consolidating'
  | 'archival'

/** The kind of listening behavior the day invites. */
export type ListeningBehavior =
  | 'first-listen'
  | 'tonal-discovery'
  | 'deep-attention'
  | 'meaning-making'
  | 'whole-album'
  | 'memory'

/** Spacing rhythm hint for consumers that want to honor the day's density. */
export type SpacingRhythm = 'open' | 'dense' | 'flowing'

/**
 * Fully resolved ritual phase info, including day-of-week context.
 * This is the shape consumers receive from `getCurrentRitualPhase()`
 * and `useRitualPhase()`.
 */
export interface RitualPhaseInfo {
  /** The canonical phase identifier. */
  phase: RitualPhase

  /** Human-readable day name (e.g. "Wednesday"). Local-timezone-derived. */
  day: string

  /** 0–6, 0 = Sunday. */
  dayOfWeek: number

  /** Short editorial title ("Arrival", "Difficult Listening"…). */
  title: string

  /** The day's universal listening prompt — what the listener is invited to do. */
  ritual: string

  /** Observational framing line — literary, restrained, not imperative. */
  observation: string

  /** Tone register the day inhabits. */
  emotionalTone: EmotionalTone

  /** Listening behavior the day invites. */
  listeningBehavior: ListeningBehavior

  /** CSS class applied to atmospheric surfaces. Very subtle modulation. */
  atmosphereClass: string

  /** Spacing rhythm hint. */
  spacingRhythm: SpacingRhythm
}
