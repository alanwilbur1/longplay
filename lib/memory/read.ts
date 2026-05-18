'use server'

/**
 * lib/memory/read.ts — Phase 3F
 *
 * Server-side summary reads. Each helper returns the smallest
 * trustworthy shape for the calling surface and gracefully degrades
 * to "no data" (empty/null fields) on any error or absent session.
 *
 * RLS already restricts participation_events and moments to the
 * authenticated user; these helpers do not need a service-role client.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ArchiveSpan, CycleParticipation } from './types'

const EMPTY_CYCLE_PARTICIPATION = (cycleId: string): CycleParticipation => ({
  cycleId,
  returnCount: 0,
  momentCount: 0,
  firstReturnAt: null,
  lastReturnAt: null,
})

const EMPTY_ARCHIVE_SPAN: ArchiveSpan = {
  totalMoments: 0,
  firstMomentAt: null,
  lastMomentAt: null,
  participationEventCount: 0,
}

// ── getMyCycleParticipation ─────────────────────────────────────────────────
// Returns the calling user's participation summary for one cycle. Used by
// /room/[slug] to surface "you've returned N times this cycle" type lines.
// Returns the zero state when unauthenticated or on any read error.

export async function getMyCycleParticipation(
  cycleId: string,
): Promise<CycleParticipation> {
  if (!cycleId) return EMPTY_CYCLE_PARTICIPATION(cycleId)
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return EMPTY_CYCLE_PARTICIPATION(cycleId)

    // Two parallel reads:
    //   - listen_start events for this user + cycle (returns count + span)
    //   - moments count for this user + cycle (excluding soft-deletes)
    const [returnsRes, momentsRes] = await Promise.all([
      supabase
        .from('participation_events')
        .select('created_at')
        .eq('member_id', user.id)
        .eq('event_type', 'listen_start')
        .eq('cycle_id', cycleId)
        .order('created_at', { ascending: true }),
      supabase
        .from('moments')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', user.id)
        .eq('cycle_id', cycleId)
        .is('deleted_at', null),
    ])

    const returns = (returnsRes.data ?? []) as Array<{ created_at: string }>
    const momentCount = (momentsRes as unknown as { count: number | null }).count ?? 0

    return {
      cycleId,
      returnCount: returns.length,
      momentCount,
      firstReturnAt: returns[0]?.created_at ?? null,
      lastReturnAt: returns[returns.length - 1]?.created_at ?? null,
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[memory/read] getMyCycleParticipation failed:', err)
    }
    return EMPTY_CYCLE_PARTICIPATION(cycleId)
  }
}

// ── getMyArchiveSpan ────────────────────────────────────────────────────────
// Used by /archive (and /listening-life alias) + /identity. Returns the
// caller's all-time archive timespan plus the participation-event count
// that powers the identity "traces" line.

export async function getMyArchiveSpan(): Promise<ArchiveSpan> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return EMPTY_ARCHIVE_SPAN

    // Three queries in parallel.
    //   - moment count + span (min/max via an ordered limit pair to avoid
    //     a separate aggregation query)
    //   - participation event count
    const [firstRes, lastRes, totalRes, eventsRes] = await Promise.all([
      supabase
        .from('moments')
        .select('created_at')
        .eq('member_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1),
      supabase
        .from('moments')
        .select('created_at')
        .eq('member_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('moments')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', user.id)
        .is('deleted_at', null),
      supabase
        .from('participation_events')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', user.id),
    ])

    const totalMoments = (totalRes as unknown as { count: number | null }).count ?? 0
    const participationEventCount = (eventsRes as unknown as { count: number | null }).count ?? 0
    const first = (firstRes.data?.[0] as { created_at: string } | undefined)?.created_at ?? null
    const last = (lastRes.data?.[0] as { created_at: string } | undefined)?.created_at ?? null

    return {
      totalMoments,
      firstMomentAt: first,
      lastMomentAt: last,
      participationEventCount,
    }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[memory/read] getMyArchiveSpan failed:', err)
    }
    return EMPTY_ARCHIVE_SPAN
  }
}
