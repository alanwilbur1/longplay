'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlbumCover } from '@/components/album-cover'
import { ALBUMS, type Album } from '@/lib/albums'
import { LongPlayLogo } from '@/components/navigation'
import { getCurrentPhase, CURRENT_PROMPTS, CURATORS_NOTE } from '@/lib/weekly-cadence'
import { RESURFACED_MOMENTS, LISTENING_PERIODS } from '@/lib/archive'
import { getResonatingCycles } from '@/lib/cycles'
import { 
  RoomsThatResonate, 
  RoomDriftDisplay,
  AffinityInsightsDisplay,
  DriftingTowardDisplay,
} from '@/components/room-affinity-display'
import { getAffinityInsights, getPrimaryRoom } from '@/lib/room-affinity'

// Current week's album (static fallback; overridden by prop from server)
const STATIC_CURRENT_ALBUM = ALBUMS.forEmma

// Ambient listener activity - feels alive without being a feed
const AMBIENT_ACTIVITY = [
  "Several listeners returned to Track 5 tonight.",
  "The room continues circling themes of distance and restraint.",
  "A new annotation cluster formed around the album's closing movement.",
  "Most listeners are responding to the record's restraint rather than its melancholy.",
  "14 listeners marked the same passage this evening.",
]

// Featured clubs
const FEATURED_CLUBS = [
  {
    id: 'nocturnal-room',
    name: 'The Nocturnal Room',
    description: 'For listeners who find clarity after midnight',
    members: 847,
    currentAlbum: ALBUMS.forEmma,
  },
  {
    id: 'cathedral-hour',
    name: 'Cathedral Hour',
    description: 'Devotional listening. Ambient, sacred, transcendent.',
    members: 512,
    currentAlbum: ALBUMS.spiritOfEden,
  },
  {
    id: 'beautiful-damage',
    name: 'Beautiful Damage',
    description: 'Art made from fractures. Pain transmuted into resonance.',
    members: 734,
    currentAlbum: ALBUMS.punisher,
  },
]

interface HomeScreenProps {
  currentAlbum?: Album
}

export function HomeScreen({ currentAlbum: propAlbum }: HomeScreenProps = {}) {
  const CURRENT_ALBUM = propAlbum ?? STATIC_CURRENT_ALBUM
  const [phase, setPhase] = useState(getCurrentPhase())
  const [ambientMessage, setAmbientMessage] = useState(AMBIENT_ACTIVITY[0])
  const [isAfterMidnight, setIsAfterMidnight] = useState(false)
  const [currentInsight, setCurrentInsight] = useState(0)
  const affinityInsights = getAffinityInsights()
  const primaryRoom = getPrimaryRoom()

  useEffect(() => {
    // Update phase on mount
    setPhase(getCurrentPhase())
    
    // Check if after midnight
    const hour = new Date().getHours()
    setIsAfterMidnight(hour >= 23 || hour < 5)
    
    // Rotate ambient messages
    const interval = setInterval(() => {
      setAmbientMessage(prev => {
        const currentIndex = AMBIENT_ACTIVITY.indexOf(prev)
        return AMBIENT_ACTIVITY[(currentIndex + 1) % AMBIENT_ACTIVITY.length]
      })
    }, 12000)
    
    return () => clearInterval(interval)
  }, [])

  return (
    <div className={`grain relative pb-24 md:pb-0 ${phase.moodClass} ${isAfterMidnight ? 'after-midnight' : ''}`}>
      
      {/* ============================================ */}
      {/* THE OPENING - Cinematic Brand Moment */}
      {/* ============================================ */}
      <section className="relative min-h-[50svh] md:min-h-[60svh] flex flex-col items-center justify-center px-6 pt-20 md:pt-28">
        {/* Atmospheric Background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card/20" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300%] h-[80%] bg-gradient-radial from-burgundy/6 via-transparent to-transparent opacity-70" />
        </div>

        {/* Brand & Temporal Welcome */}
        <div className="text-center max-w-2xl animate-fade-in-slow">
          <LongPlayLogo className="mb-6" />
          
          {/* Category Framing - Institutional, Editorial */}
          <p className="text-[10px] uppercase tracking-[0.5em] text-cream/50 mb-4">
            A Listening Club
          </p>
          
          {/* Emotional Thesis - Intimate, Philosophical */}
          <p className="font-serif text-lg md:text-xl text-cream/70 italic mb-10">
            Where listening becomes identity
          </p>
          
          <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-8" />
          
          {/* Phase-aware greeting */}
          <p className="text-[10px] uppercase tracking-[0.4em] text-tobacco mb-3">
            {phase.day}
          </p>
          <h1 className="font-serif text-2xl md:text-3xl text-cream/90 leading-relaxed text-balance">
            {phase.subtitle}
          </h1>
        </div>
      </section>

      {/* ============================================ */}
      {/* THE CURRENT CYCLE - Ritual Anchor */}
      {/* ============================================ */}
      <section className="px-6 py-12 md:px-12 lg:px-24 md:py-16">
        <div className="max-w-3xl mx-auto">
          {/* Album Presentation - Hero */}
          <Link 
            href={`/album/${CURRENT_ALBUM.id}`}
            className="group block relative animate-fade-in-up"
            style={{ animationDelay: '0.3s' }}
          >
            {/* Album Art - Large, Cinematic */}
            <div className="relative aspect-square md:aspect-[16/9] overflow-hidden mb-8">
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent z-10" />
              <AlbumCover
                src={CURRENT_ALBUM.cover}
                alt={CURRENT_ALBUM.title}
                title={CURRENT_ALBUM.title}
                artist={CURRENT_ALBUM.artist}
                fill
                priority
                className="transition-transform duration-1000 group-hover:scale-[1.02]"
              />
              
              {/* Phase Badge */}
              <div className="absolute top-6 left-6 z-20">
                <div className="bg-background/80 backdrop-blur-sm border border-border/30 px-4 py-2">
                  <p className="text-[9px] uppercase tracking-[0.3em] text-tobacco">
                    {phase.title}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Album Info */}
            <div className="text-center md:text-left">
              <h2 className="font-serif text-3xl md:text-4xl text-cream mb-3 group-hover:text-cream/90 transition-colors duration-500">
                {CURRENT_ALBUM.title}
              </h2>
              <p className="text-lg text-muted-foreground mb-6">
                {CURRENT_ALBUM.artist} · {CURRENT_ALBUM.year}
              </p>
            </div>
          </Link>
          
          {/* Phase Invitation - Ceremonial Guidance */}
          <div className="border-l-2 border-tobacco/30 pl-6 py-4 mt-8 animate-fade-in" style={{ animationDelay: '0.6s' }}>
            <p className="font-serif text-xl md:text-2xl text-cream/80 leading-relaxed italic mb-4">
              "{phase.invitation}"
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {phase.description}
            </p>
          </div>
          
          {/* Enter Room CTA */}
          <div className="mt-10 flex justify-center md:justify-start animate-fade-in" style={{ animationDelay: '0.8s' }}>
            <Link
              href="/room"
              className="group flex items-center gap-3 border border-burgundy/40 bg-burgundy/5 px-8 py-4 text-cream hover:bg-burgundy/10 hover:border-burgundy/60 transition-all duration-500"
            >
              <span className="text-sm uppercase tracking-[0.2em]">Enter the Room</span>
              <svg className="w-4 h-4 transition-transform duration-500 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* THIS WEEK INSIDE LONGPLAY - Living Rhythm */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-8">
            This Week Inside LongPlay
          </p>
          
          <div className="space-y-8">
            {/* Ambient Observation - What's happening in the room */}
            <div className="animate-fade-in">
              <p className="font-serif text-lg text-cream/70 italic leading-relaxed">
                {ambientMessage}
              </p>
            </div>
            
            {/* Phase-specific preview */}
            <div className="grid gap-4 md:grid-cols-2">
              <WeeklyRhythmCard
                label={phase.nextPhase}
                description="The week unfolds at its own pace."
              />
              <WeeklyRhythmCard
                label="Your annotations remain private"
                description="Until discussion opens Friday evening."
                isPrivate
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* CURATORIAL VOICE - This Week's Guidance */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 bg-card/20">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-olive mb-4">
            Curatorial Note
          </p>
          
          <p className="font-serif text-xl md:text-2xl text-cream leading-relaxed mb-6">
            "This week&apos;s selection rewards patience."
          </p>
          
          <p className="text-muted-foreground leading-relaxed mb-8">
            {CURATORS_NOTE.excerpt.substring(0, 200)}...
          </p>
          
          {/* Prompts Preview */}
          <div className="border-t border-border/20 pt-8 mt-8">
            <p className="text-xs uppercase tracking-[0.2em] text-olive mb-6">
              Questions for Listening
            </p>
            <div className="space-y-4">
              {CURRENT_PROMPTS.slice(0, 2).map((prompt) => (
                <p key={prompt.id} className="font-serif text-lg text-cream/80 italic">
                  {prompt.prompt}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* RETURN TO YOUR LISTENING LIFE */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-4">
            From Your Archive
          </p>
          <h2 className="font-serif text-2xl text-cream mb-8">
            A Reflection Resurfaced
          </h2>
          
          {/* Resurfaced Moment */}
          {RESURFACED_MOMENTS[0] && (
            <div className="border border-border/20 bg-card/30 p-8">
              <p className="text-xs text-tobacco mb-4">
                {RESURFACED_MOMENTS[0].when}
              </p>
              <p className="font-serif text-xl text-cream/90 italic leading-relaxed mb-6">
                "{RESURFACED_MOMENTS[0].content}"
              </p>
              {RESURFACED_MOMENTS[0].album && (
                <div className="flex items-center gap-4">
                  <div className="relative w-12 h-12 overflow-hidden">
                    <AlbumCover
                      src={RESURFACED_MOMENTS[0].album.cover}
                      alt={RESURFACED_MOMENTS[0].album.title}
                      title={RESURFACED_MOMENTS[0].album.title}
                      artist={RESURFACED_MOMENTS[0].album.artist}
                      fill
                    />
                  </div>
                  <div>
                    <p className="text-sm text-cream">{RESURFACED_MOMENTS[0].album.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {RESURFACED_MOMENTS[0].timestamp && `${RESURFACED_MOMENTS[0].timestamp} · `}
                      {RESURFACED_MOMENTS[0].album.artist}
                    </p>
                  </div>
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-6 leading-relaxed">
                {RESURFACED_MOMENTS[0].context}
              </p>
            </div>
          )}
          
          {/* Link to Archive */}
          <div className="mt-8 flex justify-center md:justify-start">
            <Link
              href="/identity"
              className="text-cream/60 hover:text-cream transition-colors text-sm flex items-center gap-2"
            >
              <span>View your listening identity</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
              </svg>
            </Link>
          </div>
          
          {/* Current Archetype */}
          {LISTENING_PERIODS[LISTENING_PERIODS.length - 1] && (
            <div className="mt-12 text-center md:text-left">
              <p className="text-xs text-muted-foreground mb-2">Your current archetype</p>
              <p className="font-serif text-xl text-burgundy">
                {LISTENING_PERIODS[LISTENING_PERIODS.length - 1].archetype}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ============================================ */}
      {/* FROM YOUR PAST CYCLES - Living Archive */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 bg-card/20 border-y border-border/10">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mb-2">
            From Your Archive
          </p>
          <h2 className="font-serif text-2xl text-cream mb-8">
            Cycles Still Resonating
          </h2>
          
          <div className="space-y-4">
            {getResonatingCycles().slice(0, 2).map((cycle) => (
              <Link
                key={cycle.id}
                href="/archive/cycles"
                className="flex gap-4 p-4 border border-border/20 bg-background/50 hover:border-burgundy/30 transition-all duration-500"
              >
                <AlbumCover
                  src={cycle.album.cover}
                  alt={cycle.album.title}
                  title={cycle.album.title}
                  artist={cycle.album.artist}
                  className="w-16 h-16 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-tobacco mb-1">{cycle.seasonLabel}</p>
                  <h4 className="font-serif text-cream truncate">{cycle.album.title}</h4>
                  <p className="text-sm text-muted-foreground mb-1">{cycle.album.artist}</p>
                  <p className="text-xs text-cream/60 line-clamp-1">
                    {cycle.stillResonates.resonanceNote}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-serif text-burgundy">{cycle.stillResonates.returnsSince}</p>
                  <p className="text-[10px] text-muted-foreground">returns</p>
                </div>
              </Link>
            ))}
          </div>
          
          <Link
            href="/archive/cycles"
            className="inline-flex items-center gap-2 mt-6 text-sm text-cream/60 hover:text-cream transition-colors"
          >
            <span>Browse all past cycles</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ============================================ */}
      {/* ROOMS THAT RESONATE — Cultural Placement */}
      {/* NOT recommendations. WHERE YOU BELONG. */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-3xl mx-auto">
          {/* Editorial Observation - Living, breathing insight */}
          {affinityInsights[0] && (
            <div className="mb-12 border-l-2 border-tobacco/30 pl-6 py-2">
              <p className="font-serif text-lg md:text-xl text-cream/80 italic leading-relaxed mb-2">
                {affinityInsights[0].observation}
              </p>
              {affinityInsights[0].context && (
                <p className="text-sm text-muted-foreground">
                  {affinityInsights[0].context}
                </p>
              )}
            </div>
          )}
          
          {/* Primary Room Affinity */}
          <RoomsThatResonate variant="full" />
          
          {/* Room Drift - Identity evolution */}
          <div className="mt-12">
            <RoomDriftDisplay />
          </div>
          
          {/* Drifting Toward - Where listening is moving */}
          <div className="mt-12">
            <DriftingTowardDisplay />
          </div>
          
          {/* Link to all rooms */}
          <div className="mt-10 flex justify-center md:justify-start">
            <Link
              href="/clubs"
              className="text-cream/60 hover:text-cream transition-colors text-sm flex items-center gap-2"
            >
              <span>Explore all listening rooms</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* TOMORROW - Gentle Anticipation */}
      {/* ============================================ */}
      <section className="mx-6 md:mx-12 lg:mx-24 mb-16">
        <div className="max-w-3xl mx-auto">
          <div className="border border-burgundy/20 bg-burgundy/5 p-8 md:p-10 text-center md:text-left">
            <p className="text-[10px] uppercase tracking-[0.4em] text-burgundy/80 mb-3">
              {phase.nextPhase}
            </p>
            <p className="font-serif text-xl md:text-2xl text-cream/80 leading-relaxed">
              The week unfolds at its own pace. Tomorrow brings something new.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function WeeklyRhythmCard({
  label,
  description,
  isPrivate,
}: {
  label: string
  description: string
  isPrivate?: boolean
}) {
  return (
    <div className={`p-5 border ${isPrivate ? 'border-olive/20 bg-olive/5' : 'border-border/20 bg-card/20'}`}>
      <p className={`text-sm mb-1 ${isPrivate ? 'text-olive' : 'text-cream/80'}`}>
        {label}
      </p>
      <p className="text-xs text-muted-foreground">
        {description}
      </p>
    </div>
  )
}
