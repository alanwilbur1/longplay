/**
 * lib/data/rooms.ts
 *
 * DB-backed room helpers. Returns objects that exactly match the Room interface
 * from lib/rooms.ts. All reads use the public (anon) client; public-read RLS
 * policies must be in place (see lib/schema-phase2.sql).
 *
 * culture_extras JSONB on the rooms table stores unmapped UI fields:
 *   invitationText, entryPhrase, associatedArchetypes (rich), albumSample
 *   (ordered slug array), weeklyPhase, phaseDay.
 *
 * Query strategy: explicit per-entity queries batched for the list case to
 * avoid N+1 round trips. No generic ORM abstraction.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assembleAlbum } from './albums'
import type {
  Room,
  RoomType,
  CuratorProfile,
  RoomCulture,
  RoomAesthetics,
  RoomPastCycle,
} from '../rooms'
import type { Album } from '../albums'

// ── Public-read client ───────────────────────────────────────────────────────

function getDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('[data/rooms] Supabase env vars not set')
  return createClient(url, key)
}

// ── Assembler ────────────────────────────────────────────────────────────────

function assembleCuratorProfile(
  curator: Record<string, unknown>,
  favoriteAlbums: Album[],
): CuratorProfile {
  return {
    id:
      (curator.slug as string) ??
      (curator.name as string)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),
    name: (curator.name as string) ?? '',
    role: (curator.role as string) ?? '',
    avatar: (curator.avatar_url as string) ?? undefined,
    listeningPhilosophy: (curator.listening_philosophy as string) ?? '',
    curatorStatement: (curator.curator_statement as string) ?? '',
    favoriteRecords: favoriteAlbums,
    currentObsessions: (curator.current_obsessions as string[]) ?? [],
    recurringThemes: (curator.recurring_themes as string[]) ?? [],
    publications:
      (curator.publications as string[] | null)?.length
        ? (curator.publications as string[])
        : undefined,
    credentials: (curator.credentials as string) ?? undefined,
  }
}

function assembleRoom(
  row: Record<string, unknown>,
  curatorRow: Record<string, unknown>,
  favoriteAlbums: Album[],
  currentCycle: Record<string, unknown> | null,
  cycleAlbumRow: Record<string, unknown> | null,
  cyclePrompts: Record<string, unknown>[],
  curatorEssay: Record<string, unknown> | null,
  pastCycleRows: Record<string, unknown>[],
  albumSamples: Album[],
  cultureExtras: Record<string, unknown>,
): Room {
  const aesthetics = (row.aesthetics as RoomAesthetics) ?? {
    themeClass: '',
    primaryAccent: '',
    backgroundGradient: '',
    borderTint: '',
    typographyStyle: 'intimate' as const,
    transitionSpeed: 'medium' as const,
    grainOpacity: 0.03,
    spacingRhythm: 'breathable' as const,
  }

  const seasonalMoods = (row.seasonal_moods as RoomCulture['seasonalMoods']) ?? {
    winter: { description: '', moodShift: '' },
    spring: { description: '', moodShift: '' },
    summer: { description: '', moodShift: '' },
    autumn: { description: '', moodShift: '' },
  }

  const curatorProfile = assembleCuratorProfile(curatorRow, favoriteAlbums)

  const currentAlbum: Album = cycleAlbumRow
    ? assembleAlbum(cycleAlbumRow)
    : {
        id: 'unknown',
        title: 'Unknown Album',
        artist: 'Unknown Artist',
        year: '',
        cover: '',
        fallbackGradient: 'from-charcoal to-card',
      }

  const streamingLinks: Room['streamingLinks'] = {}
  if (cycleAlbumRow?.streaming_urls) {
    const urls = cycleAlbumRow.streaming_urls as Record<string, string>
    if (urls.spotify) streamingLinks.spotify = urls.spotify
    if (urls.appleMusic) streamingLinks.appleMusic = urls.appleMusic
    if (urls.tidal) streamingLinks.tidal = urls.tidal
  }

  const pastCycles: RoomPastCycle[] = pastCycleRows.map(pc => {
    const summary = (pc.cycle_summary as Record<string, unknown>) ?? {}
    const pcAlbum = pc.album as Record<string, unknown> | null
    return {
      id: (summary.legacyId as string) ?? (pc.id as string),
      album: pcAlbum ? assembleAlbum(pcAlbum) : currentAlbum,
      dateRange:
        (summary.dateRangeLabel as string) ??
        `${pc.start_date} – ${pc.end_date}`,
      annotationCount: (pc.annotation_count as number) ?? 0,
      highlights: (summary.highlights as string[]) ?? [],
    }
  })

  const culture: RoomCulture = {
    manifesto: (row.manifesto as string) ?? '',
    listeningRitual: (row.listening_ritual as string) ?? '',
    whatWeLookFor: (row.what_we_look_for as string[]) ?? [],
    whatWeAvoid: (row.what_we_avoid as string[]) ?? [],
    invitationText: (cultureExtras.invitationText as string) ?? '',
    entryPhrase: (cultureExtras.entryPhrase as string) ?? 'Enter Room',
    associatedArchetypes:
      (cultureExtras.associatedArchetypes as RoomCulture['associatedArchetypes']) ?? [],
    relatedRooms: (row.related_rooms as string[]) ?? [],
    seasonalMoods,
  }

  // weeklyPhase: prefer stored value, fall back to current cycle's phase
  const rawPhase =
    (cultureExtras.weeklyPhase as string) ??
    (currentCycle?.current_phase as string) ??
    'private'

  // Map DB phase names to Room.weeklyPhase union
  const phaseMap: Record<string, Room['weeklyPhase']> = {
    upcoming: 'arrival',
    arrival: 'arrival',
    private: 'private',
    discussion: 'discussion',
    'curators-note': 'curators-note',
    'identity-update': 'curators-note',
    archived: 'private',
    annotation: 'private',
    prompts: 'private',
    album: 'arrival',
  }
  const weeklyPhase: Room['weeklyPhase'] = phaseMap[rawPhase] ?? 'private'

  return {
    id: row.slug as string,
    slug: row.slug as string,
    name: (row.name as string) ?? '',
    type: (row.type as RoomType) ?? 'editorial',
    description: (row.description as string) ?? '',
    tagline: (row.tagline as string) ?? undefined,
    atmosphere: (row.atmosphere as string) ?? '',
    emotionalTemperature:
      ((row.emotional_temperature as string) as Room['emotionalTemperature']) ?? 'neutral',
    currentAlbum,
    weeklyPhase,
    phaseDay: (cultureExtras.phaseDay as string) ?? 'Wednesday',
    curator: curatorProfile,
    curatorNote: curatorEssay
      ? {
          title: (curatorEssay.title as string) ?? '',
          excerpt: (curatorEssay.excerpt as string) ?? '',
          fullText: (curatorEssay.full_text as string) ?? '',
        }
      : { title: '', excerpt: '', fullText: '' },
    prompts: cyclePrompts
      .sort((a, b) => (a.display_order as number) - (b.display_order as number))
      .map(p => ({
        question: (p.question as string) ?? '',
        hint: (p.hint as string) ?? '',
      })),
    streamingLinks,
    memberCountLabel: (row.member_count_label as string) ?? '0 listeners',
    atmosphereNotes: (row.atmosphere_notes as string[]) ?? [],
    albumSample: albumSamples,
    pastCycles,
    emotionalTags: (row.emotional_tags as string[]) ?? [],
    sonicTags: (row.sonic_tags as string[]) ?? [],
    culture,
    aesthetics,
    currentSeason: (row.current_season as Room['currentSeason']) ?? undefined,
    cycleId: (currentCycle?.id as string) ?? null,
  }
}

// ── Single room fetch ────────────────────────────────────────────────────────

export async function getRoomBySlug(slug: string): Promise<Room | undefined> {
  const db = getDb()

  // Room + curator
  const { data: roomRow, error: roomErr } = await db
    .from('rooms')
    .select('*, curator:curators!curator_id(*)')
    .eq('slug', slug)
    .single()

  if (roomErr || !roomRow) return undefined

  const row = roomRow as Record<string, unknown>
  const curatorRow = (row.curator as Record<string, unknown>) ?? {}
  const cultureExtras = (row.culture_extras as Record<string, unknown>) ?? {}

  // Run secondary queries in parallel
  const currentCycleId = row.current_cycle_id as string | null

  const [
    cycleResult,
    favoriteAlbumsResult,
    pastCyclesResult,
    albumSamplesResult,
  ] = await Promise.all([
    // Current cycle + album + prompts + essay
    currentCycleId
      ? db
          .from('cycles')
          .select('*, album:albums!album_id(*)')
          .eq('id', currentCycleId)
          .single()
          .then(async r => {
            if (!r.data) return { cycle: null, prompts: [], essay: null }
            const cycle = r.data as Record<string, unknown>
            const [promptsRes, essayRes] = await Promise.all([
              db
                .from('cycle_prompts')
                .select('*')
                .eq('cycle_id', currentCycleId)
                .order('display_order'),
              cycle.curator_essay_id
                ? db
                    .from('curator_essays')
                    .select('*')
                    .eq('id', cycle.curator_essay_id)
                    .single()
                    .then(e => e.data)
                : Promise.resolve(null),
            ])
            return {
              cycle,
              prompts: (promptsRes.data ?? []) as Record<string, unknown>[],
              essay: essayRes as Record<string, unknown> | null,
            }
          })
      : Promise.resolve({ cycle: null, prompts: [], essay: null }),

    // Curator favorite albums
    (curatorRow.favorite_record_ids as string[] | null)?.length
      ? db
          .from('albums')
          .select('*')
          .in('id', curatorRow.favorite_record_ids as string[])
          .then(r =>
            ((r.data ?? []) as Record<string, unknown>[]).map(assembleAlbum),
          )
      : Promise.resolve([] as Album[]),

    // Past cycles for this room (archived, not current)
    db
      .from('cycles')
      .select('*, album:albums!album_id(*)')
      .eq('room_id', row.id)
      .eq('current_phase', 'archived')
      .not('id', 'eq', currentCycleId ?? '00000000-0000-0000-0000-000000000000')
      .order('start_date', { ascending: false })
      .limit(5)
      .then(r => (r.data ?? []) as Record<string, unknown>[]),

    // Album samples (slugs stored in culture_extras)
    (cultureExtras.albumSample as string[] | null)?.length
      ? db
          .from('albums')
          .select('*')
          .in('slug', cultureExtras.albumSample as string[])
          .then(r => {
            const rows = ((r.data ?? []) as Record<string, unknown>[]).map(
              assembleAlbum,
            )
            const order = cultureExtras.albumSample as string[]
            return order
              .map(s => rows.find(a => a.id === s))
              .filter((a): a is Album => a !== undefined)
          })
      : Promise.resolve([] as Album[]),
  ])

  return assembleRoom(
    row,
    curatorRow,
    favoriteAlbumsResult,
    cycleResult.cycle,
    cycleResult.cycle?.album as Record<string, unknown> | null,
    cycleResult.prompts,
    cycleResult.essay,
    pastCyclesResult,
    albumSamplesResult,
    cultureExtras,
  )
}

// ── Bulk room fetch ──────────────────────────────────────────────────────────

export async function listAllRooms(): Promise<Room[]> {
  const db = getDb()

  // 1. All rooms + curators
  const { data: roomRows, error } = await db
    .from('rooms')
    .select('*, curator:curators!curator_id(*)')
    .order('created_at')

  if (error || !roomRows?.length) return []

  const rows = roomRows as Record<string, unknown>[]

  // Collect ids for batched queries
  const cycleIds = rows
    .map(r => r.current_cycle_id as string)
    .filter(Boolean)
  const roomIds = rows.map(r => r.id as string)
  const allAlbumSlugs: string[] = []
  const cultureExtrasMap: Record<string, Record<string, unknown>> = {}
  const favoriteIdSets: Record<string, string[]> = {}

  for (const row of rows) {
    const ce = (row.culture_extras as Record<string, unknown>) ?? {}
    cultureExtrasMap[row.id as string] = ce
    if ((ce.albumSample as string[] | null)?.length) {
      allAlbumSlugs.push(...(ce.albumSample as string[]))
    }
    const curator = row.curator as Record<string, unknown>
    const favIds = (curator?.favorite_record_ids as string[] | null) ?? []
    if (favIds.length) favoriteIdSets[row.id as string] = favIds
  }
  const allFavIds = [...new Set(Object.values(favoriteIdSets).flat())]
  const uniqueSlugs = [...new Set(allAlbumSlugs)]

  // 2. Batch queries in parallel
  const [
    cycleRows,
    promptRows,
    essayRows,
    albumSampleRows,
    favoriteAlbumRows,
    pastCycleRows,
  ] = await Promise.all([
    cycleIds.length
      ? db
          .from('cycles')
          .select('*, album:albums!album_id(*)')
          .in('id', cycleIds)
          .then(r => (r.data ?? []) as Record<string, unknown>[])
      : Promise.resolve([] as Record<string, unknown>[]),

    cycleIds.length
      ? db
          .from('cycle_prompts')
          .select('*')
          .in('cycle_id', cycleIds)
          .order('display_order')
          .then(r => (r.data ?? []) as Record<string, unknown>[])
      : Promise.resolve([] as Record<string, unknown>[]),

    // essay ids collected after cycle fetch — run as a follow-up
    Promise.resolve([] as Record<string, unknown>[]),

    uniqueSlugs.length
      ? db
          .from('albums')
          .select('*')
          .in('slug', uniqueSlugs)
          .then(r => (r.data ?? []) as Record<string, unknown>[])
      : Promise.resolve([] as Record<string, unknown>[]),

    allFavIds.length
      ? db
          .from('albums')
          .select('*')
          .in('id', allFavIds)
          .then(r => (r.data ?? []) as Record<string, unknown>[])
      : Promise.resolve([] as Record<string, unknown>[]),

    roomIds.length
      ? db
          .from('cycles')
          .select('*, album:albums!album_id(*)')
          .in('room_id', roomIds)
          .not('id', 'in', `(${cycleIds.length ? cycleIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
          .eq('current_phase', 'archived')
          .order('start_date', { ascending: false })
          .then(r => (r.data ?? []) as Record<string, unknown>[])
      : Promise.resolve([] as Record<string, unknown>[]),
  ])

  // Fetch essays for current cycles
  const essayIds = cycleRows
    .map(c => c.curator_essay_id as string)
    .filter(Boolean)
  const fetchedEssayRows = essayIds.length
    ? await db
        .from('curator_essays')
        .select('*')
        .in('id', essayIds)
        .then(r => (r.data ?? []) as Record<string, unknown>[])
    : ([] as Record<string, unknown>[])

  // Build lookup maps
  const cycleMap = Object.fromEntries(cycleRows.map(c => [c.id, c]))
  const promptsByGroup: Record<string, Record<string, unknown>[]> = {}
  for (const p of promptRows) {
    const cid = p.cycle_id as string
    if (!promptsByGroup[cid]) promptsByGroup[cid] = []
    promptsByGroup[cid].push(p)
  }
  const essayMap = Object.fromEntries(
    [...essayRows, ...fetchedEssayRows].map(e => [e.id, e]),
  )
  const albumSampleMap = Object.fromEntries(
    albumSampleRows.map(a => [a.slug, a]),
  )
  const favoriteAlbumMap = Object.fromEntries(
    favoriteAlbumRows.map(a => [a.id, a]),
  )
  const pastCyclesByRoom: Record<string, Record<string, unknown>[]> = {}
  for (const pc of pastCycleRows) {
    const rid = pc.room_id as string
    if (!pastCyclesByRoom[rid]) pastCyclesByRoom[rid] = []
    pastCyclesByRoom[rid].push(pc)
  }

  // Assemble
  return rows.map(row => {
    const curatorRow = (row.curator as Record<string, unknown>) ?? {}
    const cultureExtras = cultureExtrasMap[row.id as string] ?? {}
    const currentCycleId = row.current_cycle_id as string | null
    const currentCycle = currentCycleId ? cycleMap[currentCycleId] : null
    const cycleAlbum = (currentCycle?.album as Record<string, unknown>) ?? null
    const cyclePromptsForRoom = currentCycleId
      ? (promptsByGroup[currentCycleId] ?? [])
      : []
    const curatorEssayId = currentCycle?.curator_essay_id as string | null
    const curatorEssay = curatorEssayId ? (essayMap[curatorEssayId] ?? null) : null

    const favIds = (favoriteIdSets[row.id as string] ?? []) as string[]
    const favoriteAlbums = favIds
      .map(id => favoriteAlbumMap[id])
      .filter(Boolean)
      .map(a => assembleAlbum(a as Record<string, unknown>))

    const sampleSlugs = (cultureExtras.albumSample as string[] | null) ?? []
    const albumSamples = sampleSlugs
      .map(s => albumSampleMap[s])
      .filter(Boolean)
      .map(a => assembleAlbum(a as Record<string, unknown>))

    const roomPastCycles = (pastCyclesByRoom[row.id as string] ?? []).slice(0, 5)

    return assembleRoom(
      row,
      curatorRow,
      favoriteAlbums,
      currentCycle ?? null,
      cycleAlbum,
      cyclePromptsForRoom,
      curatorEssay,
      roomPastCycles,
      albumSamples,
      cultureExtras,
    )
  })
}

export async function listRoomsByType(type: RoomType): Promise<Room[]> {
  const all = await listAllRooms()
  return all.filter(r => r.type === type)
}

export async function getRelatedRooms(room: Room): Promise<Room[]> {
  if (!room.culture.relatedRooms.length) return []
  const db = getDb()
  const { data } = await db
    .from('rooms')
    .select('slug')
    .in('slug', room.culture.relatedRooms)
  if (!data?.length) return []
  const related = await Promise.all(
    (data as { slug: string }[]).map(r => getRoomBySlug(r.slug)),
  )
  return related.filter((r): r is Room => r !== undefined)
}

// Re-export Room type so consumers can import from here
export type { Room }
