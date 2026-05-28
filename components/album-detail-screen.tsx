'use client'

import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ListeningModule } from '@/components/listening-module'
import { AlbumCover } from '@/components/album-cover'
import { ALBUMS } from '@/lib/albums'

const ALBUM = ALBUMS.forEmma

export function AlbumDetailScreen() {
  return (
    <div className="grain relative pb-24 md:pb-0">
      {/* Hero - Full Screen Album Art */}
      <section className="relative min-h-[85svh] flex flex-col justify-end">
        <div className="absolute inset-0">
          <AlbumCover
            src={ALBUM.cover}
            alt={ALBUM.title}
            title={ALBUM.title}
            artist={ALBUM.artist}
            fill
            priority
            className="scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        </div>
        
        {/* Album Info */}
        <div className="relative px-6 pb-12 md:px-12 lg:px-24">
          <div className="animate-fade-in-up max-w-2xl">
            <p className="text-xs uppercase tracking-[0.25em] text-tobacco mb-4">{ALBUM.year}</p>
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl text-cream mb-4 leading-[1.05]">
              {ALBUM.title.replace(', ', ',\n')}
            </h1>
            <p className="text-xl text-muted-foreground">{ALBUM.artist}</p>
          </div>
        </div>
      </section>

      {/* Album Metadata - Horizontal Scroll */}
      <section className="px-6 py-8 md:px-12 lg:px-24 border-b border-border/20">
        <div className="flex gap-8 overflow-x-auto pb-2 -mx-6 px-6 md:mx-0 md:px-0 md:overflow-visible scrollbar-hide">
          <MetaItem label="Label" value="Jagjaguwar" />
          <MetaItem label="Runtime" value="37 min" />
          <MetaItem label="Recorded" value="Winter 2006" />
          <MetaItem label="Genre" value="Folk, Indie" />
        </div>
      </section>

      {/* Listening Module - Premium Streaming Integration */}
      <section className="px-6 py-8 md:px-12 lg:px-24">
        <ListeningModule
          spotifyId={ALBUM.spotifyId}
          appleMusicUrl={ALBUM.appleMusicUrl}
          tidalUrl={ALBUM.tidalUrl}
          bandcampUrl={ALBUM.bandcampUrl}
          albumTitle={ALBUM.title}
          artist={ALBUM.artist}
          variant="full"
        />
      </section>

      {/* Curator Essay - Full Width Editorial */}
      <section className="px-6 py-16 md:px-12 lg:px-24">
        <p className="text-xs uppercase tracking-[0.25em] text-tobacco mb-8">Curator&apos;s Essay</p>
        
        <div className="font-serif text-xl md:text-2xl text-cream/90 leading-relaxed space-y-8 animate-fade-in max-w-2xl">
          <p>
            There are albums that arrive at the exact moment you need them. <span className="italic">For Emma, Forever Ago</span> does both.
          </p>
          <p>
            Built from the wreckage of a broken band and a broken heart, Justin Vernon retreated to his father&apos;s hunting cabin in northern Wisconsin during the winter of 2006.
          </p>
          <p>
            The falsetto that became Vernon&apos;s signature was born here, not as stylistic choice but as necessity. When you&apos;re alone in the woods and the temperature drops below zero, your voice does strange things.
          </p>
          <p className="text-cream/60">
            This is music for the 3 AM listener.
          </p>
        </div>
      </section>

      {/* Emotional Dimensions - Full Width Sliders */}
      <section className="px-6 py-16 md:px-12 lg:px-24 bg-navy/15">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-8">Emotional Dimensions</p>
        
        {/* Mood Tags */}
        <div className="flex flex-wrap gap-3 mb-12">
          {['Melancholic', 'Intimate', 'Wintry', 'Fragile', 'Cathartic'].map((mood) => (
            <span 
              key={mood}
              className="px-4 py-2 bg-muted/30 text-cream/80 text-sm border border-border/30"
            >
              {mood}
            </span>
          ))}
        </div>

        {/* Sonic Dimensions */}
        <div className="space-y-6 max-w-lg">
          <DimensionBar label="Warmth" value={85} />
          <DimensionBar label="Density" value={35} />
          <DimensionBar label="Tempo" value={25} />
          <DimensionBar label="Vocal Presence" value={90} />
        </div>
      </section>

      {/* Tracklist - Full Width */}
      <section className="px-6 py-16 md:px-12 lg:px-24">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-8">Tracklist</p>
        
        <div className="space-y-1">
          <TrackItem number={1} title="Flume" duration="3:39" annotations={4} highlight />
          <TrackItem number={2} title="Lump Sum" duration="3:21" annotations={2} />
          <TrackItem number={3} title="Skinny Love" duration="3:58" annotations={12} highlight />
          <TrackItem number={4} title="The Wolves (Act I and II)" duration="5:22" annotations={6} />
          <TrackItem number={5} title="Blindsided" duration="5:29" annotations={3} />
          <TrackItem number={6} title="Creature Fear" duration="3:06" annotations={1} />
          <TrackItem number={7} title="Team" duration="1:57" />
          <TrackItem number={8} title="For Emma" duration="3:42" annotations={5} />
          <TrackItem number={9} title="Re: Stacks" duration="6:41" annotations={8} highlight />
        </div>
      </section>

      {/* Listener Annotations - Vertical Stack */}
      <section className="px-6 py-16 md:px-12 lg:px-24 bg-card/30">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-8">Listener Annotations</p>
        
        <div className="space-y-8">
          <AnnotationCard
            avatar="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100"
            name="Elena"
            track="Skinny Love"
            timestamp="2:47"
            note="The way his voice cracks here—it's not a flaw, it's the whole point. This is what heartbreak actually sounds like."
          />
          <AnnotationCard
            avatar="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100"
            name="Marcus"
            track="Re: Stacks"
            timestamp="4:12"
            note="'This is not the sound of a new man or crispy realization.' He's not offering hope. He's offering honesty."
          />
          <AnnotationCard
            avatar="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100"
            name="Sofia"
            track="Flume"
            timestamp="0:34"
            note="The first 30 seconds are all you need to know if this album is for you."
          />
        </div>
      </section>

      {/* Saved Moments - Horizontal Scroll */}
      <section className="px-6 py-16 md:px-12 lg:px-24">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-8">Saved Moments</p>
        
        <div className="flex gap-5 overflow-x-auto pb-4 -mx-6 px-6 md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible scrollbar-hide">
          <MomentCard
            track="Skinny Love"
            lyric="Come on skinny love, just last the year"
            saves={47}
          />
          <MomentCard
            track="Re: Stacks"
            lyric="This is not the sound of a new man or crispy realization"
            saves={38}
          />
          <MomentCard
            track="Flume"
            lyric="Only love is all maroon"
            saves={29}
          />
        </div>
      </section>

      {/* Phase 6B.2: the previous "Enter the Listening Room" CTA
          pointed at the now-removed singular /room route. The album
          page no longer claims a room — listeners discover rooms via
          /rooms. This section now surfaces room discovery directly. */}
      <section className="px-6 py-16 md:px-12 lg:px-24 border-t border-border/20">
        <div className="text-center max-w-md mx-auto">
          <h2 className="font-serif text-2xl md:text-3xl text-cream mb-4">Find a room listening to this</h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Albums live inside rooms here. Browse the rooms to see which one is sitting with this record.
          </p>
          <Link
            href="/rooms"
            className="inline-flex items-center justify-center gap-3 bg-burgundy/80 hover:bg-burgundy px-8 py-4 text-cream transition-all duration-500 w-full md:w-auto"
          >
            <span className="font-medium tracking-wide">Browse rooms</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="shrink-0">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm text-cream whitespace-nowrap">{value}</p>
    </div>
  )
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-cream/50">{value}%</span>
      </div>
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div 
          className="h-full bg-tobacco rounded-full transition-all duration-1000"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}

function TrackItem({ 
  number, 
  title, 
  duration, 
  annotations,
  highlight 
}: { 
  number: number
  title: string
  duration: string
  annotations?: number
  highlight?: boolean
}) {
  return (
    <div className={`flex items-center gap-4 px-4 py-4 transition-colors duration-300 active:bg-muted/30 ${
      highlight ? 'border-l-2 border-burgundy -ml-0.5' : ''
    }`}>
      <span className="w-6 text-sm text-muted-foreground font-mono">{number}</span>
      <span className={`flex-1 ${highlight ? 'text-cream' : 'text-cream/80'} text-base`}>{title}</span>
      {annotations && (
        <span className="text-xs text-tobacco">{annotations}</span>
      )}
      <span className="text-sm text-muted-foreground font-mono">{duration}</span>
    </div>
  )
}

function AnnotationCard({
  avatar,
  name,
  track,
  timestamp,
  note,
}: {
  avatar: string
  name: string
  track: string
  timestamp: string
  note: string
}) {
  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center gap-3 mb-4">
        <Avatar className="h-9 w-9 border border-border/50">
          <AvatarImage src={avatar} alt={name} />
          <AvatarFallback>{name[0]}</AvatarFallback>
        </Avatar>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-cream text-sm">{name}</span>
          <span className="text-xs text-muted-foreground">on</span>
          <span className="text-xs text-olive">{track}</span>
          <span className="font-mono text-[10px] bg-muted/50 px-1.5 py-0.5 text-muted-foreground">{timestamp}</span>
        </div>
      </div>
      <p className="text-cream/85 leading-relaxed pl-12">{note}</p>
    </div>
  )
}

function MomentCard({
  track,
  lyric,
  saves,
}: {
  track: string
  lyric: string
  saves: number
}) {
  return (
    <div className="bg-muted/20 p-6 border border-border/20 animate-fade-in-up shrink-0 w-72 md:w-auto">
      <p className="font-serif text-lg text-cream italic mb-4 leading-relaxed">{'"'}{lyric}{'"'}</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-tobacco">{track}</span>
        <span className="text-muted-foreground">{saves} saved</span>
      </div>
    </div>
  )
}
