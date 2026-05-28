import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  getCycleEcology,
  getRoomRitualContext,
  getVisibleReflectionsForCycle,
} from '@/lib/data/ritual'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type { Room } from '@/lib/rooms'
import { getAlbumTracksByAlbumId } from '@/lib/data/album-tracks'
import { formatTrackDuration } from '@/lib/album-tracks-format'
import { RitualContextPanel } from './ritual-context-panel'
import { RitualEcologySection } from './ritual-ecology-section'
import type { Track as TracklistTrack } from './tracklist-surface'
// Phase 6B.4 hotfix: import from the pure module, not from the
// 'use client'-tagged listening-surface re-export. Crossing the
// 'use client' boundary for a NAMED non-component export is a
// runtime trap in Next.js App Router — the build passes static
// analysis but the route hard-crashes on first SSR call. See
// lib/spotify-url.ts for the background note.
import { extractSpotifyAlbumId } from '@/lib/spotify-url'

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
  // Phase 6B.4 hotfix: rooms loaded from the DB may have a missing
  // or partially-populated currentAlbum block. Guard each read so a
  // bad row degrades gracefully (no album cover) rather than 500s.
  let artifactCover = room.currentAlbum?.cover ?? null
  let artifactTitle = room.currentAlbum?.title ?? null
  let artifactArtist = room.currentAlbum?.artist ?? null
  let artifactYear = room.currentAlbum?.year ?? null
  // Phase 6B.5 follow-up: multi-source Spotify album ID resolution.
  // The original implementation only consulted the room's static
  // `streamingLinks.spotify` URL, which is empty for the majority
  // of rooms in the catalog — leading to the production regression
  // where the embed never rendered. Resolve in priority order:
  //   1. albums.spotify_id from the ritual cycle's artifact_album_id
  //   2. albums.streaming_urls.spotify URL from the same row
  //   3. room.currentAlbum.spotifyId from the static catalog
  //   4. room.streamingLinks.spotify URL parse (legacy fallback)
  let resolvedSpotifyAlbumId: string | null = null
  let resolvedAppleMusicUrl: string | null = room.streamingLinks?.appleMusic ?? null
  if (ctx.active?.artifact_album_id) {
    const resolved = await loadAlbum(ctx.active.artifact_album_id)
    if (resolved) {
      artifactCover = resolved.cover_url ?? artifactCover
      artifactTitle = resolved.title ?? artifactTitle
      artifactArtist = resolved.artist ?? artifactArtist
      artifactYear = resolved.year ?? artifactYear
      // Source 1 — direct column on the album row (most reliable;
      // backfilled by the artwork/refresh scripts).
      if (resolved.spotify_id) {
        resolvedSpotifyAlbumId = resolved.spotify_id
      }
      // Source 2 — URL embedded inside the streaming_urls jsonb.
      if (!resolvedSpotifyAlbumId && resolved.streaming_urls?.spotify) {
        resolvedSpotifyAlbumId = extractSpotifyAlbumId(
          resolved.streaming_urls.spotify,
        )
      }
      // Apple Music: prefer the album row's value over the room's
      // static when present (same precedence logic).
      if (resolved.streaming_urls?.appleMusic) {
        resolvedAppleMusicUrl = resolved.streaming_urls.appleMusic
      }
    }
  }
  // Source 3 — static catalog (Album.spotifyId on lib/albums.ts).
  if (!resolvedSpotifyAlbumId && room.currentAlbum?.spotifyId) {
    resolvedSpotifyAlbumId = room.currentAlbum.spotifyId
  }
  // Source 4 — URL parse on the room's static streamingLinks.
  if (!resolvedSpotifyAlbumId) {
    resolvedSpotifyAlbumId = extractSpotifyAlbumId(
      room.streamingLinks?.spotify ?? null,
    )
  }

  const participation = ctx.participation
    ? {
        state: ctx.participation.state,
        joined_at: ctx.participation.joined_at,
        completed_at: ctx.participation.completed_at,
        reflected_at: ctx.participation.reflected_at,
      }
    : null

  // Cycle ecology — counts + observational lines for "This Week in
  // the Room". Cheap (2 admin reads + pure derivation); returns an
  // empty shape on lookup failure so the ecology section can decide
  // to suppress itself rather than render fake observations.
  const ecology = ctx.active
    ? await getCycleEcology({
        cycleId: ctx.active.id,
        cycleNumber: ctx.active.cycle_number,
      })
    : null

  // Phase 6B.5: pre-fetch the album tracklist. Reads from the
  // album_tracks substrate (migration 0023). Empty array when the
  // album hasn't been hydrated yet — the TracklistSurface UI shows
  // its restrained fallback line. Never throws; getter returns []
  // on any DB hiccup.
  const tracklistRows = ctx.active?.artifact_album_id
    ? await getAlbumTracksByAlbumId(ctx.active.artifact_album_id)
    : []
  const tracklist: TracklistTrack[] = tracklistRows.map((r) => ({
    number: r.track_number,
    title: r.name,
    duration: formatTrackDuration(r.duration_ms),
  }))

  // Phase 6B.4 hotfix: guard against a room loaded without an
  // aesthetics block. Fall back to neutral border-tint + a quiet
  // muted accent so the panel still composes.
  const aesthetics = {
    borderTint: room.aesthetics?.borderTint ?? 'border-border/20',
    primaryAccent: room.aesthetics?.primaryAccent ?? 'text-muted-foreground',
  }

  // Return a Fragment so the page's `ritualPanel` slot receives BOTH
  // the hero composition AND the "This Week in the Room" ecology
  // section as one unit. Keeps the slot contract minimal and lets
  // the room screen treat ritual content as a single block.
  return (
    <>
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
        prompts={room.prompts ?? []}
        streamingLinks={{
          // Phase 6B.4 hotfix + 6B.5 follow-up: defensive nulls AND
          // prefer the album row's Apple Music URL when present.
          spotify: room.streamingLinks?.spotify ?? null,
          appleMusic: resolvedAppleMusicUrl,
          tidal: room.streamingLinks?.tidal ?? null,
        }}
        aesthetics={aesthetics}
        roomAtmosphere={room.atmosphere ?? null}
        roomSlug={roomSlug}
        // Phase 6B.5 follow-up: resolved upstream via the
        // multi-source chain rather than only the room's static
        // streamingLinks URL.
        spotifyAlbumId={resolvedSpotifyAlbumId}
        tracklist={tracklist}
      />
      {ctx.active && ecology && (
        <RitualEcologySection
          ecology={ecology}
          reflections={reflections}
          aesthetics={aesthetics}
          reflectionWindowOpen={
            ctx.active.cycle_status === 'reflection' ||
            ctx.active.cycle_status === 'archived'
          }
        />
      )}
    </>
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
  spotify_id: string | null
  streaming_urls: Record<string, string> | null
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
            spotify_id: string | null
            streaming_urls: Record<string, string> | null
          } | null
          error: { message: string } | null
        }>
      }
    }
  }
  const { data, error } = await (
    admin.from('albums') as unknown as Builder
  )
    .select('cover_url, title, artist, year, spotify_id, streaming_urls')
    .eq('id', albumId)
    .maybeSingle()
  if (error || !data) return null
  return data
}
