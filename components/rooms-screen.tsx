'use client'

import Link from 'next/link'
import { AlbumCover } from '@/components/album-cover'
import { type Room } from '@/lib/rooms'

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
                <div className="relative aspect-square mb-3 overflow-hidden bg-muted rounded">
                  <AlbumCover
                    src={room.currentAlbum.cover}
                    alt={room.name}
                    title={room.currentAlbum.title}
                    artist={room.currentAlbum.artist}
                    fallbackGradient={room.currentAlbum.fallbackGradient}
                    fill
                    className="transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-[10px] text-cream/80 truncate">Now playing</p>
                  </div>
                </div>
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
      {/* Album samples */}
      <div className="flex gap-2 mb-6">
        {room.albumSample.map((album, i) => (
          <div 
            key={album.id} 
            className="relative w-20 h-20 overflow-hidden bg-muted shrink-0"
            style={{ 
              transform: `translateX(-${i * 8}px)`,
              zIndex: room.albumSample.length - i
            }}
          >
            <AlbumCover
              src={album.cover}
              alt={album.title}
              title={album.title}
              artist={album.artist}
              fallbackGradient={album.fallbackGradient}
              fill
              className="transition-transform duration-700 group-hover:scale-105"
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
  return (
    <Link
      href={href}
      className="group block p-4 border border-border/20 hover:border-border/40 transition-all duration-500"
    >
      <h3 className="font-serif text-base text-cream mb-1 group-hover:text-cream/80 transition-colors">
        {room.name}
      </h3>
      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
        {room.tagline || room.atmosphere}
      </p>
      <p className="text-[10px] text-tobacco">{room.memberCountLabel}</p>
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
