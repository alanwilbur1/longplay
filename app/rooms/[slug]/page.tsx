import { notFound } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { RoomDetailScreen } from '@/components/room-detail-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { RitualContextPanelServer } from '@/components/ritual/ritual-context-panel-server'
import { getRoomBySlug as getDbRoom } from '@/lib/data/rooms'
import { getRoomHasActiveRitual } from '@/lib/data/ritual'
import { isRoomMember } from '@/lib/actions/membership'
import { getRoomBySlug, ALL_ROOMS } from '@/lib/rooms'

// Static params from known slugs (build-time; no DB required)
export function generateStaticParams() {
  return ALL_ROOMS.map(room => ({ slug: room.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let name = ''
  let description = ''
  try {
    const room = await getDbRoom(slug)
    if (room) { name = room.name; description = room.description }
  } catch {
    const room = getRoomBySlug(slug)
    if (room) { name = room.name; description = room.description }
  }

  if (!name) return { title: 'Room Not Found | LongPlay' }
  return { title: `${name} | LongPlay`, description }
}

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Try DB first, fall back to static
  let room = null
  let usedFallback = false
  try {
    room = await getDbRoom(slug)
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[app/rooms/[slug]/page.tsx] DB load failed for "${slug}" — using static fallback:`, err)
    }
    usedFallback = true
  }
  if (!room) {
    room = getRoomBySlug(slug) ?? null
    if (!usedFallback && process.env.NODE_ENV === 'development') {
      console.warn(`[app/rooms/[slug]/page.tsx] Room "${slug}" not found in DB — using static fallback`)
    }
  }

  if (!room) notFound()

  // Check real membership status
  let initialIsJoined = false
  try {
    initialIsJoined = await isRoomMember(slug)
  } catch {
    // unauthenticated — stays false
  }

  // Phase 6B.2 refinement: when an active ritual exists, the hero
  // composition surfaces the album + prompts + streaming inline. We
  // suppress the legacy "Current Album Cycle" + "Listening Prompts"
  // sections in RoomDetailScreen to avoid redundancy. False on any
  // lookup failure — defensive: never falsely hide editorial content.
  let hasActiveRitual = false
  try {
    hasActiveRitual = await getRoomHasActiveRitual(slug)
  } catch {
    hasActiveRitual = false
  }

  // The ritual panel server takes the SAME room object so it can
  // anchor on the album artwork, prompts, and streaming links
  // already loaded — one source of truth for the artifact.
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <RoomDetailScreen
          room={room}
          initialIsJoined={initialIsJoined}
          hasActiveRitual={hasActiveRitual}
          ritualPanel={
            <RitualContextPanelServer roomSlug={slug} room={room} />
          }
        />
      </main>
    </ProtectedLayout>
  )
}
