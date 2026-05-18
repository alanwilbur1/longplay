/**
 * lib/continuity/detectors.ts — Phase 5A
 *
 * Pure detectors for emotional continuity. Unlike prior phases'
 * detector arrays, this module's primary export is a SELECTOR:
 * `selectContinuity(evidence)` returns AT MOST one Continuity object.
 *
 * This is deliberate. Continuity is a felt thing — multiple temporal
 * facts can be true simultaneously, but layering several "you are
 * returning... the cycle is closing... the room has settled..." lines
 * would feel like a dashboard, not an atmosphere. The selector
 * picks the single state that best describes the present moment by
 * priority order.
 *
 * Priority:
 *   1. cycle-closing                  (most temporally specific)
 *   2. returning-after-long-absence   (the listener has been away meaningfully)
 *   3. returning-after-absence        (the listener has been away)
 *   4. cycle-arrival                  (the cycle has just opened)
 *
 * The reasoning: cycle-closing is rarer and more specific to the
 * present moment than the absence states. Long absence is more
 * notable than short absence. Cycle-arrival is the broadest
 * (true every Monday/Tuesday for every room) so it loses ties.
 */

import {
  returningShortLine,
  returningLongLine,
  cycleArrivalLine,
  cycleClosingLine,
} from './language'
import type { Continuity, ContinuityEvidence, ContinuityState } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysBetweenIso(earlierIso: string, laterIso: string): number {
  const a = Date.parse(earlierIso)
  const b = Date.parse(laterIso)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.floor((b - a) / MS_PER_DAY)
}

function silent(reason: string): Continuity {
  return { state: 'none', line: null, reason }
}

// ── Individual detectors ───────────────────────────────────────────────────
// Each returns either a fully-formed Continuity with a line, or a
// silent Continuity (state='none', line=null) with a reason. The
// selector picks among the spoken ones.

function detectCycleClosing(e: ContinuityEvidence): Continuity {
  if (!e.cycleEndDate || !e.today) return silent('no-cycle-end')
  const daysUntilEnd = daysBetweenIso(e.today, e.cycleEndDate)
  // Fire on the final day and the day before. -1 or further means
  // the cycle is already past its end (Phase 3E should have rolled
  // it over, but we stay silent if not).
  if (daysUntilEnd < 0) return silent('cycle-past-end')
  if (daysUntilEnd > 1) return silent('cycle-not-closing-yet')
  return { state: 'cycle-closing', line: cycleClosingLine(), reason: 'within-final-window' }
}

function detectCycleArrival(e: ContinuityEvidence): Continuity {
  if (!e.cycleStartDate || !e.today) return silent('no-cycle-start')
  const daysIn = daysBetweenIso(e.cycleStartDate, e.today)
  if (daysIn < 0) return silent('cycle-not-yet-started')
  if (daysIn > 1) return silent('cycle-past-arrival')
  return { state: 'cycle-arrival', line: cycleArrivalLine(), reason: 'within-arrival-window' }
}

function detectReturningAfterAbsence(e: ContinuityEvidence): Continuity {
  const d = e.daysSinceUserLastActivity
  if (d == null) return silent('no-activity-baseline')
  if (d < 3) return silent('too-recent-to-count-as-return')
  if (d >= 14) {
    return {
      state: 'returning-after-long-absence',
      line: returningLongLine(),
      reason: 'longer-absence',
    }
  }
  return {
    state: 'returning-after-absence',
    line: returningShortLine(),
    reason: 'short-absence',
  }
}

// ── Selector ────────────────────────────────────────────────────────────────
// Priority-ordered. Returns the first detector that fires with a
// non-null line. If none fire, returns silence (state: 'none').

export function selectContinuity(evidence: ContinuityEvidence): Continuity {
  const detectors = [
    detectCycleClosing,
    // The long-absence variant is detected by the same function as
    // short-absence; we handle priority within the result.
    (e: ContinuityEvidence): Continuity => {
      const r = detectReturningAfterAbsence(e)
      return r.state === 'returning-after-long-absence' ? r : silent('not-long-absence')
    },
    (e: ContinuityEvidence): Continuity => {
      const r = detectReturningAfterAbsence(e)
      return r.state === 'returning-after-absence' ? r : silent('not-short-absence')
    },
    detectCycleArrival,
  ] as const

  for (const det of detectors) {
    const result = det(evidence)
    if (result.line) return result
  }

  return silent('no-state-matched')
}

/** Exposed for surfaces that want a specific state without going
 *  through the priority selector. Use only when the surface has a
 *  reason to override priority (e.g., the active room may want
 *  cycle-arrival even when the user is also returning). */
export const DETECTORS = {
  cycleClosing: detectCycleClosing,
  cycleArrival: detectCycleArrival,
  returningAfterAbsence: detectReturningAfterAbsence,
} as const

/** Type guard: did the continuity actually produce a line? */
export function isSpoken(c: Continuity): c is Continuity & { line: string; state: ContinuityState } {
  return c.line !== null && c.state !== 'none'
}
