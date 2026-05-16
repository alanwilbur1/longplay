'use client'

/**
 * lib/presence/heartbeat.ts — Phase 3B.1A
 *
 * Client hook that manages the presence heartbeat lifecycle:
 *   - Fires once immediately on mount
 *   - Fires every 30 s while the component is mounted
 *   - Removes the presence row on unmount (best-effort)
 *
 * Default visibility is null (invisible) — the user has not opted in yet.
 * Opt-in UI is Phase 3B.1B; this hook is the substrate.
 *
 * cycleId = null / undefined → hook is a no-op (static rooms without a cycle).
 */

import { useEffect, useRef } from 'react'
import { upsertPresence, removePresence } from '@/lib/actions/presence'

const HEARTBEAT_MS = 30_000

export function usePresenceHeartbeat(cycleId: string | null | undefined): void {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!cycleId) return

    const beat = () => {
      upsertPresence({ cycleId }).catch(() => {
        // heartbeat failures are non-fatal — presence is atmospheric
      })
    }

    beat() // immediate on mount

    timerRef.current = setInterval(beat, HEARTBEAT_MS)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      // Best-effort removal; DB cleanup_room_presence handles stragglers
      removePresence(cycleId).catch(() => {})
    }
  }, [cycleId])
}
