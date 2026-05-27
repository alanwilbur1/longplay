import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  getRoomRitualContext,
  getVisibleReflectionsForCycle,
} from '@/lib/data/ritual'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { RitualContextPanel } from './ritual-context-panel'

/**
 * Server-rendered shell for the RitualContextPanel. Resolves auth
 * + ritual context + visible reflections + artifact label, then
 * hands a fully-shaped props object to the client component.
 *
 * Rendered from app/rooms/[slug]/page.tsx (or any room-scoped
 * server component). The room-id-by-slug lookup happens upstream;
 * this component receives the resolved roomId.
 */
export async function RitualContextPanelServer({
  roomSlug,
}: {
  /** Room slug (URL identifier). The component resolves the DB UUID
   *  internally — the app-side Room.id is the slug, not the UUID. */
  roomSlug: string
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

  // Resolve artifact label "Album Title — Artist" if an album is
  // attached. Best-effort; falls back to null on miss.
  let artifactLabel: string | null = null
  if (ctx.active?.artifact_album_id) {
    artifactLabel = await loadAlbumLabel(ctx.active.artifact_album_id)
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
      artifactLabel={artifactLabel}
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

async function loadAlbumLabel(albumId: string): Promise<string | null> {
  const admin = getSupabaseAdminClient()
  type Builder = {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{
          data: { title: string | null; artist: string | null } | null
          error: { message: string } | null
        }>
      }
    }
  }
  const { data, error } = await (
    admin.from('albums') as unknown as Builder
  )
    .select('title, artist')
    .eq('id', albumId)
    .maybeSingle()
  if (error || !data) return null
  const title = data.title?.trim() ?? ''
  const artist = data.artist?.trim() ?? ''
  if (!title && !artist) return null
  if (!artist) return title
  if (!title) return artist
  return `${title} — ${artist}`
}
