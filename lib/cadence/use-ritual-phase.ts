'use client'

/**
 * lib/cadence/use-ritual-phase.ts — Phase 3C.1
 *
 * Client hook that exposes the current ritual phase. Returns null on the
 * first server render to avoid hydration mismatches: components should
 * gate phase-dependent UI on `phase != null`, rendering a stable
 * placeholder during SSR (matches the existing pattern used for
 * isLateNight, today's day name, etc.).
 *
 * Refreshes once at the next local-midnight day boundary, so a tab open
 * across midnight quietly transitions to the next day's phase without a
 * reload. No polling, no per-second timer — a single scheduled timeout.
 */

import { useEffect, useState } from 'react'
import { getCurrentRitualPhase, msUntilNextDayBoundary } from './resolve'
import type { RitualPhaseInfo } from './types'

export function useRitualPhase(): RitualPhaseInfo | null {
  const [phase, setPhase] = useState<RitualPhaseInfo | null>(null)

  useEffect(() => {
    setPhase(getCurrentRitualPhase())

    // Schedule a single refresh at the next local midnight. Re-mounts
    // (new useEffect run) reschedule from the new "now" so we never
    // drift if a previous timeout was cleared.
    const ms = msUntilNextDayBoundary()
    // Cap at 24h + small buffer in case the browser clamps the timer.
    const safeMs = Math.min(ms, 24 * 60 * 60 * 1000) + 1000
    const id = setTimeout(() => {
      setPhase(getCurrentRitualPhase())
    }, safeMs)

    return () => clearTimeout(id)
  }, [])

  return phase
}
