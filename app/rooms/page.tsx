import { Navigation } from '@/components/navigation'
import { RoomsScreen } from '@/components/rooms-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { listAllRooms } from '@/lib/data/rooms'
import { getMyMemberships } from '@/lib/actions/membership'
import { EDITORIAL_ROOMS, GENRE_ROOMS, CREATOR_ROOMS } from '@/lib/rooms'
import type { Room } from '@/lib/rooms'

export const metadata = {
  title: 'Listening Rooms | LongPlay',
  description: 'Discover rooms for the kind of listener you are.',
}

export default async function RoomsPage() {
  let editorialRooms: Room[]
  let genreRooms: Room[]
  let creatorRooms: Room[]

  try {
    const allRooms = await listAllRooms()
    if (!allRooms.length) throw new Error('no data')
    editorialRooms = allRooms.filter(r => r.type === 'editorial')
    genreRooms = allRooms.filter(r => r.type === 'genre')
    creatorRooms = allRooms.filter(r => r.type === 'creator')
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[app/rooms/page.tsx] DB load failed — using static fallback:', err)
    }
    editorialRooms = EDITORIAL_ROOMS
    genreRooms = GENRE_ROOMS
    creatorRooms = CREATOR_ROOMS
  }

  let joinedRooms: Room[] = []
  try {
    const memberships = await getMyMemberships()
    const allRoomsList = [...editorialRooms, ...genreRooms, ...creatorRooms]
    joinedRooms = memberships
      .map(m => allRoomsList.find(r => r.slug === m.roomSlug))
      .filter((r): r is Room => r !== undefined)
  } catch {
    // unauthenticated or DB not yet seeded
  }

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen bg-background">
        <RoomsScreen
          editorialRooms={editorialRooms}
          genreRooms={genreRooms}
          creatorRooms={creatorRooms}
          joinedRooms={joinedRooms}
        />
      </main>
    </ProtectedLayout>
  )
}
