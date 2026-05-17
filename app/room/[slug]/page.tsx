import { notFound } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { ActiveListeningRoomScreen } from '@/components/active-listening-room-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { getRoomBySlug as getDbRoom } from '@/lib/data/rooms'
import { getRoomBySlug, ALL_ROOMS } from '@/lib/rooms'
import { getMomentsByAlbumForCurrentUser } from '@/lib/data/moments'
import { getRoomPresenceSnapshot } from '@/lib/data/presence'

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

  // Parallel fetch: user moments + initial presence snapshot
  const [initialMoments, initialPresenceSnapshot] = await Promise.all([
    room.currentAlbum.id
      ? getMomentsByAlbumForCurrentUser(room.currentAlbum.id).catch(() => undefined)
      : Promise.resolve(undefined),
    room.cycleId
      ? getRoomPresenceSnapshot(room.cycleId).catch(() => undefined)
      : Promise.resolve(undefined),
  ])

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <ActiveListeningRoomScreen
          room={room}
          initialMoments={initialMoments}
          initialPresenceSnapshot={initialPresenceSnapshot}
        />
      </main>
    </ProtectedLayout>
  )
}
