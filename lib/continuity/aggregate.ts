/**
 * lib/continuity/aggregate.ts — Phase 5A
 *
 * Two aggregators:
 *
 *   gatherUserContinuity()
 *     User-scoped. Reads the calling user's most recent activity to
 *     compute daysSinceUserLastActivity. Requires auth; returns null
 *     when unauthenticated (caller renders nothing for absence
 *     detection).
 *
 *   gatherCycleContinuity(cycleStartDate, cycleEndDate)
 *     Pure function over already-known cycle dates. No DB read. Pure
 *     because the caller (active room page) already has the cycle's
 *     start/end via the Phase 2 room assembler.
 *
 * The two are designed to compose: a surface can call both and feed
 * the merged evidence into detectors.ts.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ContinuityEvidence } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** User-scoped: how long since the calling user's most recent
 *  participation_event. Returns Evidence with only the user fields
 *  populated; cycle fields stay undefined. Returns null when
 *  unauthenticated or on read failure — caller's UI treats null as
 *  zero-evidence and shows no continuity line. */
export async function gatherUserContinuity(): Promise<ContinuityEvidence | null> {
  let supabase
  try {
    supabase = await createSupabaseServerClient()
  } catch {
    return null
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // The most recent event timestamp is the freshest signal of
  // activity. Falls back to moments if no events have been recorded
  // (very early-account state). Either is sufficient.
  const { data: latestEvent } = await supabase
    .from('participation_events')
    .select('created_at')
    .eq('member_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)

  let lastActivityIso: string | null = null
  if (latestEvent && latestEvent.length > 0) {
    lastActivityIso = (latestEvent[0] as { created_at: string }).created_at
  } else {
    const { data: latestMoment } = await supabase
      .from('moments')
      .select('created_at')
      .eq('member_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
    if (latestMoment && latestMoment.length > 0) {
      lastActivityIso = (latestMoment[0] as { created_at: string }).created_at
    }
  }

  if (!lastActivityIso) {
    // No activity yet — not "returning after absence" because there
    // is no prior activity to be absent from. Silent.
    return { today: todayISO() }
  }

  const lastMs = new Date(lastActivityIso).getTime()
  const daysSince = Math.floor((Date.now() - lastMs) / MS_PER_DAY)

  return {
    daysSinceUserLastActivity: Math.max(0, daysSince),
    today: todayISO(),
  }
}

/** Cycle-scoped: pure function over a known cycle's start/end dates.
 *  Returns Evidence with only the cycle fields populated. */
export function gatherCycleContinuity(
  cycleStartDate: string | null | undefined,
  cycleEndDate: string | null | undefined,
): ContinuityEvidence {
  return {
    cycleStartDate: cycleStartDate ?? undefined,
    cycleEndDate: cycleEndDate ?? undefined,
    today: todayISO(),
  }
}

/** Compose two Evidence objects. Later values override earlier ones
 *  where both define a field; useful for surfaces that want both
 *  user and cycle signals fed to a single detector pass. */
export function mergeContinuity(
  a: ContinuityEvidence | null,
  b: ContinuityEvidence | null,
): ContinuityEvidence {
  return {
    ...(a ?? {}),
    ...(b ?? {}),
    today: (b?.today ?? a?.today) ?? todayISO(),
  }
}
