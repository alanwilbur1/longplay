/**
 * lib/memory/types.ts — Phase 3F Longitudinal Memory Layer
 *
 * Memory shapes returned by lib/memory/read. Each is the smallest
 * trustworthy summary the engine can produce from real data.
 *
 * Discipline:
 *   - Every field corresponds to a count or timestamp from a real row.
 *   - No derived "scores", no engagement metrics, no streaks.
 *   - Nullable fields are honest: null means "no real data yet".
 */

export interface CycleParticipation {
  /** Cycle this summary describes. */
  cycleId: string

  /** Count of listen_start events the user has logged for this cycle.
   *  This is the "how many times have you returned to this room
   *  during this cycle?" signal. Dedup-throttled to 10-minute
   *  windows so refreshes and HMR don't inflate the count. */
  returnCount: number

  /** Count of moments the user has created within this cycle. */
  momentCount: number

  /** Timestamp of the user's first listen_start in this cycle. */
  firstReturnAt: string | null

  /** Timestamp of the user's most recent listen_start in this cycle. */
  lastReturnAt: string | null
}

export interface ArchiveSpan {
  /** Total non-deleted moments the user has ever created. */
  totalMoments: number

  /** Timestamp of the earliest moment, or null when there are none. */
  firstMomentAt: string | null

  /** Timestamp of the most recent moment, or null when there are none. */
  lastMomentAt: string | null

  /** Total participation_events rows for this user (any event_type).
   *  The "listening traces" signal used by the identity surface. */
  participationEventCount: number
}
