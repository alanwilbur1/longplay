/**
 * lib/room-culture/aggregate.ts — Phase 4C
 *
 * Per-room aggregation of cross-user activity. Uses the admin client
 * (service-role) because `moments` RLS is owner-only — and Room
 * Culture observations are AGGREGATES across all listeners in the
 * room, by definition. The discipline here is structural: only
 * aggregated counts and ratios leave this function. No per-member
 * field is ever returned.
 *
 * Future hardening: move the aggregation into a SECURITY DEFINER
 * SQL function so the privacy boundary is enforced at the DB layer
 * rather than by app-code convention. The shape of this function's
 * return value (RoomCultureEvidence) is already aligned with what
 * that future function would return.
 */

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type { RoomCultureEvidence } from './types'

interface CycleRow {
  id: string
  start_date: string | null
  current_phase: string | null
  archived_at: string | null
}

interface MomentRow {
  type: string
  member_id: string
  cycle_id: string
  created_at: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const RECENT_WINDOW_CYCLES = 3

export async function gatherRoomCultureEvidence(
  roomSlug: string,
): Promise<RoomCultureEvidence | null> {
  if (!roomSlug) return null

  let admin
  try {
    admin = getSupabaseAdminClient()
  } catch {
    return null
  }

  // Step 0: look up the room's UUID from its slug. Aggregations are
  // keyed on cycles.room_id (UUID), but callers pass us the slug
  // because that's the stable id outside the data layer.
  const { data: roomRow } = await admin
    .from('rooms')
    .select('id')
    .eq('slug', roomSlug)
    .maybeSingle()
  if (!roomRow) return null
  const roomId = (roomRow as { id: string }).id

  // Step 1: pull this room's cycles. Bounded by room — small payload.
  const { data: cyclesData, error: cyclesError } = await admin
    .from('cycles')
    .select('id, start_date, current_phase, archived_at')
    .eq('room_id', roomId)
    .order('start_date', { ascending: true })

  if (cyclesError) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[room-culture/aggregate] cycle read failed:', cyclesError.message)
    }
    return null
  }

  const cycles = (cyclesData ?? []) as CycleRow[]
  const cycleIds = cycles.map(c => c.id)

  // Empty room — return zero-shape evidence so detectors return
  // insufficient cleanly without needing null-checks throughout.
  if (cycleIds.length === 0) {
    return {
      roomId,
      roomSlug,
      roomTotalCycles: 0,
      roomCompletedCycles: 0,
      roomTotalMoments: 0,
      roomRecentToHistoricalMomentRatio: 1,
      roomReflectionRatio: 0,
      roomMemberReturnRatio: 0,
      contradicts: false,
    }
  }

  // Step 2: pull all non-deleted moments for those cycles. Bounded
  // by room. Crosses users — admin client required because the
  // aggregation IS the privacy boundary.
  const { data: momentsData, error: momentsError } = await admin
    .from('moments')
    .select('type, member_id, cycle_id, created_at')
    .in('cycle_id', cycleIds)
    .is('deleted_at', null)

  if (momentsError) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[room-culture/aggregate] moments read failed:', momentsError.message)
    }
    return null
  }

  const moments = (momentsData ?? []) as MomentRow[]

  // ── Aggregations (counts and ratios only) ─────────────────────────────
  const archivedCycles = cycles.filter(c => c.current_phase === 'archived')
  const roomCompletedCycles = archivedCycles.length
  const roomTotalCycles = cycles.length
  const roomTotalMoments = moments.length

  // Reflection ratio across all room moments.
  const reflectionCount = moments.filter(m => m.type === 'reflection').length
  const roomReflectionRatio = roomTotalMoments > 0
    ? reflectionCount / roomTotalMoments
    : 0

  // Pace shift: compare moments-per-cycle in the most recent N
  // archived cycles vs the historical baseline (earlier archived
  // cycles). Both windows must be non-empty for the ratio to be
  // meaningful; otherwise we return 1.0 (no shift).
  const archivedSorted = [...archivedCycles].sort((a, b) => {
    const aDate = a.start_date ?? ''
    const bDate = b.start_date ?? ''
    return aDate.localeCompare(bDate)
  })
  const recentCycles = archivedSorted.slice(-RECENT_WINDOW_CYCLES)
  const historicalCycles = archivedSorted.slice(0, -RECENT_WINDOW_CYCLES)

  function avgMomentsPerCycle(cyclesSlice: CycleRow[]): number {
    if (cyclesSlice.length === 0) return 0
    const ids = new Set(cyclesSlice.map(c => c.id))
    const count = moments.filter(m => ids.has(m.cycle_id)).length
    return count / cyclesSlice.length
  }

  const recentAvg = avgMomentsPerCycle(recentCycles)
  const historicalAvg = avgMomentsPerCycle(historicalCycles)
  const roomRecentToHistoricalMomentRatio = historicalAvg > 0
    ? recentAvg / historicalAvg
    : 1

  // Member return ratio: fraction of distinct members whose moments
  // appear in ≥2 of this room's cycles. The map collapses members to
  // a Set of distinct cycle_ids before we count returns.
  const memberCycles = new Map<string, Set<string>>()
  for (const m of moments) {
    const s = memberCycles.get(m.member_id) ?? new Set<string>()
    s.add(m.cycle_id)
    memberCycles.set(m.member_id, s)
  }
  const distinctMembers = memberCycles.size
  const returningMembers = Array.from(memberCycles.values()).filter(s => s.size >= 2).length
  const roomMemberReturnRatio = distinctMembers > 0
    ? returningMembers / distinctMembers
    : 0

  // Dormancy proxy: days since the most recent moment OR since the
  // most recently created cycle, whichever is more recent. A room
  // can be "active" even with no recent moments if cycles are still
  // turning. We honor whichever is more recent.
  const lastMomentTime = moments.length > 0
    ? Math.max(...moments.map(m => new Date(m.created_at).getTime()))
    : 0
  const lastCycleTime = cycles.length > 0
    ? Math.max(...cycles
        .map(c => c.start_date ? new Date(c.start_date).getTime() : 0))
    : 0
  const lastActivityMs = Math.max(lastMomentTime, lastCycleTime)
  const daysSinceLastActivity = lastActivityMs > 0
    ? Math.floor((Date.now() - lastActivityMs) / MS_PER_DAY)
    : 0

  return {
    roomId,
    roomSlug,
    roomTotalCycles,
    roomCompletedCycles,
    roomTotalMoments,
    roomRecentToHistoricalMomentRatio,
    roomReflectionRatio,
    roomMemberReturnRatio,
    daysSinceLastActivity,
    contradicts: false,
  }
}
