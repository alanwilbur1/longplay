import { notFound } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { ActiveListeningRoomScreen } from '@/components/active-listening-room-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { getRoomBySlug as getDbRoom } from '@/lib/data/rooms'
import { getCurrentCycleForRoom } from '@/lib/data/cycles'
import { getRoomBySlug, ALL_ROOMS } from '@/lib/rooms'
import { getMomentsByAlbumForCurrentUser } from '@/lib/data/moments'
import { getRoomPresenceSnapshot } from '@/lib/data/presence'
import { getMyCycleParticipation } from '@/lib/memory'
import { getCombinedContinuity } from '@/lib/continuity'

// Generate static params for all rooms
export function generateStaticParams() {
  return ALL_ROOMS.map((room) => ({
    slug: room.slug,
  }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let room = null
  try { room = await getDbRoom(slug) } catch {}
  if (!room) room = getRoomBySlug(slug) ?? null

  if (!room) return { title: 'Listening Room | LongPlay' }

  return {
    title: `Listening: ${room.currentAlbum.title} | ${room.name} | LongPlay`,
    description: `Currently listening to ${room.currentAlbum.title} by ${room.currentAlbum.artist} in ${room.name}`,
  }
}

export default async function ActiveRoomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let room = null
  try { room = await getDbRoom(slug) } catch {}
  if (!room) room = getRoomBySlug(slug) ?? null

  if (!room) notFound()

  // Parallel fetch: user moments + initial presence + cycle participation
  // + current cycle (for continuity dates)
  const [initialMoments, initialPresenceSnapshot, initialCycleParticipation, currentCycle] = await Promise.all([
    room.currentAlbum.id
      ? getMomentsByAlbumForCurrentUser(room.currentAlbum.id).catch(() => undefined)
      : Promise.resolve(undefined),
    room.cycleId
      ? getRoomPresenceSnapshot(room.cycleId).catch(() => undefined)
      : Promise.resolve(undefined),
    room.cycleId
      ? getMyCycleParticipation(room.cycleId).catch(() => undefined)
      : Promise.resolve(undefined),
    getCurrentCycleForRoom(slug).catch(() => null),
  ])

  // Phase 5A continuity: combined user + cycle. Picks one line, or
  // null. Active room is the surface where cycle-arrival /
  // cycle-closing are most meaningful — the cycle's temporal arc
  // is the room's own rhythm.
  const continuity = await getCombinedContinuity(
    currentCycle?.startDate ?? null,
    currentCycle?.endDate ?? null,
  ).catch(() => null)

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <ActiveListeningRoomScreen
          room={room}
          initialMoments={initialMoments}
          initialPresenceSnapshot={initialPresenceSnapshot}
          initialCycleParticipation={initialCycleParticipation}
          continuityLine={continuity?.line ?? null}
        />
      </main>
    </ProtectedLayout>
  )
}
