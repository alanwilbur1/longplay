import { Metadata } from 'next'
import { RoomsScreen } from '@/components/rooms-screen'
import { Navigation } from '@/components/navigation'
import { ProtectedLayout } from '@/components/protected-layout'
import { listAllRooms } from '@/lib/data/rooms'
import { getMyMemberships } from '@/lib/actions/membership'
import { EDITORIAL_ROOMS, GENRE_ROOMS, CREATOR_ROOMS } from '@/lib/rooms'
import type { Room } from '@/lib/rooms'

export const metadata: Metadata = {
  title: 'Listening Clubs | LongPlay',
  description: 'Find your listening communities. Curated clubs for every kind of listener.',
}

export default async function ClubsPage() {
  let editorialRooms: Room[]
  let genreRooms: Room[]
  let creatorRooms: Room[]

  try {
    const allRooms = await listAllRooms()
    if (!allRooms.length) throw new Error('no data')
    editorialRooms = allRooms.filter(r => r.type === 'editorial')
    genreRooms = allRooms.filter(r => r.type === 'genre')
    creatorRooms = allRooms.filter(r => r.type === 'creator')
  } catch {
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
  } catch {}

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="pt-0 md:pt-16">
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
