'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { AlbumCover } from '@/components/album-cover'
import { LongPlayLogo } from '@/components/navigation'
import { getLastRoom, type LastRoom } from '@/lib/last-room'
import { useRitualPhase } from '@/lib/cadence'
import type { Room } from '@/lib/rooms'

interface HomeScreenProps {
  joinedRooms: Room[]
}

/**
 * Homepage = ritual + orientation.
 *
 * Three sections, no more:
 *   1. Ritual Header — day, the week's ritual prompt, one CTA
 *   2. Your Rooms    — familiar corners of the house, frictionless re-entry
 *   3. Identity      — a single reflective invitation
 *
 * Editorial copy and the day's ritual all come from lib/cadence — the
 * homepage holds no ritual strings of its own. Other surfaces consume
 * the same engine so the listener moves through a coherent week.
 */
export function HomeScreen({ joinedRooms }: HomeScreenProps) {
  const ritualPhase = useRitualPhase()

  // Late-night modulation honours the user's local clock; first paint
  // uses the daylight baseline to avoid hydration mismatch.
  const [isAfterMidnight, setIsAfterMidnight] = useState(false)
  const [lastRoom, setLastRoomState] = useState<LastRoom | null>(null)

  useEffect(() => {
    const hour = new Date().getHours()
    setIsAfterMidnight(hour >= 23 || hour < 5)
    setLastRoomState(getLastRoom())
  }, [])

  // Primary CTA: resume the last visited room when known; otherwise the
  // first joined room; otherwise send the user to discovery.
  const primaryHref =
    lastRoom?.slug
      ? `/room/${lastRoom.slug}`
      : joinedRooms.length > 0
        ? `/room/${joinedRooms[0].slug}`
        : '/rooms'

  const primaryLabel =
    lastRoom?.slug || joinedRooms.length > 0
      ? 'Continue Listening'
      : 'Enter Your Rooms'

  return (
    <div
      className={cn(
        'grain relative pb-24 md:pb-0',
        isAfterMidnight && 'after-midnight',
        ritualPhase?.atmosphereClass,
      )}
    >

      {/* ============================================================== */}
      {/* SECTION 1 — RITUAL HEADER                                       */}
      {/* Restrained re-entry. The room is the destination; this is the   */}
      {/* doorway. Atmospheric, not theatrical.                           */}
      {/* ============================================================== */}
      <section className="relative min-h-[60svh] md:min-h-[70svh] flex flex-col items-center justify-center px-6 pt-20 md:pt-28">
        {/* Existing atmospheric gradient — preserved verbatim from prior hero */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card/20" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300%] h-[80%] bg-gradient-radial from-burgundy/6 via-transparent to-transparent opacity-70" />
        </div>

        <div className="text-center max-w-2xl animate-fade-in-slow">
          <LongPlayLogo className="mb-8" />

          <p className="text-[10px] uppercase tracking-[0.5em] text-cream/50 mb-3">
            {ritualPhase ? `${ritualPhase.day} · ${ritualPhase.title}` : ' '}
          </p>

          <h1 className="font-serif text-2xl md:text-3xl text-cream/90 italic leading-relaxed text-balance mb-5 min-h-[4rem]">
            {ritualPhase?.ritual ?? ' '}
          </h1>

          {ritualPhase && (
            <p className="text-sm text-muted-foreground/55 italic max-w-md mx-auto mb-8 leading-relaxed">
              {ritualPhase.observation}
            </p>
          )}

          <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-10" />

          <Link
            href={primaryHref}
            className="group inline-flex items-center gap-3 border border-burgundy/40 bg-burgundy/5 px-8 py-4 text-cream hover:bg-burgundy/10 hover:border-burgundy/60 transition-all duration-500"
          >
            <span className="text-sm uppercase tracking-[0.2em]">{primaryLabel}</span>
            <svg className="w-4 h-4 transition-transform duration-500 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ============================================================== */}
      {/* SECTION 2 — YOUR ROOMS                                          */}
      {/* Familiar corners of the house. Each card deep-links straight    */}
      {/* into the active room. No editorial scaffolding.                 */}
      {/* ============================================================== */}
      <section className="px-6 py-20 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-10">
            Your Rooms
          </p>

          {joinedRooms.length > 0 ? (
            <div className="space-y-4">
              {joinedRooms.slice(0, 4).map(room => (
                <Link
                  key={room.id}
                  href={`/room/${room.slug}`}
                  className="group flex items-center gap-5 p-4 border border-border/20 bg-card/10 hover:border-border/40 hover:bg-card/20 transition-all duration-500"
                >
                  <div className="relative w-16 h-16 md:w-20 md:h-20 shrink-0 overflow-hidden bg-muted">
                    <AlbumCover
                      src={room.currentAlbum.cover}
                      alt={room.currentAlbum.title}
                      title={room.currentAlbum.title}
                      artist={room.currentAlbum.artist}
                      fallbackGradient={room.currentAlbum.fallbackGradient}
                      fill
                      className="transition-transform duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif text-lg md:text-xl text-cream group-hover:text-cream/90 transition-colors duration-500 truncate">
                      {room.name}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate">
                      {room.currentAlbum.title} <span className="text-muted-foreground/50">·</span> {room.currentAlbum.artist}
                    </p>
                    {room.atmosphere && (
                      <p className="text-xs text-tobacco/70 italic mt-1 truncate">
                        {room.atmosphere}
                      </p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-muted-foreground/40 shrink-0 transition-transform duration-500 group-hover:translate-x-1 group-hover:text-cream/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              ))}

              {joinedRooms.length > 4 && (
                <Link
                  href="/rooms"
                  className="inline-flex items-center gap-2 mt-6 text-sm text-muted-foreground hover:text-cream transition-colors duration-500"
                >
                  <span>All your rooms</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                  </svg>
                </Link>
              )}
            </div>
          ) : (
            <div className="py-6">
              <p className="font-serif text-lg text-cream/70 italic leading-relaxed mb-6 max-w-md">
                You haven&apos;t joined a room yet. Each room is its own listening culture &mdash; find one that sounds like you.
              </p>
              <Link
                href="/rooms"
                className="inline-flex items-center gap-2 text-sm text-tobacco hover:text-cream transition-colors duration-500"
              >
                <span>Browse rooms</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ============================================================== */}
      {/* SECTION 3 — LISTENING IDENTITY                                  */}
      {/* A single reflective invitation. Mysterious, introspective, not  */}
      {/* analytical.                                                     */}
      {/* ============================================================== */}
      <section className="px-6 py-20 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-6">
            Your Listening Identity
          </p>

          <p className="font-serif text-xl md:text-2xl text-cream/80 italic leading-relaxed mb-8">
            Your listening is becoming a pattern.
          </p>

          <Link
            href="/identity"
            className="group inline-flex items-center gap-2 text-sm text-tobacco hover:text-cream transition-colors duration-500"
          >
            <span>Explore Your Identity</span>
            <svg className="w-4 h-4 transition-transform duration-500 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  )
}
