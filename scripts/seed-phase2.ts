/**
 * scripts/seed-phase2.ts
 *
 * Seeds all static room / album / cycle / curator data into Supabase.
 * Idempotent: running twice produces the same result (upsert on conflict).
 * Writes a manifest to scripts/seed-manifest.json for debugging.
 *
 * Prerequisites:
 *   1. Apply lib/schema-phase2.sql in the Supabase dashboard (SQL Editor).
 *   2. NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set
 *      (they are in Replit Secrets, so available as process.env).
 *
 * Run:
 *   pnpm tsx scripts/seed-phase2.ts
 */

import { createHash } from 'crypto'
import { writeFileSync } from 'fs'
import { join } from 'path'

// Static data sources (these are NOT modified; we read and seed from them)
import { ALL_ROOMS } from '../lib/rooms'
import { ALBUMS } from '../lib/albums'
import { PAST_CYCLES } from '../lib/cycles'
import { getSupabaseAdminClient } from '../lib/supabase/admin'

// ── Deterministic UUID v4-format from a namespaced string key ───────────────

const SEED_NAMESPACE = 'longplay-phase2-seed'

function deterministicUUID(key: string): string {
  const hash = createHash('sha256')
    .update(`${SEED_NAMESPACE}:${key}`)
    .digest('hex')
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const variant = (parseInt(hash[16], 16) & 0x3) | 0x8
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    variant.toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-')
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function albumId(slug: string) {
  return deterministicUUID(`album:${slug}`)
}
function roomId(slug: string) {
  return deterministicUUID(`room:${slug}`)
}
function curatorId(slug: string) {
  return deterministicUUID(`curator:${slug}`)
}
function currentCycleId(roomSlug: string) {
  return deterministicUUID(`cycle:${roomSlug}:current`)
}
function pastCycleId(legacyId: string) {
  return deterministicUUID(`cycle:past:${legacyId}`)
}
function promptId(cycleUUID: string, order: number) {
  return deterministicUUID(`prompt:${cycleUUID}:${order}`)
}
function essayId(roomSlug: string, cycleUUID: string) {
  return deterministicUUID(`essay:${roomSlug}:${cycleUUID}`)
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return d
}

function getSundayOfWeek(date: Date): Date {
  const d = getMondayOfWeek(date)
  d.setDate(d.getDate() + 6)
  return d
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

function getSeasonLabel(date: Date): string {
  const month = date.getMonth()
  const year = date.getFullYear()
  if (month >= 2 && month <= 4) return `Spring ${year}`
  if (month >= 5 && month <= 7) return `Summer ${year}`
  if (month >= 8 && month <= 10) return `Autumn ${year}`
  return `Winter ${year}`
}

// Phase mapping: Room.weeklyPhase → DB cycle_phase enum
const phaseDbMap: Record<string, string> = {
  arrival: 'arrival',
  private: 'private',
  discussion: 'discussion',
  'curators-note': 'curators-note',
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 LongPlay Phase 2 Seed')
  console.log('══════════════════════════════════')

  const db = getSupabaseAdminClient()
  const now = new Date()
  const weekNumber = getISOWeek(now)
  const year = now.getFullYear()
  const weekStart = toISO(getMondayOfWeek(now))
  const weekEnd = toISO(getSundayOfWeek(now))
  const seasonLabel = getSeasonLabel(now)

  const manifest: Record<string, unknown> = {
    seededAt: now.toISOString(),
    curators: {} as Record<string, string>,
    albums: {} as Record<string, string>,
    rooms: {} as Record<string, string>,
    currentCycles: {} as Record<string, string>,
  }

  // ── 1. Collect + deduplicate curators ────────────────────────────────────
  console.log('\n[1/8] Curators…')
  const curatorMap = new Map<string, (typeof ALL_ROOMS)[0]['curator']>()
  for (const room of ALL_ROOMS) {
    const c = room.curator
    if (!curatorMap.has(c.id)) curatorMap.set(c.id, c)
  }

  const curatorRows = [...curatorMap.entries()].map(([slug, c]) => ({
    id: curatorId(slug),
    slug,
    name: c.name,
    role: c.role,
    avatar_url: c.avatar ?? null,
    listening_philosophy: c.listeningPhilosophy,
    curator_statement: c.curatorStatement,
    // favoriteRecords resolved after albums are seeded; store UUIDs
    favorite_record_ids: c.favoriteRecords.map(a => albumId(a.id)),
    current_obsessions: c.currentObsessions,
    recurring_themes: c.recurringThemes,
    credentials: c.credentials ?? null,
    publications: c.publications ?? [],
  }))

  const { error: curatorErr } = await db
    .from('curators')
    .upsert(curatorRows, { onConflict: 'id' })
  if (curatorErr) throw new Error(`Curators upsert: ${curatorErr.message}`)

  for (const row of curatorRows) {
    ;(manifest.curators as Record<string, string>)[row.slug] = row.id
  }
  console.log(`   ✓ ${curatorRows.length} curators`)

  // ── 2. Albums ─────────────────────────────────────────────────────────────
  console.log('\n[2/8] Albums…')
  const allAlbums = Object.values(ALBUMS)
  const albumRows = allAlbums.map(a => ({
    id: albumId(a.id),
    slug: a.id,
    title: a.title,
    artist: a.artist,
    year: a.year,
    cover_url: a.cover,
    fallback_gradient: a.fallbackGradient,
    artwork_source: a.albumArtSource ?? null,
    artwork_verified_at: a.lastVerifiedAt ?? null,
    description: a.description ?? null,
    emotional_tags: a.emotionalTags ?? [],
    room_associations: a.roomAssociations ?? [],
    spotify_id: a.spotifyId ?? null,
    musicbrainz_id: a.musicBrainzId ?? null,
    streaming_urls: {
      ...(a.spotifyUrl ? { spotify: a.spotifyUrl } : {}),
      ...(a.appleMusicUrl ? { appleMusic: a.appleMusicUrl } : {}),
      ...(a.tidalUrl ? { tidal: a.tidalUrl } : {}),
      ...(a.qobuzUrl ? { qobuz: a.qobuzUrl } : {}),
      ...(a.bandcampUrl ? { bandcamp: a.bandcampUrl } : {}),
      ...(a.youtubeUrl ? { youtube: a.youtubeUrl } : {}),
    },
  }))

  const { error: albumErr } = await db
    .from('albums')
    .upsert(albumRows, { onConflict: 'id' })
  if (albumErr) throw new Error(`Albums upsert: ${albumErr.message}`)

  for (const row of albumRows) {
    ;(manifest.albums as Record<string, string>)[row.slug] = row.id
  }
  console.log(`   ✓ ${albumRows.length} albums`)

  // ── 3. Rooms (initial, without current_cycle_id) ──────────────────────────
  console.log('\n[3/8] Rooms…')
  const roomRows = ALL_ROOMS.map(room => ({
    id: roomId(room.slug),
    slug: room.slug,
    name: room.name,
    type: room.type,
    description: room.description,
    tagline: room.tagline ?? null,
    atmosphere: room.atmosphere,
    emotional_temperature: room.emotionalTemperature,
    manifesto: room.culture.manifesto,
    listening_ritual: room.culture.listeningRitual,
    what_we_look_for: room.culture.whatWeLookFor,
    what_we_avoid: room.culture.whatWeAvoid,
    associated_archetypes: room.culture.associatedArchetypes.map(a => a.name),
    seasonal_moods: room.culture.seasonalMoods,
    related_rooms: room.culture.relatedRooms,
    atmosphere_notes: room.atmosphereNotes,
    member_count_label: room.memberCountLabel,
    emotional_tags: room.emotionalTags,
    sonic_tags: room.sonicTags,
    aesthetics: room.aesthetics,
    current_season: room.currentSeason ?? null,
    curator_id: curatorId(room.curator.id),
    current_cycle_id: null, // set after cycles are upserted
    culture_extras: {
      invitationText: room.culture.invitationText,
      entryPhrase: room.culture.entryPhrase,
      associatedArchetypes: room.culture.associatedArchetypes,
      albumSample: room.albumSample.map(a => a.id),
      weeklyPhase: room.weeklyPhase,
      phaseDay: room.phaseDay,
    },
  }))

  const { error: roomErr } = await db
    .from('rooms')
    .upsert(roomRows, { onConflict: 'id' })
  if (roomErr) throw new Error(`Rooms upsert: ${roomErr.message}`)

  for (const row of roomRows) {
    ;(manifest.rooms as Record<string, string>)[row.slug] = row.id
  }
  console.log(`   ✓ ${roomRows.length} rooms`)

  // ── 4. Current cycles (one per room) ────────────────────────────────────
  console.log('\n[4/8] Current cycles…')
  const cycleRows = ALL_ROOMS.map(room => {
    const cycleUUID = currentCycleId(room.slug)
    return {
      id: cycleUUID,
      room_id: roomId(room.slug),
      album_id: albumId(room.currentAlbum.id),
      week_number: weekNumber,
      year,
      start_date: weekStart,
      end_date: weekEnd,
      season_label: seasonLabel,
      current_phase: phaseDbMap[room.weeklyPhase] ?? 'private',
      emotional_themes: room.emotionalTags,
      sonic_themes: room.sonicTags,
      cycle_summary: {
        curatorNote: room.curatorNote,
        prompts: room.prompts,
        sonicDimensions: [],
        userEngagement: { listeningSessions: 0, annotations: 0, savedMoments: 0, discussionContributions: 0 },
        identityImpact: { archetypeBefore: '', archetypeAfter: '', shiftDescription: '', dimensionsAffected: [] },
        keyAnnotations: [],
        stillResonates: { isTrue: false, returnsSince: 0 },
      },
      curator_essay_id: null, // set after essays are upserted
      participant_count: 0,
      annotation_count: 0,
      discussion_contributions: 0,
    }
  })

  const { error: cycleErr } = await db
    .from('cycles')
    .upsert(cycleRows, { onConflict: 'id' })
  if (cycleErr) throw new Error(`Current cycles upsert: ${cycleErr.message}`)

  for (const room of ALL_ROOMS) {
    ;(manifest.currentCycles as Record<string, string>)[room.slug] = currentCycleId(room.slug)
  }
  console.log(`   ✓ ${cycleRows.length} current cycles`)

  // ── 5. Cycle prompts ──────────────────────────────────────────────────────
  console.log('\n[5/8] Cycle prompts…')
  const promptRows: Record<string, unknown>[] = []
  for (const room of ALL_ROOMS) {
    const cycleUUID = currentCycleId(room.slug)
    room.prompts.forEach((p, i) => {
      promptRows.push({
        id: promptId(cycleUUID, i),
        cycle_id: cycleUUID,
        question: p.question,
        hint: p.hint,
        display_order: i,
        release_phase: phaseDbMap[room.weeklyPhase] ?? 'private',
      })
    })
  }

  const { error: promptErr } = await db
    .from('cycle_prompts')
    .upsert(promptRows, { onConflict: 'id' })
  if (promptErr) throw new Error(`Prompts upsert: ${promptErr.message}`)
  console.log(`   ✓ ${promptRows.length} prompts`)

  // ── 6. Curator essays ─────────────────────────────────────────────────────
  console.log('\n[6/8] Curator essays…')
  const essayRows = ALL_ROOMS.filter(r => r.curatorNote.title).map(room => {
    const cycleUUID = currentCycleId(room.slug)
    return {
      id: essayId(room.slug, cycleUUID),
      curator_id: curatorId(room.curator.id),
      room_id: roomId(room.slug),
      cycle_id: cycleUUID,
      title: room.curatorNote.title,
      excerpt: room.curatorNote.excerpt,
      full_text: room.curatorNote.fullText,
      essay_type: 'cycle-note',
      is_published: true,
      published_at: now.toISOString(),
      visible_to: 'public',
    }
  })

  const { error: essayErr } = await db
    .from('curator_essays')
    .upsert(essayRows, { onConflict: 'id' })
  if (essayErr) throw new Error(`Essays upsert: ${essayErr.message}`)
  console.log(`   ✓ ${essayRows.length} curator essays`)

  // ── 7. Update FK back-links: cycles.curator_essay_id + rooms.current_cycle_id
  console.log('\n[7/8] Wiring FK back-links…')
  for (const room of ALL_ROOMS) {
    const cycleUUID = currentCycleId(room.slug)
    const eId = essayId(room.slug, cycleUUID)

    // Set cycles.curator_essay_id
    await db
      .from('cycles')
      .update({ curator_essay_id: eId })
      .eq('id', cycleUUID)

    // Set rooms.current_cycle_id
    await db
      .from('rooms')
      .update({ current_cycle_id: cycleUUID })
      .eq('id', roomId(room.slug))
  }
  console.log(`   ✓ ${ALL_ROOMS.length} rooms linked to current cycles`)

  // ── 8. Past cycles from room.pastCycles + PAST_CYCLES archive ─────────────
  console.log('\n[8/8] Archived cycles…')
  const archivedRows: Record<string, unknown>[] = []

  // From each room's pastCycles array
  for (const room of ALL_ROOMS) {
    for (const pc of room.pastCycles) {
      const pId = pastCycleId(pc.id)
      // Skip if this would conflict with a current cycle
      if (cycleRows.find(c => c.id === pId)) continue

      archivedRows.push({
        id: pId,
        room_id: roomId(room.slug),
        album_id: albumId(pc.album.id),
        week_number: 0,
        year: 2026,
        start_date: '2026-01-01',
        end_date: '2026-01-07',
        season_label: 'Archive',
        current_phase: 'archived',
        emotional_themes: [],
        cycle_summary: {
          legacyId: pc.id,
          dateRangeLabel: pc.dateRange,
          highlights: pc.highlights,
          curatorNote: { title: '', excerpt: '', fullText: '', author: '' },
          prompts: [],
          sonicDimensions: [],
          userEngagement: { listeningSessions: 0, annotations: pc.annotationCount, savedMoments: 0, discussionContributions: 0 },
          identityImpact: { archetypeBefore: '', archetypeAfter: '', shiftDescription: '', dimensionsAffected: [] },
          keyAnnotations: [],
          stillResonates: { isTrue: false, returnsSince: 0 },
        },
        annotation_count: pc.annotationCount,
        participant_count: 0,
        discussion_contributions: 0,
        archived_at: now.toISOString(),
      })
    }
  }

  // From PAST_CYCLES in lib/cycles.ts
  for (const cycle of PAST_CYCLES) {
    const pId = pastCycleId(cycle.id)
    const rId = roomId(cycle.room.id)
    const aId = albumId(cycle.album.id)

    // Don't re-add if already from room.pastCycles
    if (archivedRows.find(r => r.id === pId)) continue

    archivedRows.push({
      id: pId,
      room_id: rId,
      album_id: aId,
      week_number: cycle.week,
      year: cycle.year,
      start_date: cycle.startDate,
      end_date: cycle.endDate,
      season_label: cycle.seasonLabel,
      current_phase: 'archived',
      emotional_themes: cycle.emotionalThemes,
      cycle_summary: {
        legacyId: cycle.id,
        dateRangeLabel: `${cycle.startDate} – ${cycle.endDate}`,
        highlights: [],
        curatorNote: cycle.curatorNote,
        prompts: cycle.prompts,
        sonicDimensions: cycle.sonicDimensions,
        userEngagement: cycle.userEngagement,
        identityImpact: cycle.identityImpact,
        keyAnnotations: cycle.keyAnnotations,
        stillResonates: cycle.stillResonates,
      },
      annotation_count: cycle.userEngagement.annotations,
      participant_count: 0,
      discussion_contributions: cycle.userEngagement.discussionContributions,
      archived_at: now.toISOString(),
    })
  }

  if (archivedRows.length > 0) {
    const { error: archErr } = await db
      .from('cycles')
      .upsert(archivedRows, { onConflict: 'id' })
    if (archErr) throw new Error(`Archived cycles upsert: ${archErr.message}`)
  }
  console.log(`   ✓ ${archivedRows.length} archived cycles`)

  // ── Write manifest ────────────────────────────────────────────────────────
  const manifestPath = join(__dirname, 'seed-manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`\n✅ Seed complete — manifest written to scripts/seed-manifest.json`)
  console.log(
    `   Curators: ${Object.keys(manifest.curators as object).length}` +
    ` | Albums: ${Object.keys(manifest.albums as object).length}` +
    ` | Rooms: ${Object.keys(manifest.rooms as object).length}` +
    ` | Current cycles: ${Object.keys(manifest.currentCycles as object).length}` +
    ` | Archived cycles: ${archivedRows.length}`,
  )
}

main().catch(err => {
  console.error('\n❌ Seed failed:', err.message)
  process.exit(1)
})
