'use server'

/**
 * lib/cycles/progression.ts — Phase 3E Cycle Progression Engine
 *
 * Thin wrapper around the Postgres `advance_cycle_phases()` RPC. All real
 * logic lives in SQL (lib/schema-phase3e-cycles.sql) for atomicity and
 * race safety. This module exists so app code can trigger advancement
 * from server actions, cron API routes, or opportunistic page reads
 * without having to reach the admin client directly.
 *
 * Idempotent. Safe to call concurrently. Cheap when nothing needs to
 * change — each room is one phase comparison and at most one UPDATE.
 */

import { getSupabaseAdminClient } from '@/lib/supabase/admin'

export interface AdvanceCyclesResult {
  roomsAdvanced: number
  roomsRolledOver: number
  roomsActivated: number
}

/**
 * Advance every active room's cycle phase to the expected state for
 * today. Returns a summary for observability. Returns null when the
 * RPC is unreachable (e.g. service-role key not configured) — the
 * caller should treat that as a soft failure.
 */
export async function advanceCyclePhases(): Promise<AdvanceCyclesResult | null> {
  try {
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.rpc('advance_cycle_phases')
    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[cycles/progression] RPC failed:', error.message)
      }
      return null
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return { roomsAdvanced: 0, roomsRolledOver: 0, roomsActivated: 0 }
    return {
      roomsAdvanced: Number(row.rooms_advanced ?? 0),
      roomsRolledOver: Number(row.rooms_rolled_over ?? 0),
      roomsActivated: Number(row.rooms_activated ?? 0),
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[cycles/progression] exception:', err)
    }
    return null
  }
}

// ── Module-level throttle for opportunistic callers ────────────────────────
// Server components on /rooms etc. call advanceCyclePhases() on every
// request as a dev-environment fallback when pg_cron is absent and no
// external scheduler hits the cron API. The function is cheap, but we
// don't want a hot page firing the RPC every render. A 5-minute floor
// per-process is plenty — pg_cron or Vercel cron handles the real
// schedule when configured.

let lastOpportunisticRun = 0
const OPPORTUNISTIC_THROTTLE_MS = 5 * 60 * 1000

export async function maybeAdvanceCyclePhasesOpportunistically(): Promise<void> {
  const now = Date.now()
  if (now - lastOpportunisticRun < OPPORTUNISTIC_THROTTLE_MS) return
  lastOpportunisticRun = now
  await advanceCyclePhases().catch(() => {})
}
