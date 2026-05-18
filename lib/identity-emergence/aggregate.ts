/**
 * lib/identity-emergence/aggregate.ts — Phase 4A
 *
 * Server-side aggregation of all longitudinal evidence the system
 * needs to assess tendency emergence. Reads from participation_events,
 * moments, and cycles/rooms (via FK join). RLS confines the reads to
 * the authenticated user; this helper does not need a service-role
 * client.
 *
 * Returns null when the listener is unauthenticated or when the
 * reads fail. Callers treat null as "no evidence" — same as a brand
 * new user with no history.
 *
 * This is the one place the identity-emergence module touches the
 * database. Tendency detection (tendencies.ts) and copy generation
 * (language.ts) are pure consumers of the evidence shape.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { IdentityEvidence, RoomReturnRecord } from './types'

interface EventRow {
  event_type: string
  created_at: string
  cycle_id: string | null
  cycle: {
    room_id: string
    room: { slug: string; name: string } | null
  } | null
}

interface MomentRow {
  type: string
  created_at: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export async function gatherIdentityEvidence(): Promise<IdentityEvidence | null> {
  let supabase
  try {
    supabase = await createSupabaseServerClient()
  } catch {
    return null
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Two parallel reads. Both are RLS-scoped to the calling user.
  const [eventsRes, momentsRes] = await Promise.all([
    supabase
      .from('participation_events')
      .select('event_type, created_at, cycle_id, cycle:cycles!cycle_id(room_id, room:rooms!room_id(slug,name))')
      .eq('member_id', user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('moments')
      .select('type, created_at')
      .eq('member_id', user.id)
      .is('deleted_at', null),
  ])

  if (eventsRes.error || momentsRes.error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[identity-emergence/aggregate] read failed',
        eventsRes.error?.message ?? momentsRes.error?.message)
    }
    return null
  }

  const events = (eventsRes.data ?? []) as unknown as EventRow[]
  const moments = (momentsRes.data ?? []) as unknown as MomentRow[]

  // ── Temporal aggregates ────────────────────────────────────────────────
  const now = Date.now()
  const firstEventAt = events[0]?.created_at
  const lastEventAt = events[events.length - 1]?.created_at
  const daysActive = firstEventAt
    ? Math.floor((now - new Date(firstEventAt).getTime()) / MS_PER_DAY)
    : 0
  const daysSinceLastActivity = lastEventAt
    ? Math.floor((now - new Date(lastEventAt).getTime()) / MS_PER_DAY)
    : 0

  // ── Cycle aggregates ───────────────────────────────────────────────────
  const cycleSet = new Set<string>()
  for (const ev of events) {
    if (ev.cycle_id) cycleSet.add(ev.cycle_id)
  }
  const cyclesParticipated = cycleSet.size
  const cyclesEngagedWith = Array.from(cycleSet)

  // ── Per-room return distribution (from listen_start events) ───────────
  const roomMap = new Map<string, { returns: number; cycles: Set<string> }>()
  for (const ev of events) {
    if (ev.event_type !== 'listen_start') continue
    const slug = ev.cycle?.room?.slug
    if (!slug) continue
    const rec = roomMap.get(slug) ?? { returns: 0, cycles: new Set<string>() }
    rec.returns += 1
    if (ev.cycle_id) rec.cycles.add(ev.cycle_id)
    roomMap.set(slug, rec)
  }
  const roomReturnDistribution: RoomReturnRecord[] = Array.from(roomMap.entries()).map(
    ([slug, v]) => ({ roomSlug: slug, returns: v.returns, cyclesActive: v.cycles.size }),
  )
  const distinctRoomsTouched = roomMap.size
  const roomReturnsLifetime = Array.from(roomMap.values()).reduce(
    (s, r) => s + r.returns,
    0,
  )

  // ── Moment-type distribution ──────────────────────────────────────────
  const momentsByType: Record<string, number> = {}
  for (const m of moments) {
    const t = m.type
    momentsByType[t] = (momentsByType[t] ?? 0) + 1
  }

  return {
    // Phase 3G base evidence
    daysActive,
    daysSinceLastActivity,
    totalMoments: moments.length,
    totalEvents: events.length,
    cyclesParticipated,
    distinctRoomsTouched,
    roomReturnsLifetime,
    contradicts: false,
    // Identity-specific evidence
    roomReturnDistribution,
    momentsByType,
    cyclesEngagedWith,
  }
}
