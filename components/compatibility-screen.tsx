'use client'

import Image from 'next/image'
import { AlbumCover } from '@/components/album-cover'
import { useAuth } from '@/components/auth-provider'

// Real album artwork - emotionally resonant, culturally respected
const ALBUMS = {
  forEmma: {
    title: "For Emma, Forever Ago",
    artist: "Bon Iver",
    cover: "https://i.scdn.co/image/ab67616d0000b273dc30583ba717007b00cceb25",
  },
  carrieAndLowell: {
    title: "Carrie & Lowell",
    artist: "Sufjan Stevens",
    cover: "https://i.scdn.co/image/ab67616d0000b27318be9fab3b1a0f648ef40178",
  },
  inRainbows: {
    title: "In Rainbows",
    artist: "Radiohead",
    cover: "https://i.scdn.co/image/ab67616d0000b2739293c743fa542094336c5e12",
  },
  blue: {
    title: "Blue",
    artist: "Joni Mitchell",
    cover: "https://i.scdn.co/image/ab67616d0000b273a24ad00b985de2e4e34ea9d2",
  },
  pinkMoon: {
    title: "Pink Moon",
    artist: "Nick Drake",
    cover: "https://i.scdn.co/image/ab67616d0000b273b2c4d551fa81c1c1e2c2ed1d",
  },
}

export function CompatibilityScreen() {
  const { user, isAuthenticated } = useAuth()
  const displayName = (isAuthenticated && user)
    ? (user.user_metadata?.name ?? user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Listener')
    : 'Listener'

  return (
    <div className="grain relative pb-24 md:pb-0 md:pt-16">
      {/* Hero - Two Profiles */}
      <section className="px-6 pt-12 pb-16 md:px-12 lg:px-24">
        <p className="text-[10px] uppercase tracking-[0.4em] text-tobacco mb-10 text-center animate-fade-in">
          Listening Compatibility
        </p>
        
        <div className="flex items-center justify-center gap-6 animate-fade-in-up">
          {/* First Profile */}
          <div className="text-center">
            <div className="relative w-20 h-20 md:w-28 md:h-28 mx-auto mb-4 overflow-hidden rounded-full">
              <Image
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400"
                alt={displayName}
                fill
                className="object-cover grayscale-[20%]"
              />
            </div>
            <p className="font-serif text-lg text-cream">{displayName}</p>
            <p className="text-xs text-tobacco mt-1">The Nocturnal Romantic</p>
          </div>

          {/* Connection Symbol */}
          <div className="flex flex-col items-center px-2">
            <div className="w-8 h-px bg-tobacco/40" />
            <p className="font-serif text-2xl text-cream/80 my-3">&</p>
            <div className="w-8 h-px bg-tobacco/40" />
          </div>

          {/* Second Profile */}
          <div className="text-center">
            <div className="relative w-20 h-20 md:w-28 md:h-28 mx-auto mb-4 overflow-hidden rounded-full">
              <Image
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400"
                alt="Marcus"
                fill
                className="object-cover grayscale-[20%]"
              />
            </div>
            <p className="font-serif text-lg text-cream">Marcus</p>
            <p className="text-xs text-tobacco mt-1">The Cathedral Listener</p>
          </div>
        </div>
      </section>

      {/* Editorial Description - Full Width */}
      <section className="px-6 py-16 md:px-12 lg:px-24">
        <div className="max-w-2xl mx-auto animate-fade-in-up">
          <h2 className="font-serif text-3xl md:text-4xl text-cream mb-10 leading-tight text-center">
            Two listeners who find beauty in the same silences
          </h2>
          <div className="font-serif text-lg text-cream/80 leading-relaxed space-y-6">
            <p>
              There&apos;s a rare quality to finding someone who hears what you hear. Not just the notes, but the <span className="text-tobacco">spaces between them</span>.
            </p>
            <p>
              Elena and Marcus share a gravitational pull toward music that rewards patience. They both prefer albums that ask something of the listener.
            </p>
            <p className="text-cream/60 italic">
              They&apos;d find the same moments devastating, would press pause at the same passages, would understand why certain records need to be heard alone.
            </p>
          </div>
        </div>
      </section>

      {/* Emotional Overlap - Vertical Cards */}
      <section className="px-6 py-16 md:px-12 lg:px-24 bg-navy/15">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-8">Emotional Overlap</p>
        
        <div className="space-y-6 max-w-xl mx-auto">
          <OverlapCard
            title="Shared Emotional Range"
            description="You both gravitate toward melancholy as comfort. Music that acknowledges difficulty without drowning in it."
            tags={['Contemplative', 'Wistful', 'Intimate']}
          />
          <OverlapCard
            title="Sonic Alignment"
            description="A preference for acoustic textures, sparse arrangements, and vocal vulnerability."
            tags={['Acoustic', 'Sparse', 'Warm']}
          />
          <OverlapCard
            title="Listening Habits"
            description="Night owls who prefer full albums to playlists. You believe music deserves to be heard uninterrupted."
            tags={['Nocturnal', 'Album-focused']}
          />
        </div>
      </section>

      {/* Shared Records - Horizontal Scroll with Real Covers */}
      <section className="py-16">
        <div className="px-6 md:px-12 lg:px-24 mb-8">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">Records You Both Love</p>
        </div>
        
        <div className="flex gap-5 overflow-x-auto pb-4 px-6 md:px-12 lg:px-24 scrollbar-hide">
          <SharedAlbum
            image={ALBUMS.forEmma.cover}
            title={ALBUMS.forEmma.title}
            artist={ALBUMS.forEmma.artist}
          />
          <SharedAlbum
            image={ALBUMS.carrieAndLowell.cover}
            title={ALBUMS.carrieAndLowell.title}
            artist={ALBUMS.carrieAndLowell.artist}
          />
          <SharedAlbum
            image={ALBUMS.inRainbows.cover}
            title={ALBUMS.inRainbows.title}
            artist={ALBUMS.inRainbows.artist}
          />
          <SharedAlbum
            image={ALBUMS.blue.cover}
            title={ALBUMS.blue.title}
            artist={ALBUMS.blue.artist}
          />
        </div>
      </section>

      {/* Where You Differ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 bg-card/20">
        <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-8">Where You Differ</p>
        
        <div className="space-y-6 max-w-xl mx-auto">
          <ContrastCard
            person={displayName}
            trait="Seeks catharsis"
            description="Music as emotional release. She leans into the crescendos, the moments where restraint finally breaks."
          />
          <ContrastCard
            person="Marcus"
            trait="Prefers stillness"
            description="Music as meditation. He finds meaning in what's withheld, in the spaces that never resolve."
          />
        </div>
        
        <p className="font-serif text-lg text-cream/70 italic max-w-lg mx-auto text-center mt-12">
          These differences create complementary listening. What Elena needs to feel, Marcus helps her notice.
        </p>
      </section>

      {/* Listen Together - Full Width with Real Cover */}
      <section className="px-6 py-16 md:px-12 lg:px-24">
        <p className="text-[10px] uppercase tracking-[0.4em] text-tobacco mb-8 text-center">Listen Together</p>
        
        <div className="max-w-sm mx-auto animate-fade-in-up">
          <div className="relative aspect-square overflow-hidden mb-8">
            <AlbumCover
              src={ALBUMS.pinkMoon.cover}
              title={ALBUMS.pinkMoon.title}
              artist={ALBUMS.pinkMoon.artist}
              fallbackGradient="from-pink-900 to-stone-900"
              fill
            />
          </div>
          
          <div className="text-center">
            <p className="font-serif text-2xl text-cream mb-2">{ALBUMS.pinkMoon.title}</p>
            <p className="text-muted-foreground mb-6">{ALBUMS.pinkMoon.artist}</p>
            <p className="text-cream/70 leading-relaxed">
              Twenty-eight minutes of devastating intimacy. If you both listen at the same time, you&apos;ll still somehow be in the same room.
            </p>
          </div>
        </div>
      </section>

      {/* Closing Quote */}
      <section className="px-6 py-20 md:px-12 lg:px-24 bg-burgundy/10 border-y border-burgundy/20">
        <div className="max-w-lg mx-auto text-center animate-fade-in">
          <p className="font-serif text-2xl text-cream leading-relaxed italic">
            {'"'}The rarest compatibility isn&apos;t shared taste—it&apos;s shared attention. You both know how to be present with an album.{'"'}
          </p>
        </div>
      </section>
    </div>
  )
}

function OverlapCard({
  title,
  description,
  tags,
}: {
  title: string
  description: string
  tags: string[]
}) {
  return (
    <div className="bg-card/30 p-6 border border-border/20 animate-fade-in-up">
      <h3 className="font-serif text-xl text-cream mb-3">{title}</h3>
      <p className="text-cream/70 leading-relaxed mb-4">{description}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="text-xs px-3 py-1.5 bg-muted/30 text-tobacco">
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}

function SharedAlbum({
  image,
  title,
  artist,
}: {
  image: string
  title: string
  artist: string
}) {
  return (
    <div className="group animate-fade-in-up shrink-0 w-40">
      <div className="relative aspect-square mb-3 overflow-hidden">
        <AlbumCover
          src={image}
          title={title}
          artist={artist}
          fill
          className="transition-transform duration-700 group-hover:scale-105"
        />
      </div>
      <p className="font-serif text-base text-cream truncate">{title}</p>
      <p className="text-sm text-muted-foreground truncate">{artist}</p>
    </div>
  )
}

function ContrastCard({
  person,
  trait,
  description,
}: {
  person: string
  trait: string
  description: string
}) {
  return (
    <div className="p-6 border border-border/20 animate-fade-in-up">
      <p className="text-xs text-tobacco mb-2 uppercase tracking-wider">{person}</p>
      <h3 className="font-serif text-xl text-cream mb-3">{trait}</h3>
      <p className="text-cream/70 leading-relaxed">{description}</p>
    </div>
  )
}
