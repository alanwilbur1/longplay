'use server'

/**
 * lib/continuity/server.ts — Phase 5A
 *
 * Server-action wrappers. Surfaces call these to receive the single
 * continuity line (or null) for their context. Each helper returns
 * the Continuity object, but consumers should generally check
 * `.line` directly and render nothing when null.
 *
 * Three entry points:
 *   getUserContinuity()                      — for home, identity, archive
 *   getCycleContinuity(start, end)           — for active room (cycle-only)
 *   getCombinedContinuity(start, end)        — for active room (user + cycle)
 */

import {
  gatherUserContinuity,
  gatherCycleContinuity,
  mergeContinuity,
} from './aggregate'
import { selectContinuity } from './detectors'
import type { Continuity } from './types'

const SILENT: Continuity = { state: 'none', line: null, reason: 'no-evidence' }

/** Continuity scoped to the calling user only. Suitable for surfaces
 *  where the cycle context is not specific (home, archive, identity).
 *  Returns silent when unauthenticated or when no evidence supports
 *  any state. */
export async function getUserContinuity(): Promise<Continuity> {
  try {
    const evidence = await gatherUserContinuity()
    if (!evidence) return SILENT
    return selectContinuity(evidence)
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[continuity/server] getUserContinuity failed:', err)
    }
    return SILENT
  }
}

/** Continuity scoped to a single cycle's calendar. Pure date math —
 *  no auth, no DB read. Suitable for surfaces that have the cycle's
 *  start/end already (Phase 2 assembles these on the Room shape). */
export async function getCycleContinuity(
  cycleStartDate: string | null | undefined,
  cycleEndDate: string | null | undefined,
): Promise<Continuity> {
  const evidence = gatherCycleContinuity(cycleStartDate, cycleEndDate)
  return selectContinuity(evidence)
}

/** Combined user + cycle continuity. Suitable for the active room,
 *  where both signals exist. The priority selector picks the most
 *  fitting one. */
export async function getCombinedContinuity(
  cycleStartDate: string | null | undefined,
  cycleEndDate: string | null | undefined,
): Promise<Continuity> {
  try {
    const userEv = await gatherUserContinuity()
    const cycleEv = gatherCycleContinuity(cycleStartDate, cycleEndDate)
    const merged = mergeContinuity(userEv, cycleEv)
    return selectContinuity(merged)
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[continuity/server] getCombinedContinuity failed:', err)
    }
    return SILENT
  }
}
