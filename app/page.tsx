import { Navigation } from '@/components/navigation'
import { HomeScreen } from '@/components/home-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { listAllRooms } from '@/lib/data/rooms'
import { getMyMemberships } from '@/lib/actions/membership'
import { EDITORIAL_ROOMS, GENRE_ROOMS, CREATOR_ROOMS } from '@/lib/rooms'
import type { Room } from '@/lib/rooms'

/**
 * Home page = ritual + orientation.
 *
 * Server-fetches the user's joined rooms so the "Your Rooms" snapshot
 * renders at first paint. Falls back silently to empty list when the
 * user is unauthenticated or the DB is unreachable; the homepage degrades
 * gracefully to a discovery-oriented empty state.
 */
export default async function HomePage() {
  let allRooms: Room[] = []
  try {
    allRooms = await listAllRooms()
    if (!allRooms.length) throw new Error('no data')
  } catch {
    allRooms = [...EDITORIAL_ROOMS, ...GENRE_ROOMS, ...CREATOR_ROOMS]
  }

  let joinedRooms: Room[] = []
  try {
    const memberships = await getMyMemberships()
    joinedRooms = memberships
      .map(m => allRooms.find(r => r.slug === m.roomSlug))
      .filter((r): r is Room => r !== undefined)
  } catch {
    // unauthenticated or membership fetch failed — render with empty list
  }

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <HomeScreen joinedRooms={joinedRooms} />
      </main>
    </ProtectedLayout>
  )
}
