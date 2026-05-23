'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { type Room } from '@/lib/rooms'

type CoverStatus = 'pending' | 'loaded' | 'failed' | 'absent'

/**
 * Use a fire-and-forget `new Image()` ping to detect whether a cover
 * URL actually resolves. CSS background-image alone silently fails
 * on 404 — which fixed the broken-icon problem but meant we couldn't
 * distinguish "URL was missing" from "URL was dead". The ping fires
 * the browser's normal image fetch, then onload/onerror tell us
 * which bucket the URL fell into so we can render an INTENTIONAL
 * fallback (vinyl + title + artist) instead of silently degrading
 * to a flat gradient block.
 *
 * Strict-mode safe via the cancelled flag.
 */
function useCoverStatus(coverSrc: string | null | undefined): CoverStatus {
  const [status, setStatus] = useState<CoverStatus>(coverSrc ? 'pending' : 'absent')
  useEffect(() => {
    if (!coverSrc) {
      setStatus('absent')
      return
    }
    setStatus('pending')
    let cancelled = false
    const img = new window.Image()
    img.onload = () => {
      if (!cancelled) setStatus('loaded')
    }
    img.onerror = () => {
      if (!cancelled) setStatus('failed')
    }
    img.src = coverSrc
    return () => {
      cancelled = true
      img.onload = null
      img.onerror = null
    }
  }, [coverSrc])
  return status
}

/** Domain-only host extraction for the debug strip. Returns "—" on
 *  unparseable URLs without throwing. */
function safeHost(src: string | null | undefined): string {
  if (!src) return '—'
  try {
    return new URL(src).host
  } catch {
    return '—'
  }
}

/**
 * CoverTile — every external cover URL on /rooms flows through this.
 *
 * Render path:
 *   - status='loaded' → CSS background-image. No <img> in the DOM,
 *     so broken-icon and alt-text leaks are structurally impossible.
 *   - status='failed' OR 'absent' → IntentionalCoverFallback
 *     (vinyl glyph + title + optional subtitle) on top of the
 *     aesthetic gradient. Not pretending to be a cover.
 *   - status='pending' → just the aesthetic gradient while the
 *     ping resolves. Brief.
 *
 * Phase-1.1 debug strip: when `debugSlug` is provided, renders a
 * one-line mono diagnostic at the bottom of the tile showing slug,
 * status, host, and url prefix. Temporary; remove once cover URL
 * triage in lib/albums.ts is complete.
 */
function CoverTile({
  coverSrc,
  fallbackGradient,
  fallbackLabel,
  className,
  innerClassName,
  children,
  debugSlug,
}: {
  coverSrc: string | null | undefined
  fallbackGradient: string
  /** Shown when the cover URL is absent OR fails to load. Either a
   *  plain string (acts as title) or { title, subtitle?, compact? }.
   *  `compact` = true drops the vinyl glyph + subtitle, keeps just
   *  the title — used for the 80×80 album-sample tiles. */
  fallbackLabel?:
    | string
    | { title: string; subtitle?: string; compact?: boolean }
  className?: string
  innerClassName?: string
  children?: React.ReactNode
  /** Pass the room/album slug to render the temporary debug strip. */
  debugSlug?: string
}) {
  const status = useCoverStatus(coverSrc)
  // Optimistic render: show the cover during 'pending' AND 'loaded'.
  // The ping confirms failure asynchronously; if it does, we swap to
  // the fallback. This keeps successful covers from flashing gradient
  // during the initial hydration tick.
  const showCover = !!coverSrc && (status === 'pending' || status === 'loaded')
  const showFallbackLabel = status === 'failed' || status === 'absent'

  const label =
    typeof fallbackLabel === 'string'
      ? { title: fallbackLabel, subtitle: undefined, compact: false }
      : fallbackLabel ?? null

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br ${fallbackGradient || 'from-charcoal to-card'} ${className ?? ''}`}
    >
      {showCover && (
        <div
          className={`absolute inset-0 bg-cover bg-center ${innerClassName ?? ''}`}
          style={{ backgroundImage: `url("${coverSrc}")` }}
          role="presentation"
          aria-hidden="true"
        />
      )}

      {showFallbackLabel && label && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center pointer-events-none">
          {!label.compact && (
            <svg
              viewBox="0 0 48 48"
              fill="none"
              className="w-10 h-10 mb-3 text-cream/40"
              aria-hidden="true"
            >
              <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1" opacity="0.6" />
              <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="1" opacity="0.4" />
              <circle cx="24" cy="24" r="2.5" fill="currentColor" opacity="0.8" />
            </svg>
          )}
          <p
            className={`font-serif ${label.compact ? 'text-[10px]' : 'text-sm'} text-cream/90 leading-tight line-clamp-2 ${label.compact ? '' : 'mb-1'}`}
          >
            {label.title}
          </p>
          {!label.compact && label.subtitle && (
            <p className="text-xs text-cream/60 line-clamp-1">{label.subtitle}</p>
          )}
        </div>
      )}

      {children}

      {debugSlug && (
        <div className="absolute left-1 bottom-1 right-1 z-10 pointer-events-none">
          <p className="text-[9px] font-mono text-cream/70 bg-background/70 px-1.5 py-0.5 rounded truncate">
            {debugSlug} · cov={coverSrc ? 'yes' : 'no'} · st={status} · h=
            {safeHost(coverSrc)} · {coverSrc ? coverSrc.slice(0, 40) + (coverSrc.length > 40 ? '…' : '') : '∅'}
          </p>
        </div>
      )}
    </div>
  )
}

interface RoomsScreenProps {
  editorialRooms: Room[]
  genreRooms: Room[]
  creatorRooms: Room[]
  joinedRooms: Room[]
}

/**
 * Routing rule (Phase 3B navigation simplification):
 *   - Joined rooms always deep-link to /room/[slug] (active listening room).
 *   - Non-joined rooms link to /rooms/[slug] (editorial profile / join flow).
 * This applies to every card on this surface, not just the "Your Rooms" row.
 */
function roomHref(slug: string, joined: boolean): string {
  return joined ? `/room/${slug}` : `/rooms/${slug}`
}

export function RoomsScreen({
  editorialRooms,
  genreRooms,
  creatorRooms,
  joinedRooms,
}: RoomsScreenProps) {
  const joinedSlugs = new Set(joinedRooms.map(r => r.slug))

  return (
    <div className="grain relative pb-32 md:pb-16 md:pt-24">
      {/* Hero - Discovery Frame */}
      <section className="px-6 pt-16 pb-12 md:px-12 lg:px-24">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl md:text-5xl text-cream mb-6 leading-tight">
            Listening Rooms
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Rooms for the kind of listener you are. Each space has its own
            emotional cadence, weekly album, and community of intent.
          </p>
        </div>
      </section>

      {/* Your Rooms - If member of any. Cards deep-link straight into the active room. */}
      <section className="px-6 py-8 md:px-12 lg:px-24 border-t border-border/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Your Rooms</h2>
          <span className="text-xs text-tobacco">
            {joinedRooms.length > 0 ? `${joinedRooms.length} active` : 'none joined'}
          </span>
        </div>

        {joinedRooms.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-6 px-6 md:mx-0 md:px-0 md:overflow-visible scrollbar-hide">
            {joinedRooms.slice(0, 3).map((room) => (
              <Link
                key={room.id}
                href={`/room/${room.slug}`}
                className="group shrink-0 w-32 md:w-40"
              >
                <CoverTile
                  coverSrc={room.coverArt ?? room.currentAlbum.cover}
                  fallbackGradient={
                    room.currentAlbum.fallbackGradient ||
                    room.aesthetics?.backgroundGradient ||
                    'from-charcoal to-card'
                  }
                  fallbackLabel={{
                    title: room.currentAlbum.title,
                    subtitle: room.currentAlbum.artist,
                  }}
                  className="aspect-square mb-3 rounded"
                  innerClassName="transition-transform duration-700 group-hover:scale-105"
                  debugSlug={room.slug}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-[10px] text-cream/80 truncate">Now playing</p>
                  </div>
                </CoverTile>
                <h3 className="font-serif text-sm text-cream group-hover:text-cream/80 transition-colors truncate">
                  {room.name}
                </h3>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Browse the rooms below and join one to begin your listening practice.
          </p>
        )}
      </section>

      {/* Editorial Rooms - Featured */}
      <section className="px-6 py-12 md:px-12 lg:px-24">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">Editorial Rooms</h2>

        <div className="space-y-8 md:space-y-0 md:grid md:grid-cols-2 md:gap-8">
          {editorialRooms.map((room) => (
            <EditorialRoomCard
              key={room.id}
              room={room}
              href={roomHref(room.slug, joinedSlugs.has(room.slug))}
            />
          ))}
        </div>
      </section>

      {/* Genre & Aesthetic Rooms */}
      <section className="px-6 py-12 md:px-12 lg:px-24 border-t border-border/20">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">By Sound & Feeling</h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {genreRooms.map((room) => (
            <GenreRoomCard
              key={room.id}
              room={room}
              href={roomHref(room.slug, joinedSlugs.has(room.slug))}
            />
          ))}
        </div>
      </section>

      {/* Creator-Led Rooms */}
      <section className="px-6 py-12 md:px-12 lg:px-24 border-t border-border/20">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">Curator-Led</h2>

        <div className="space-y-4">
          {creatorRooms.map((room) => (
            <CreatorRoomCard
              key={room.id}
              room={room}
              href={roomHref(room.slug, joinedSlugs.has(room.slug))}
            />
          ))}
        </div>
      </section>

      {/* Private Rooms CTA */}
      <section className="mx-6 md:mx-12 lg:mx-24 my-12 p-8 bg-navy/20 border border-border/20">
        <h3 className="font-serif text-xl text-cream mb-3">Create a Private Room</h3>
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          For close friends, partners, or small communities. Share listening 
          cycles and build a private archive together.
        </p>
        <button className="text-sm text-tobacco hover:text-cream transition-colors duration-500 flex items-center gap-2">
          <span>Start a private room</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </section>
    </div>
  )
}

function EditorialRoomCard({ room, href }: { room: Room; href: string }) {
  return (
    <Link
      href={href}
      className="group block bg-card/30 border border-border/20 p-6 transition-all duration-500 hover:border-border/40"
    >
      {/* Album samples — CSS-backed tiles. Same resilience as
          GenreRoomCard: dead album-cover URLs degrade to the
          per-album fallbackGradient with no broken-icon or
          alt-text leak. Each tile sits in a positioned wrapper so
          the slight horizontal stack (translateX) and z-index
          layering match the previous AlbumCover-based layout. */}
      <div className="flex gap-2 mb-6">
        {room.albumSample.map((album, i) => (
          <div
            key={album.id}
            className="relative shrink-0"
            style={{
              transform: `translateX(-${i * 8}px)`,
              zIndex: room.albumSample.length - i,
            }}
          >
            <CoverTile
              coverSrc={album.cover}
              fallbackGradient={album.fallbackGradient}
              fallbackLabel={{ title: album.title, compact: true }}
              className="w-20 h-20"
              innerClassName="transition-transform duration-700 group-hover:scale-105"
              debugSlug={`${room.slug}/${album.id}`}
            />
          </div>
        ))}
      </div>

      <h3 className="font-serif text-xl text-cream mb-2 group-hover:text-cream/80 transition-colors">
        {room.name}
      </h3>
      
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        {room.description}
      </p>
      
      <div className="flex items-center justify-between">
        <p className="text-xs text-tobacco truncate">{room.atmosphere}</p>
        <p className="text-xs text-muted-foreground shrink-0">{room.memberCountLabel}</p>
      </div>
    </Link>
  )
}

function GenreRoomCard({ room, href }: { room: Room; href: string }) {
  // Phase 1 content-quality: cover imagery via shared CoverTile.
  // CoverTile uses CSS background-image internally, so dead cover
  // URLs (placehold.co / real-but-404 Spotify hashes / network-
  // blocked CDNs) degrade silently to the aesthetic gradient. No
  // broken-image icon, no alt-text leak.
  return (
    <Link
      href={href}
      className="group block border border-border/20 hover:border-border/40 transition-all duration-500 overflow-hidden"
    >
      <CoverTile
        coverSrc={room.coverArt ?? room.currentAlbum.cover}
        fallbackGradient={room.aesthetics?.backgroundGradient || 'from-charcoal to-card'}
        fallbackLabel={{
          title: room.name,
          subtitle: room.currentAlbum.artist,
        }}
        className="aspect-square"
        innerClassName="transition-transform duration-700 group-hover:scale-105"
        debugSlug={room.slug}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/20 to-transparent pointer-events-none" />
      </CoverTile>
      <div className="p-4">
        <h3 className="font-serif text-base text-cream mb-1 group-hover:text-cream/80 transition-colors">
          {room.name}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2">
          {room.tagline || room.atmosphere}
        </p>
        <p className="text-[10px] text-tobacco">{room.memberCountLabel}</p>
      </div>
    </Link>
  )
}

function CreatorRoomCard({ room, href }: { room: Room; href: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 p-4 border border-border/20 hover:border-border/40 transition-all duration-500"
    >
      <div className="w-12 h-12 rounded-full bg-tobacco/20 border border-tobacco/30 flex items-center justify-center shrink-0">
        <span className="text-sm text-cream font-serif">{room.curator.name[0]}</span>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-serif text-base text-cream group-hover:text-cream/80 transition-colors">
          {room.name}
        </h3>
        <p className="text-xs text-muted-foreground">
          <span className="text-tobacco">{room.curator.name}</span> · {room.description}
        </p>
      </div>
      <p className="text-xs text-muted-foreground shrink-0">{room.memberCountLabel}</p>
    </Link>
  )
}
