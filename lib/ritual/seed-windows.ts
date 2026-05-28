/**
 * lib/ritual/seed-windows.ts — Phase 6B.2
 *
 * Pure window-math helpers for ritual seed scripts. Computes the
 * three canonical week windows (archived/active/upcoming) anchored
 * on a Monday reference point.
 *
 * Cadence (5 days active + 2 days reflection = 7-day cycle):
 *
 *   Monday 00:00 UTC   ─── starts_at
 *   Friday 00:00 UTC   ─── lock_at  /  reflection_opens_at
 *   Monday 00:00 UTC   ─── reflection_closes_at  (= next week's starts_at)
 *
 * Pure of any DB / fetch. Easy to unit test.
 */

import type { RitualCycleWindow } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Returns the Monday-00:00-UTC on or before the given instant. */
export function mondayOnOrBefore(now: Date | string | number): Date {
  const t = now instanceof Date ? now : new Date(now)
  // Date.getUTCDay(): 0=Sun .. 6=Sat. We want Monday=0 offset.
  const dow = t.getUTCDay()
  const daysSinceMonday = (dow + 6) % 7
  const monday = new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) -
      daysSinceMonday * MS_PER_DAY,
  )
  return monday
}

/**
 * Build a 7-day cycle window starting at the given Monday.
 *
 *   starts_at             = monday + 0d
 *   lock_at               = monday + 5d  (Saturday 00:00 UTC)
 *   reflection_opens_at   = monday + 5d
 *   reflection_closes_at  = monday + 7d  (next Monday 00:00 UTC)
 *
 * The 5/2 split (active/reflection) leaves enough time during the
 * working week to actually listen before the reflection window opens
 * on the weekend.
 */
export function weekWindowFromMonday(monday: Date): RitualCycleWindow {
  const m = monday.getTime()
  return {
    starts_at: new Date(m).toISOString(),
    lock_at: new Date(m + 5 * MS_PER_DAY).toISOString(),
    reflection_opens_at: new Date(m + 5 * MS_PER_DAY).toISOString(),
    reflection_closes_at: new Date(m + 7 * MS_PER_DAY).toISOString(),
  }
}

/**
 * Convenience: produce the three canonical seed windows relative to
 * the given reference time. archived = last week, active = this
 * week, upcoming = next week.
 *
 * The cycle_status that the seed should persist for each is derived
 * by the standard lifecycle.computeCycleStatusForTime() at apply
 * time — so this function only emits raw timestamps, not statuses.
 */
export function seedWeekWindows(
  referenceTime: Date | string | number = Date.now(),
): {
  archived: RitualCycleWindow
  active: RitualCycleWindow
  upcoming: RitualCycleWindow
} {
  const thisMonday = mondayOnOrBefore(referenceTime)
  const lastMonday = new Date(thisMonday.getTime() - 7 * MS_PER_DAY)
  const nextMonday = new Date(thisMonday.getTime() + 7 * MS_PER_DAY)
  return {
    archived: weekWindowFromMonday(lastMonday),
    active: weekWindowFromMonday(thisMonday),
    upcoming: weekWindowFromMonday(nextMonday),
  }
}
