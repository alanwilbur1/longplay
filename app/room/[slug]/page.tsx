import { notFound } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { ActiveListeningRoomScreen } from '@/components/active-listening-room-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { getRoomBySlug as getDbRoom } from '@/lib/data/rooms'
import { getRoomBySlug, ALL_ROOMS } from '@/lib/rooms'

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

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <ActiveListeningRoomScreen room={room} />
      </main>
    </ProtectedLayout>
  )
}
