import { Navigation } from '@/components/navigation'
import { HomeScreen } from '@/components/home-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { getRoomBySlug } from '@/lib/data/rooms'
import { ALBUMS } from '@/lib/albums'

export default async function HomePage() {
  // Attempt to pull the current album from the nocturnal room's current cycle.
  // Falls back to the static album if the DB isn't seeded yet.
  let currentAlbum = ALBUMS.forEmma
  try {
    const room = await getRoomBySlug('nocturnal-room')
    if (room?.currentAlbum) currentAlbum = room.currentAlbum
  } catch {
    // DB not available — static fallback in place
  }

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <HomeScreen currentAlbum={currentAlbum} />
      </main>
    </ProtectedLayout>
  )
}
