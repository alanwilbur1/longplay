import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  getRoomRitualContext,
  getVisibleReflectionsForCycle,
} from '@/lib/data/ritual'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type { Room } from '@/lib/rooms'
import { RitualContextPanel } from './ritual-context-panel'

/**
 * Server-rendered shell for the RitualContextPanel. Resolves auth +
 * ritual context + visible reflections, threads the album artwork +
 * prompts + streaming links from the already-loaded room object,
 * then hands a fully-shaped props bag to the client component.
 *
 * The hero composition reads three sources:
 *   - room (static catalog / DB-hydrated)   : album cover, prompts, streaming
 *   - ritual_cycles + participation + reflections (DB) : cycle state, user state
 *   - albums (DB, by ritual.artifact_album_id when it diverges from
 *     room.currentAlbum) : tightens future-proofing when a ritual
 *     points at a different album than the room's static current —
 *     today they agree, but the panel reads from the cycle when
 *     present.
 */
export async function RitualContextPanelServer({
  roomSlug,
  room,
}: {
  /** Room slug (URL identifier). The component resolves the DB UUID
   *  internally — the app-side Room.id is the slug, not the UUID. */
  roomSlug: string
  /** Pre-loaded room object from the page route. Carries currentAlbum,
   *  prompts, streamingLinks, and aesthetics — the hero's visual
   *  anchors come from here so the panel never re-fetches what the
   *  page already had. */
  room: Room
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const roomId = await resolveRoomUuid(roomSlug)
  if (!roomId) {
    // Room not in DB — return nothing rather than render a broken
    // panel. The room screen still renders from its static fallback.
    return null
  }

  const ctx = await getRoomRitualContext(roomId, { userId })

  let reflections: Awaited<ReturnType<typeof getVisibleReflectionsForCycle>> = []
  if (ctx.active) {
    reflections = await getVisibleReflectionsForCycle({
      cycleId: ctx.active.id,
      cycleStatus: ctx.active.cycle_status,
      userId,
    })
  }

  // Artifact resolution. Prefer the cycle's own artifact_album_id when
  // it diverges from room.currentAlbum (future-proofs against rituals
  // that move off the static catalog). Falls back to room.currentAlbum.
  let artifactCover = room.currentAlbum.cover ?? null
  let artifactTitle = room.currentAlbum.title ?? null
  let artifactArtist = room.currentAlbum.artist ?? null
  let artifactYear = room.currentAlbum.year ?? null
  if (
    ctx.active?.artifact_album_id &&
    // Album ids in the static catalog are slugs (e.g. "for-emma");
    // ritual_cycles.artifact_album_id is a UUID. They never agree
    // string-wise — always resolve the ritual's album from the
    // albums table when an active cycle exists.
    true
  ) {
    const resolved = await loadAlbum(ctx.active.artifact_album_id)
    if (resolved) {
      // Override only the fields the cycle's album actually has;
      // keep the room's defaults for anything missing.
      artifactCover = resolved.cover_url ?? artifactCover
      artifactTitle = resolved.title ?? artifactTitle
      artifactArtist = resolved.artist ?? artifactArtist
      artifactYear = resolved.year ?? artifactYear
    }
  }

  const participation = ctx.participation
    ? {
        state: ctx.participation.state,
        joined_at: ctx.participation.joined_at,
        completed_at: ctx.participation.completed_at,
        reflected_at: ctx.participation.reflected_at,
      }
    : null

  return (
    <RitualContextPanel
      active={
        ctx.active
          ? {
              id: ctx.active.id,
              cycle_status: ctx.active.cycle_status,
              cycle_number: ctx.active.cycle_number,
              starts_at: ctx.active.starts_at,
              lock_at: ctx.active.lock_at,
              reflection_opens_at: ctx.active.reflection_opens_at,
              reflection_closes_at: ctx.active.reflection_closes_at,
              artifact_album_id: ctx.active.artifact_album_id,
            }
          : null
      }
      upcoming={
        ctx.upcoming
          ? {
              id: ctx.upcoming.id,
              cycle_number: ctx.upcoming.cycle_number,
              starts_at: ctx.upcoming.starts_at,
            }
          : null
      }
      participation={participation}
      reflections={reflections}
      isAuthenticated={userId !== null}
      artifact={{
        cover: artifactCover,
        title: artifactTitle,
        artist: artifactArtist,
        year: artifactYear,
      }}
      prompts={room.prompts}
      streamingLinks={{
        spotify: room.streamingLinks.spotify ?? null,
        appleMusic: room.streamingLinks.appleMusic ?? null,
        tidal: room.streamingLinks.tidal ?? null,
      }}
      aesthetics={{
        borderTint: room.aesthetics.borderTint,
        primaryAccent: room.aesthetics.primaryAccent,
      }}
      roomAtmosphere={room.atmosphere ?? null}
    />
  )
}

async function resolveRoomUuid(slug: string): Promise<string | null> {
  const admin = getSupabaseAdminClient()
  type Builder = {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{
          data: { id: string } | null
          error: { message: string } | null
        }>
      }
    }
  }
  const { data, error } = await (
    admin.from('rooms') as unknown as Builder
  )
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !data) return null
  return data.id
}

async function loadAlbum(albumId: string): Promise<{
  cover_url: string | null
  title: string | null
  artist: string | null
  year: string | null
} | null> {
  const admin = getSupabaseAdminClient()
  type Builder = {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{
          data: {
            cover_url: string | null
            title: string | null
            artist: string | null
            year: string | null
          } | null
          error: { message: string } | null
        }>
      }
    }
  }
  const { data, error } = await (
    admin.from('albums') as unknown as Builder
  )
    .select('cover_url, title, artist, year')
    .eq('id', albumId)
    .maybeSingle()
  if (error || !data) return null
  return data
}
