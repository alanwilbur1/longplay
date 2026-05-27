'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AlbumCover } from '@/components/album-cover'
import { ALBUMS } from '@/lib/albums'

export function ListeningClubScreen() {
  return (
    <div className="grain relative pb-24 md:pb-0 md:pt-16">
      {/* Club Header - Mobile First */}
      <section className="px-6 pt-8 pb-12 md:px-12 lg:px-24">
        <div className="animate-fade-in">
          <p className="text-xs uppercase tracking-[0.25em] text-tobacco mb-4">Your Club</p>
          <h1 className="font-serif text-4xl md:text-5xl text-cream mb-6 leading-tight">
            The Nocturnal<br className="md:hidden" /> Society
          </h1>
          <p className="text-muted-foreground leading-relaxed max-w-md">
            A gathering of listeners who find meaning in the quiet hours.
          </p>
        </div>
        
        {/* Members */}
        <div className="flex items-center gap-3 mt-8 animate-fade-in">
          <div className="flex -space-x-2">
            {[
              'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
              'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
              'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100',
            ].map((src, i) => (
              <Avatar key={i} className="h-9 w-9 border-2 border-background">
                <AvatarImage src={src} />
                <AvatarFallback>M</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">12 members</span>
        </div>
      </section>

      {/* Current Album - Full Bleed Mobile */}
      <section className="px-6 pb-12 md:px-12 lg:px-24">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-6">Current Cycle</p>
        
        <div className="animate-fade-in-up">
          {/* Album Art - Large Cinematic Cover */}
          <div className="relative aspect-square mb-8 overflow-hidden bg-muted max-w-sm mx-auto md:max-w-none md:aspect-[3/2] lg:aspect-[2/1]">
            <AlbumCover
              src={ALBUMS.forEmma.cover}
              alt={ALBUMS.forEmma.title}
              title={ALBUMS.forEmma.title}
              artist={ALBUMS.forEmma.artist}
              fill
              className="md:object-[center_30%]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent md:bg-gradient-to-r md:from-background md:via-background/50 md:to-transparent" />
            
            {/* Album Info Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 md:max-w-md">
              <h2 className="font-serif text-3xl md:text-4xl text-cream mb-2">{ALBUMS.forEmma.title}</h2>
              <p className="text-lg text-muted-foreground mb-4">{ALBUMS.forEmma.artist}</p>
              <p className="text-sm text-tobacco">Week 2 of 3</p>
            </div>
          </div>
        </div>
      </section>

      {/* Weekly Cadence - Vertical Timeline */}
      <section className="px-6 pb-12 md:px-12 lg:px-24">
        <h3 className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-8">Weekly Cadence</h3>
        
        <div className="space-y-6">
          <TimelineItem 
            week="Week 1" 
            focus="First Listen" 
            description="Initial impressions. Let the album wash over you."
            complete
          />
          <TimelineItem 
            week="Week 2" 
            focus="Deep Dive" 
            description="Track-by-track exploration. Notice what you missed."
            active
          />
          <TimelineItem 
            week="Week 3" 
            focus="Reflection" 
            description="Write your thoughts. Share what stayed with you."
          />
        </div>

        {/* Curator Prompt - Full Width */}
        <div className="border-l-2 border-burgundy/60 pl-5 mt-12">
          <p className="text-xs uppercase tracking-[0.25em] text-burgundy mb-4">This Week&apos;s Prompt</p>
          <p className="font-serif text-xl text-cream/90 italic leading-relaxed">
            {'"'}Which track changed for you on second listen?{'"'}
          </p>
        </div>
      </section>

      {/* Phase 6A.13: Member Reflections section removed. Previously
          rendered three hardcoded ReflectionCards with Unsplash stock
          avatars and invented quotes attributed to fake members
          ("Elena/Marcus/Sofia"). Until reflections come from the real
          moments table, the section is hidden — authentic sparsity
          over fake richness. The ReflectionCard component is preserved
          below so a future real-data rendering can reuse it. */}

      {/* Upcoming - Horizontal Scroll */}
      <section className="px-6 py-12 md:px-12 lg:px-24">
        <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-8">Upcoming</h2>
        
        <div className="flex gap-5 overflow-x-auto pb-4 -mx-6 px-6 md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible scrollbar-hide">
          <UpcomingAlbum album={ALBUMS.carrieAndLowell} startDate="Dec 15" />
          <UpcomingAlbum album={ALBUMS.blue} startDate="Jan 5" />
          <UpcomingAlbum album={ALBUMS.pinkMoon} startDate="Jan 26" />
        </div>
      </section>
    </div>
  )
}

function TimelineItem({ 
  week, 
  focus, 
  description, 
  complete, 
  active 
}: { 
  week: string
  focus: string
  description: string
  complete?: boolean
  active?: boolean
}) {
  return (
    <div className="flex gap-5">
      <div className="flex flex-col items-center pt-1">
        <div className={`w-3 h-3 rounded-full ${
          complete ? 'bg-tobacco' : active ? 'bg-burgundy' : 'bg-muted/50'
        }`} />
        <div className="w-px flex-1 bg-border/30 mt-2" />
      </div>
      <div className="pb-4">
        <p className={`text-xs uppercase tracking-wider ${active ? 'text-burgundy' : 'text-muted-foreground'}`}>{week}</p>
        <p className={`font-serif text-xl mt-1 ${active ? 'text-cream' : complete ? 'text-cream/70' : 'text-muted-foreground'}`}>
          {focus}
        </p>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function ReflectionCard({
  avatar,
  name,
  archetype,
  reflection,
  track,
  timestamp,
}: {
  avatar: string
  name: string
  archetype: string
  reflection: string
  track: string
  timestamp?: string
}) {
  return (
    <div className="bg-card/40 p-6 animate-fade-in-up">
      <div className="flex items-start gap-4 mb-5">
        <Avatar className="h-11 w-11 border border-border/50">
          <AvatarImage src={avatar} alt={name} />
          <AvatarFallback>{name[0]}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium text-cream">{name}</p>
          <p className="text-xs text-tobacco mt-0.5">{archetype}</p>
        </div>
      </div>
      <p className="font-serif text-lg text-cream/90 leading-relaxed mb-5 italic">
        {'"'}{reflection}{'"'}
      </p>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>On</span>
        <span className="text-olive">{track}</span>
        {timestamp && (
          <>
            <span>at</span>
            <span className="font-mono text-xs bg-muted/50 px-2 py-0.5">{timestamp}</span>
          </>
        )}
      </div>
    </div>
  )
}

function UpcomingAlbum({
  album,
  startDate,
}: {
  album: typeof ALBUMS.forEmma
  startDate: string
}) {
  return (
    <div className="group animate-fade-in-up shrink-0 w-44 md:w-auto">
      <div className="relative aspect-square mb-4 overflow-hidden bg-muted opacity-60 group-hover:opacity-80 transition-opacity duration-500">
        <AlbumCover
          src={album.cover}
          alt={album.title}
          title={album.title}
          artist={album.artist}
          fill
          className="grayscale group-hover:grayscale-0 transition-all duration-700"
        />
      </div>
      <h3 className="font-serif text-base text-cream/70 group-hover:text-cream transition-colors duration-500 truncate">{album.title}</h3>
      <p className="text-sm text-muted-foreground truncate">{album.artist}</p>
      <p className="text-xs text-olive mt-2">{startDate}</p>
    </div>
  )
}
