import { notFound } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { RoomDetailScreen } from '@/components/room-detail-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { getRoomBySlug, ALL_ROOMS } from '@/lib/rooms'

// Generate static params for all rooms
export function generateStaticParams() {
  return ALL_ROOMS.map((room) => ({
    slug: room.slug,
  }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const room = getRoomBySlug(slug)
  
  if (!room) {
    return {
      title: 'Room Not Found | LongPlay',
    }
  }
  
  return {
    title: `${room.name} | LongPlay`,
    description: room.description,
  }
}

export default async function RoomDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const room = getRoomBySlug(slug)
  
  if (!room) {
    notFound()
  }
  
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <RoomDetailScreen room={room} />
      </main>
    </ProtectedLayout>
  )
}
