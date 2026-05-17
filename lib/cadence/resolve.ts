/**
 * lib/cadence/resolve.ts — Phase 3C.1
 *
 * Pure deterministic resolution of day-of-week → ritual phase.
 * No React, no DOM, no time-zone heroics — uses the supplied Date's
 * local day-of-week. SSR-safe; callers can use this in server
 * components, server actions, or client components.
 *
 * Saturday and Sunday both resolve to "carry-forward" by design:
 * the weekend is one residue-and-memory phase, not two distinct days.
 */

import { PHASE_DEFINITIONS } from './phases'
import type { RitualPhase, RitualPhaseInfo } from './types'

const DAY_TO_PHASE: Record<number, RitualPhase> = {
  0: 'carry-forward',      // Sunday
  1: 'arrival',            // Monday
  2: 'first-impressions',  // Tuesday
  3: 'difficult-listening', // Wednesday
  4: 'reflection',         // Thursday
  5: 'synthesis',          // Friday
  6: 'carry-forward',      // Saturday
}

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

/**
 * Resolve the ritual phase for an arbitrary date (defaults to now).
 * Deterministic: same input → same output.
 */
export function getCurrentRitualPhase(date: Date = new Date()): RitualPhaseInfo {
  const dow = date.getDay()
  return resolveForDay(dow)
}

/**
 * Resolve the ritual phase for a specific day-of-week (0–6).
 * Useful for previewing tomorrow or rendering a full-week strip.
 */
export function getRitualPhaseForDay(dayOfWeek: number): RitualPhaseInfo {
  const dow = ((dayOfWeek % 7) + 7) % 7
  return resolveForDay(dow)
}

function resolveForDay(dow: number): RitualPhaseInfo {
  const phase = DAY_TO_PHASE[dow]
  return {
    ...PHASE_DEFINITIONS[phase],
    day: DAY_NAMES[dow],
    dayOfWeek: dow,
  }
}

/**
 * Compute milliseconds until the next local-midnight day boundary.
 * Used by `useRitualPhase()` to schedule a single refresh tick when a
 * tab is open across the day boundary.
 */
export function msUntilNextDayBoundary(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  return Math.max(0, next.getTime() - now.getTime())
}
