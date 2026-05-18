/**
 * lib/resonance/aggregate.ts — Phase 4B
 *
 * Server-side aggregation of resonance evidence. Reads the user's
 * moments joined to their cycle (for room_id + start_date) and
 * computes per-album and per-room recurrence in memory. RLS confines
 * reads to the authenticated user.
 *
 * The aggregation is intentionally simple — group, count, span. No
 * scoring, no ranking. The thresholds (in lib/interpretation) decide
 * what is honest to surface.
 *
 * Returns null for unauthenticated users or on read failure. Callers
 * treat null as "no evidence" — same as a brand-new user.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type {
  AlbumRecurrenceRecord,
  ResonanceEvidence,
  RoomPersistenceRecord,
} from './types'

interface MomentRow {
  album_id: string | null
  cycle_id: string | null
  created_at: string
  cycle: {
    room_id: string
    start_date: string | null
  } | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysBetween(earliest: string | null, latest: string | null): number {
  if (!earliest || !latest) return 0
  const a = new Date(earliest).getTime()
  const b = new Date(latest).getTime()
  return Math.max(0, Math.floor((b - a) / MS_PER_DAY))
}

export async function gatherResonanceEvidence(): Promise<ResonanceEvidence | null> {
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
    .select('album_id, cycle_id, created_at, cycle:cycles!cycle_id(room_id, start_date)')
    .eq('member_id', user.id)
    .is('deleted_at', null)

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[resonance/aggregate] read failed:', error.message)
    }
    return null
  }

  const moments = (data ?? []) as unknown as MomentRow[]

  // ── Per-album aggregation ───────────────────────────────────────────────
  // For each album_id, collect the distinct cycle_ids and the
  // earliest/latest cycle.start_date that contains a moment by this
  // user. Span is measured in days between those two start_dates —
  // using cycle start_date (not moment.created_at) so a single-week
  // binge with many marks doesn't inflate the span.

  const albumMap = new Map<string, { cycles: Set<string>; minDate: string | null; maxDate: string | null }>()
  for (const m of moments) {
    if (!m.album_id || !m.cycle_id) continue
    const startDate = m.cycle?.start_date ?? null
    const rec = albumMap.get(m.album_id) ?? { cycles: new Set<string>(), minDate: null, maxDate: null }
    rec.cycles.add(m.cycle_id)
    if (startDate) {
      if (!rec.minDate || startDate < rec.minDate) rec.minDate = startDate
      if (!rec.maxDate || startDate > rec.maxDate) rec.maxDate = startDate
    }
    albumMap.set(m.album_id, rec)
  }

  const albumRecurrences: AlbumRecurrenceRecord[] = Array.from(albumMap.entries()).map(
    ([albumId, v]) => ({
      albumId,
      cycleCount: v.cycles.size,
      spanDays: daysBetween(v.minDate, v.maxDate),
    }),
  )

  // ── Per-room aggregation ────────────────────────────────────────────────
  // Same pattern, grouped by cycle.room_id instead of album_id.

  const roomMap = new Map<string, { cycles: Set<string>; minDate: string | null; maxDate: string | null }>()
  for (const m of moments) {
    const roomId = m.cycle?.room_id
    if (!roomId || !m.cycle_id) continue
    const startDate = m.cycle.start_date ?? null
    const rec = roomMap.get(roomId) ?? { cycles: new Set<string>(), minDate: null, maxDate: null }
    rec.cycles.add(m.cycle_id)
    if (startDate) {
      if (!rec.minDate || startDate < rec.minDate) rec.minDate = startDate
      if (!rec.maxDate || startDate > rec.maxDate) rec.maxDate = startDate
    }
    roomMap.set(roomId, rec)
  }

  const roomPersistences: RoomPersistenceRecord[] = Array.from(roomMap.entries()).map(
    ([roomId, v]) => ({
      roomId,
      cycleCount: v.cycles.size,
      spanDays: daysBetween(v.minDate, v.maxDate),
    }),
  )

  // ── Maxima + counts for the threshold rules ─────────────────────────────
  const maxAlbumRec = albumRecurrences.reduce((max, r) => (r.cycleCount > max.cycleCount ? r : max),
    { cycleCount: 0, spanDays: 0 } as AlbumRecurrenceRecord)
  const maxRoomPer = roomPersistences.reduce((max, r) => (r.cycleCount > max.cycleCount ? r : max),
    { cycleCount: 0, spanDays: 0 } as RoomPersistenceRecord)

  // Days since last activity (for the dormancy demotion). The latest
  // moment's created_at is the simplest proxy.
  const lastMoment = moments.length > 0
    ? moments.reduce((latest, m) => (m.created_at > latest ? m.created_at : latest), moments[0].created_at)
    : null
  const daysSinceLastActivity = lastMoment
    ? Math.floor((Date.now() - new Date(lastMoment).getTime()) / MS_PER_DAY)
    : 0

  return {
    daysSinceLastActivity,
    contradicts: false,
    maxAlbumRecurrence: maxAlbumRec.cycleCount,
    maxAlbumRecurrenceDays: maxAlbumRec.spanDays,
    maxRoomPersistence: maxRoomPer.cycleCount,
    maxRoomPersistenceDays: maxRoomPer.spanDays,
    recurringAlbumCount: albumRecurrences.filter(r => r.cycleCount >= 2 && r.spanDays >= 21).length,
    persistentRoomCount: roomPersistences.filter(r => r.cycleCount >= 3 && r.spanDays >= 42).length,
    albumRecurrences,
    roomPersistences,
  }
}
