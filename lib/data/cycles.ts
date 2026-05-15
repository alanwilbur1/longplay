/**
 * lib/data/cycles.ts
 *
 * DB-backed listening cycle helpers. Returns objects that exactly match the
 * ListeningCycle interface from lib/cycles.ts.
 *
 * cycle_summary JSONB stores unmapped UI fields:
 *   curatorNote, prompts, emotionalThemes, sonicDimensions,
 *   userEngagement, identityImpact, keyAnnotations, stillResonates,
 *   legacyId (the original string id from static data)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assembleAlbum } from './albums'
import type { ListeningCycle, ListeningEra } from '../cycles'

// ── Public-read client ───────────────────────────────────────────────────────

function getDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('[data/cycles] Supabase env vars not set')
  return createClient(url, key)
}

// ── Assembler ────────────────────────────────────────────────────────────────

function assembleCycle(
  row: Record<string, unknown>,
  albumRow: Record<string, unknown> | null,
  roomRow: Record<string, unknown> | null,
  curatorName: string,
): ListeningCycle {
  const summary = (row.cycle_summary as Record<string, unknown>) ?? {}

  const album = albumRow
    ? assembleAlbum(albumRow)
    : {
        id: 'unknown',
        title: '',
        artist: '',
        year: '',
        cover: '',
        fallbackGradient: 'from-slate-800 to-slate-900',
      }

  return {
    id: (summary.legacyId as string) ?? (row.id as string),
    week: (row.week_number as number) ?? 0,
    year: (row.year as number) ?? new Date().getFullYear(),
    album,
    room: {
      id: (roomRow?.slug as string) ?? '',
      name: (roomRow?.name as string) ?? '',
      curator: curatorName,
    },
    startDate: (row.start_date as string) ?? '',
    endDate: (row.end_date as string) ?? '',
    seasonLabel: (row.season_label as string) ?? '',
    curatorNote: (summary.curatorNote as ListeningCycle['curatorNote']) ?? {
      title: '',
      excerpt: '',
      fullText: '',
      author: '',
    },
    prompts: (summary.prompts as ListeningCycle['prompts']) ?? [],
    emotionalThemes: (row.emotional_themes as string[]) ?? [],
    sonicDimensions:
      (summary.sonicDimensions as ListeningCycle['sonicDimensions']) ?? [],
    userEngagement:
      (summary.userEngagement as ListeningCycle['userEngagement']) ?? {
        listeningSessions: 0,
        annotations: row.annotation_count as number ?? 0,
        savedMoments: 0,
        discussionContributions: row.discussion_contributions as number ?? 0,
      },
    identityImpact:
      (summary.identityImpact as ListeningCycle['identityImpact']) ?? {
        archetypeBefore: '',
        archetypeAfter: '',
        shiftDescription: '',
        dimensionsAffected: [],
      },
    keyAnnotations:
      (summary.keyAnnotations as ListeningCycle['keyAnnotations']) ?? [],
    stillResonates:
      (summary.stillResonates as ListeningCycle['stillResonates']) ?? {
        isTrue: false,
        returnsSince: 0,
      },
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getPastCycles(): Promise<ListeningCycle[]> {
  const db = getDb()

  const { data: cycleRows, error } = await db
    .from('cycles')
    .select('*, album:albums!album_id(*), room:rooms!room_id(slug,name,curator_id)')
    .eq('current_phase', 'archived')
    .order('start_date', { ascending: false })

  if (error || !cycleRows?.length) return []

  // Collect curator ids to batch-fetch names
  const curatorIds = [
    ...new Set(
      (cycleRows as Record<string, unknown>[])
        .map(r => (r.room as Record<string, unknown>)?.curator_id as string)
        .filter(Boolean),
    ),
  ]
  const { data: curatorRows } = curatorIds.length
    ? await db.from('curators').select('id,name').in('id', curatorIds)
    : { data: [] }
  const curatorMap = Object.fromEntries(
    (curatorRows ?? []).map((c: Record<string, unknown>) => [c.id, c.name]),
  )

  return (cycleRows as Record<string, unknown>[]).map(row => {
    const room = row.room as Record<string, unknown> | null
    const curatorId = room?.curator_id as string
    return assembleCycle(
      row,
      row.album as Record<string, unknown> | null,
      room,
      (curatorMap[curatorId] as string) ?? '',
    )
  })
}

export async function getResonatingCycles(): Promise<ListeningCycle[]> {
  const db = getDb()

  const { data: cycleRows, error } = await db
    .from('cycles')
    .select('*, album:albums!album_id(*), room:rooms!room_id(slug,name,curator_id)')
    .eq('current_phase', 'archived')
    .order('annotation_count', { ascending: false })
    .limit(5)

  if (error || !cycleRows?.length) return []

  const curatorIds = [
    ...new Set(
      (cycleRows as Record<string, unknown>[])
        .map(r => (r.room as Record<string, unknown>)?.curator_id as string)
        .filter(Boolean),
    ),
  ]
  const { data: curatorRows } = curatorIds.length
    ? await db.from('curators').select('id,name').in('id', curatorIds)
    : { data: [] }
  const curatorMap = Object.fromEntries(
    (curatorRows ?? []).map((c: Record<string, unknown>) => [c.id, c.name]),
  )

  return (cycleRows as Record<string, unknown>[]).map(row => {
    const room = row.room as Record<string, unknown> | null
    const curatorId = room?.curator_id as string
    return assembleCycle(
      row,
      row.album as Record<string, unknown> | null,
      room,
      (curatorMap[curatorId] as string) ?? '',
    )
  })
}

export async function getCyclesByRoom(roomSlug: string): Promise<ListeningCycle[]> {
  const db = getDb()

  const { data: roomData } = await db
    .from('rooms')
    .select('id,slug,name,curator_id')
    .eq('slug', roomSlug)
    .single()

  if (!roomData) return []

  const { data: cycleRows, error } = await db
    .from('cycles')
    .select('*, album:albums!album_id(*)')
    .eq('room_id', (roomData as Record<string, unknown>).id)
    .order('start_date', { ascending: false })

  if (error || !cycleRows?.length) return []

  const { data: curatorRow } = await db
    .from('curators')
    .select('name')
    .eq('id', (roomData as Record<string, unknown>).curator_id)
    .single()

  const curatorName = (curatorRow as Record<string, unknown> | null)?.name as string ?? ''

  return (cycleRows as Record<string, unknown>[]).map(row =>
    assembleCycle(
      row,
      row.album as Record<string, unknown> | null,
      roomData as Record<string, unknown>,
      curatorName,
    ),
  )
}

export async function getCurrentCycleForRoom(roomSlug: string): Promise<ListeningCycle | null> {
  const db = getDb()

  const { data: roomData } = await db
    .from('rooms')
    .select('id,slug,name,curator_id,current_cycle_id')
    .eq('slug', roomSlug)
    .single()

  if (!roomData || !(roomData as Record<string, unknown>).current_cycle_id) return null

  const { data: cycleRow } = await db
    .from('cycles')
    .select('*, album:albums!album_id(*)')
    .eq('id', (roomData as Record<string, unknown>).current_cycle_id)
    .single()

  if (!cycleRow) return null

  const { data: curatorRow } = await db
    .from('curators')
    .select('name')
    .eq('id', (roomData as Record<string, unknown>).curator_id)
    .single()

  return assembleCycle(
    cycleRow as Record<string, unknown>,
    (cycleRow as Record<string, unknown>).album as Record<string, unknown> | null,
    roomData as Record<string, unknown>,
    (curatorRow as Record<string, unknown> | null)?.name as string ?? '',
  )
}

/**
 * Compute total engagement stats across all past cycles.
 * Mirrors getTotalEngagement() from lib/cycles.ts.
 */
export async function getTotalEngagementFromDb(): Promise<{
  totalAnnotations: number
  totalSessions: number
  totalCycles: number
  totalRooms: number
}> {
  const cycles = await getPastCycles()
  return {
    totalAnnotations: cycles.reduce(
      (sum, c) => sum + (c.userEngagement?.annotations ?? 0),
      0,
    ),
    totalSessions: cycles.reduce(
      (sum, c) => sum + (c.userEngagement?.listeningSessions ?? 0),
      0,
    ),
    totalCycles: cycles.length,
    totalRooms: new Set(cycles.map(c => c.room.id)).size,
  }
}

/**
 * Build ListeningEras from DB cycles.
 * Groups by season label to produce era-level summaries.
 * Mirrors the LISTENING_ERAS structure from lib/cycles.ts.
 */
export async function getListeningErasFromDb(): Promise<ListeningEra[]> {
  const cycles = await getPastCycles()
  const byEra = new Map<string, ListeningCycle[]>()

  for (const cycle of cycles) {
    const label = cycle.seasonLabel || 'Archive'
    if (!byEra.has(label)) byEra.set(label, [])
    byEra.get(label)!.push(cycle)
  }

  const eras: ListeningEra[] = []
  for (const [label, eraCycles] of byEra.entries()) {
    const sorted = eraCycles.sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    )
    const allThemes = eraCycles.flatMap(c => c.emotionalThemes)
    const uniqueThemes = [...new Set(allThemes)].slice(0, 4)
    const totalAnnotations = eraCycles.reduce(
      (s, c) => s + (c.userEngagement?.annotations ?? 0),
      0,
    )

    eras.push({
      id: label.toLowerCase().replace(/\s+/g, '-'),
      name: label,
      timeRange:
        sorted[0]?.startDate && sorted[sorted.length - 1]?.endDate
          ? `${sorted[0].startDate} – ${sorted[sorted.length - 1].endDate}`
          : label,
      description: `Your ${label} listening journey.`,
      dominantThemes: uniqueThemes,
      dominantSonic: [],
      archetypeJourney: {
        start: sorted[0]?.identityImpact?.archetypeBefore ?? '',
        end: sorted[sorted.length - 1]?.identityImpact?.archetypeAfter ?? '',
      },
      cycles: eraCycles,
      totalAnnotations,
      formativeRecord: eraCycles[0]?.album,
    })
  }

  return eras.sort(
    (a, b) => new Date(b.timeRange).getTime() - new Date(a.timeRange).getTime(),
  )
}
