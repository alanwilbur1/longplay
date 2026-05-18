/**
 * lib/fading/aggregate.ts — Phase 5B
 *
 * Per-user aggregation of fading & persistence signals. Reads the
 * user's own moments joined to cycle data; uses the authenticated
 * server client so RLS naturally scopes to the calling user.
 *
 * The aggregator computes three classes of fading evidence:
 *
 *   1. Old-moment count: moments whose cycle was archived ≥30 days
 *      ago. Feeds the archive-softening detector.
 *
 *   2. Persistent moments: moments ≥60 days old whose album has at
 *      least one OTHER moment by the same user in a cycle starting
 *      ≥30 days after the persistent moment's own cycle. The 30-day
 *      gap is the recurrence-vs-persistence boundary.
 *
 *   3. Drifted rooms: rooms where the user's moment span is ≥30 days
 *      AND the most recent moment is ≥21 days old. Investment + step
 *      away.
 *
 * All three are derived from a single query — moments with their
 * cycle's start_date, archived_at, and room_id.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type {
  DriftedRoomRecord,
  FadingEvidence,
  PersistentMomentRecord,
} from './types'

interface MomentRow {
  id: string
  album_id: string | null
  cycle_id: string | null
  created_at: string
  cycle: {
    start_date: string | null
    archived_at: string | null
    room_id: string
    room: { slug: string } | null
  } | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

const PERSISTENT_AGE_DAYS = 60
const PERSISTENT_GAP_DAYS = 30
const OLD_ARCHIVE_DAYS = 30
const DRIFT_SPAN_DAYS = 30
const DRIFT_GAP_DAYS = 21

function daysBetween(earlier: string | null, later: string | null): number {
  if (!earlier || !later) return 0
  const a = Date.parse(earlier)
  const b = Date.parse(later)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.floor((b - a) / MS_PER_DAY))
}

const EMPTY_EVIDENCE: FadingEvidence = {
  totalMoments: 0,
  daysSinceLastActivity: 0,
  contradicts: false,
  oldMomentCount: 0,
  persistentMomentCount: 0,
  driftedRoomCount: 0,
  persistentMoments: [],
  driftedRooms: [],
}

export async function gatherFadingEvidence(): Promise<FadingEvidence | null> {
  let supabase
  try {
    supabase = await createSupabaseServerClient()
  } catch {
    return null
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('moments')
    .select('id, album_id, cycle_id, created_at, cycle:cycles!cycle_id(start_date, archived_at, room_id, room:rooms!room_id(slug))')
    .eq('member_id', user.id)
    .is('deleted_at', null)

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[fading/aggregate] read failed:', error.message)
    }
    return null
  }

  const moments = (data ?? []) as unknown as MomentRow[]

  if (moments.length === 0) return EMPTY_EVIDENCE

  const nowISO = new Date().toISOString()
  const totalMoments = moments.length

  // ── Days since last activity ──────────────────────────────────────────
  const latestMomentIso = moments.reduce(
    (latest, m) => (m.created_at > latest ? m.created_at : latest),
    moments[0].created_at,
  )
  const daysSinceLastActivity = daysBetween(latestMomentIso, nowISO)

  // ── Old moments: cycles archived ≥30 days ago ──────────────────────────
  // A cycle is "old" when its archived_at is ≥30 days before today.
  // Moments belonging to those cycles are old-archive moments.
  let oldMomentCount = 0
  for (const m of moments) {
    const archivedAt = m.cycle?.archived_at
    if (!archivedAt) continue
    if (daysBetween(archivedAt, nowISO) >= OLD_ARCHIVE_DAYS) {
      oldMomentCount += 1
    }
  }

  // ── Persistent moments ────────────────────────────────────────────────
  // For each moment ≥60 days old, count how many OTHER moments by
  // the same user share its album and live in a cycle that started
  // ≥30 days after this moment's cycle.
  //
  // Build a per-album list of (momentId, cycleStart) for efficient
  // scanning. The query already returned a small dataset.
  const byAlbum = new Map<string, Array<{ momentId: string; cycleStart: string | null }>>()
  for (const m of moments) {
    if (!m.album_id) continue
    const list = byAlbum.get(m.album_id) ?? []
    list.push({ momentId: m.id, cycleStart: m.cycle?.start_date ?? null })
    byAlbum.set(m.album_id, list)
  }

  const persistentMoments: PersistentMomentRecord[] = []
  for (const m of moments) {
    if (!m.album_id || !m.cycle) continue
    const ageDays = daysBetween(m.created_at, nowISO)
    if (ageDays < PERSISTENT_AGE_DAYS) continue
    const candidates = byAlbum.get(m.album_id) ?? []
    const myCycleStart = m.cycle.start_date
    if (!myCycleStart) continue
    let laterCount = 0
    for (const c of candidates) {
      if (c.momentId === m.id) continue
      if (!c.cycleStart) continue
      if (daysBetween(myCycleStart, c.cycleStart) >= PERSISTENT_GAP_DAYS) {
        laterCount += 1
      }
    }
    if (laterCount >= 1) {
      persistentMoments.push({
        momentId: m.id,
        albumId: m.album_id,
        ageDays,
        laterSameAlbumCount: laterCount,
      })
    }
  }

  // ── Drifted rooms ──────────────────────────────────────────────────────
  // Per-room: span between earliest and latest moment, time since the
  // most recent moment. Drift = span ≥30 days AND gap ≥21 days.
  const byRoom = new Map<string, { minTs: string; maxTs: string }>()
  for (const m of moments) {
    const slug = m.cycle?.room?.slug
    if (!slug) continue
    const rec = byRoom.get(slug)
    if (!rec) {
      byRoom.set(slug, { minTs: m.created_at, maxTs: m.created_at })
    } else {
      if (m.created_at < rec.minTs) rec.minTs = m.created_at
      if (m.created_at > rec.maxTs) rec.maxTs = m.created_at
    }
  }

  const driftedRooms: DriftedRoomRecord[] = []
  for (const [slug, rec] of byRoom.entries()) {
    const spanDays = daysBetween(rec.minTs, rec.maxTs)
    const daysSinceLastMoment = daysBetween(rec.maxTs, nowISO)
    if (spanDays >= DRIFT_SPAN_DAYS && daysSinceLastMoment >= DRIFT_GAP_DAYS) {
      driftedRooms.push({ roomSlug: slug, spanDays, daysSinceLastMoment })
    }
  }

  return {
    totalMoments,
    daysSinceLastActivity,
    contradicts: false,
    oldMomentCount,
    persistentMomentCount: persistentMoments.length,
    driftedRoomCount: driftedRooms.length,
    persistentMoments,
    driftedRooms,
  }
}
