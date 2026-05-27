import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { RoomsScreen } from '@/components/rooms-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { listAllRooms } from '@/lib/data/rooms'
import { getMyMemberships } from '@/lib/actions/membership'
import { getRecommendedRooms } from '@/lib/recommendations'
import { EDITORIAL_ROOMS, GENRE_ROOMS, CREATOR_ROOMS } from '@/lib/rooms'
import type { Room } from '@/lib/rooms'
import { RecommendationFactorChips } from '@/components/recommendation-factor-chips'

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

  // Phase 4.2 — heuristic recommendations for the current listener.
  // Server-fetched so they render at first paint. Empty when the
  // listener is unauthenticated or has no calibration data yet.
  const recommendations = await getRecommendedRooms(3).catch(() => [])

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen bg-background">
        {recommendations.length > 0 && (
          <section className="px-6 py-10 md:px-12 lg:px-24 border-b border-border/15">
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Recommended for you
              </h2>
              <span className="text-[10px] uppercase tracking-[0.2em] text-tobacco/60">
                Based on your calibration
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {recommendations.map((rec) => (
                <Link
                  key={rec.room.slug}
                  href={`/rooms/${rec.room.slug}`}
                  className="block p-5 border border-border/20 hover:border-border/40 bg-card/10 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2 gap-3">
                    <h3 className="font-serif text-lg text-cream">{rec.room.name}</h3>
                    {rec.room.featured && (
                      <span className="text-[9px] uppercase tracking-[0.2em] text-burgundy border border-burgundy/50 px-2 py-0.5 shrink-0">
                        Featured
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-cream/70 leading-relaxed mb-3">
                    {rec.room.description}
                  </p>
                  <p className="text-xs text-tobacco/80 italic">{rec.explanation}</p>
                  {/* Phase 6A.8: factor chips below the explanation
                      sentence. Comes from the same factor_breakdown
                      that lives on room_affinity_scores. */}
                  <RecommendationFactorChips factors={rec.factors} />
                </Link>
              ))}
            </div>
          </section>
        )}
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
