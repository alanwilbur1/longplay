'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AlbumCover } from '@/components/album-cover'
import { ALBUMS } from '@/lib/albums'
import { 
  AffinityFieldVisualization,
  RoomsThatResonate,
  ExpansionRoomsDisplay,
  AffinityInsightsDisplay,
  RoomDriftDisplay,
} from '@/components/room-affinity-display'
import { 
  ROOM_AFFINITIES,
  ROOM_MEMORIES,
  getResonatingRooms,
  getPrimaryRoom,
} from '@/lib/room-affinity'

/**
 * THE LISTENING IDENTITY
 * 
 * This is the emotional core of LongPlay.
 * Not a profile. Not a dashboard. Not analytics.
 * 
 * This is where the platform articulates who you are
 * through how you listen.
 * 
 * It should feel:
 * - authored
 * - revelatory
 * - emotionally intelligent
 * - like reading criticism written about your inner life
 */

export function IdentityProfileScreen() {
  const [cardCopied, setCardCopied] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleShareCard = () => {
    setCardCopied(true)
    setTimeout(() => setCardCopied(false), 2500)
  }

  if (!mounted) return null

  return (
    <div className="grain relative pb-24 md:pb-0 bg-background">
      {/* ============================================ */}
      {/* THE QUESTION — Full Screen Hero */}
      {/* The emotional centerpiece of LongPlay */}
      {/* ============================================ */}
      <section className="relative min-h-[100svh] flex items-center justify-center px-6 py-24 overflow-hidden">
        {/* Atmospheric background - subtle burgundy glow */}
        <div className="absolute inset-0 bg-gradient-radial from-burgundy/8 via-transparent to-transparent opacity-60" />
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-background to-transparent" />
        
        <div className="relative max-w-2xl mx-auto text-center">
          {/* The Question */}
          <div className="animate-fade-in-slow">
            <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco/60 mb-8">
              The question everyone asks
            </p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-cream/90 leading-[1.15] mb-16">
              {'"'}What kind of music<br />do you like?{'"'}
            </h1>
          </div>

          {/* The Answer — Editorial, revelatory */}
          <div className="animate-fade-in-slow space-y-8" style={{ animationDelay: '400ms' }}>
            <p className="font-serif text-xl md:text-2xl text-cream/80 leading-relaxed">
              You are drawn less to genre than to <span className="text-tobacco">emotional architecture</span>.
            </p>
            
            <p className="font-serif text-xl md:text-2xl text-cream/80 leading-relaxed">
              Across ambient music, post-rock, folk, and alternative records, you consistently favor 
              <span className="text-burgundy"> atmosphere, restraint, and emotional accumulation</span> over immediacy.
            </p>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 animate-fade-in" style={{ animationDelay: '1.8s' }}>
            <div className="w-px h-20 bg-gradient-to-b from-transparent via-cream/20 to-cream/50" />
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* THE TASTE PORTRAIT — Essayistic, Literary */}
      {/* Like reading criticism about your inner life */}
      {/* ============================================ */}
      <section className="px-6 py-24 md:py-32 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground/70 mb-12">
            A Portrait in Sound
          </p>

          <div className="space-y-10">
            <p className="font-serif text-xl md:text-2xl text-cream leading-relaxed">
              You seek music that <span className="text-tobacco">earns its emotional moments</span>. 
              Patient builds. Devastation that arrives quietly. You distrust music that demands attention — 
              you prefer records that reward it.
            </p>
            
            <p className="font-serif text-xl md:text-2xl text-cream leading-relaxed">
              There&apos;s a thread of <span className="text-olive">melancholy-as-comfort</span> running 
              through your listening. The right kind of sadness can feel like company. You return to 
              certain records not despite their heaviness, but because of it.
            </p>

            <p className="font-serif text-xl md:text-2xl text-cream leading-relaxed">
              You trust <span className="text-burgundy">atmosphere before confession</span>. The production, 
              the texture, the space around the notes — these matter as much as what&apos;s being said. 
              Maybe more.
            </p>

            <p className="font-serif text-xl md:text-2xl text-cream leading-relaxed">
              Even your loudest records carry restraint. You&apos;re drawn to artists who understand 
              that <span className="text-tobacco">what isn&apos;t played</span> shapes what is.
            </p>
          </div>

          {/* The Summary Line */}
          <div className="mt-16 pt-12 border-t border-border/20">
            <p className="font-serif text-lg text-cream/50 italic leading-relaxed">
              Intimacy over spectacle. Confession over performance. Winter over summer.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* THE ARCHETYPE — Earned Cultural Identity */}
      {/* ============================================ */}
      <section className="relative px-6 py-28 md:py-36 md:px-12 lg:px-24 bg-gradient-to-b from-burgundy/5 via-burgundy/8 to-transparent">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco/70 mb-10">
            Your Listening Archetype
          </p>
          
          <h2 className="font-serif text-5xl md:text-6xl lg:text-7xl text-cream leading-[1.1] mb-10">
            The Nocturnal<br />Romantic
          </h2>

          <p className="font-serif text-xl text-cream/70 italic leading-relaxed max-w-lg mx-auto mb-6">
            {'"'}You listen like someone writing letters they&apos;ll never send. 
            Music finds you in the quiet hours.{'"'}
          </p>

          {/* Archetype traits */}
          <div className="mt-16 flex flex-wrap justify-center gap-3">
            <span className="px-4 py-2 text-xs uppercase tracking-widest text-tobacco border border-tobacco/30">
              Late-night listener
            </span>
            <span className="px-4 py-2 text-xs uppercase tracking-widest text-cream/60 border border-cream/20">
              Atmosphere-first
            </span>
            <span className="px-4 py-2 text-xs uppercase tracking-widest text-cream/60 border border-cream/20">
              Emotional restraint
            </span>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* RECORDS THAT BUILT YOU */}
      {/* Not top albums — foundational ones */}
      {/* ============================================ */}
      <section className="px-6 py-24 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground/70 mb-4">
            Not top albums — foundational ones
          </p>
          <h3 className="font-serif text-3xl md:text-4xl text-cream mb-16">
            Records That Built You
          </h3>

          <div className="space-y-24">
            <FoundationalRecord
              album={ALBUMS.forEmma}
              note="The record that taught you sadness could be sanctuary. You found it during a winter that felt endless, and something in you recognized it immediately."
              impact="It opened a door — to the cabin aesthetic, to the idea that an album could feel like a place you could inhabit. You&apos;ve been looking for that feeling ever since."
            />
            <FoundationalRecord
              album={ALBUMS.inRainbows}
              note="The first time you understood that an album could be both mathematically precise and devastatingly emotional. That warmth and meticulous craft weren&apos;t opposites."
              impact="It taught you to listen actively, to hear architecture in music. To understand that sonic textures carry emotional weight."
            />
            <FoundationalRecord
              album={ALBUMS.pinkMoon}
              note="Twenty-eight minutes that changed how you thought about intimacy in music. Just a man, a guitar, and the sound of a room."
              impact="It showed you that simplicity required more courage than excess. That the spaces between notes could be as important as the notes themselves."
            />
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* RECORDS & ARTISTS THAT RESONATE */}
      {/* Unexpected connections through emotion */}
      {/* ============================================ */}
      <section className="px-6 py-24 md:px-12 lg:px-24 bg-card/30 border-y border-border/10">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground/70 mb-4">
            Why these belong together
          </p>
          <h3 className="font-serif text-3xl md:text-4xl text-cream mb-16">
            Records & Artists That Resonate
          </h3>

          <div className="space-y-16">
            <ResonanceConnection
              left={{ album: ALBUMS.spiritOfEden, label: "Talk Talk" }}
              right={{ album: ALBUMS.ruins, label: "Grouper" }}
              explanation="Both create space for you to enter — patient, organic, trusting silence as much as sound. Neither demands your attention; both reward it."
            />
            <ResonanceConnection
              left={{ album: ALBUMS.forEmma, label: "Bon Iver" }}
              right={{ album: ALBUMS.carrieAndLowell, label: "Sufjan Stevens" }}
              explanation="Grief processed through restraint. Both find beauty in what&apos;s withheld. Neither shouts the pain — they whisper it, and somehow that&apos;s louder."
            />
            <ResonanceConnection
              left={{ album: ALBUMS.vespertine, label: "Björk" }}
              right={{ album: ALBUMS.kindOfBlue, label: "Miles Davis" }}
              explanation="Intimacy constructed through negative space. Both understand that what surrounds a note defines it. Cold rooms, warm interiors."
            />
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SONIC THREADS — Recurring Patterns */}
      {/* ============================================ */}
      <section className="px-6 py-24 md:px-12 lg:px-24">
        <div className="max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground/70 mb-12">
            Sonic Threads
          </p>

          <div className="space-y-12">
            <SonicThread
              title="Patient Pacing"
              description="Albums that build slowly, that trust silence, that let emotional weight accumulate without forcing release. You don&apos;t need the crescendo — you need the approach."
            />
            <SonicThread
              title="Analog Warmth"
              description="Tape hiss, room tone, the imperfection of human performance. You prefer the sound of a space to the sound of a computer. The breath before the note."
            />
            <SonicThread
              title="Restrained Vocals"
              description="Singers who whisper rather than shout. Confessional rather than performative. You trust vulnerability more when it isn&apos;t performed."
            />
            <SonicThread
              title="Winter Aesthetics"
              description="Cold imagery. Night. Solitude. Music that sounds like it was made in winter, or at least understands what winter feels like from the inside."
            />
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* EMOTIONAL DIMENSIONS — Organic, Not Charts */}
      {/* ============================================ */}
      <section className="px-6 py-24 md:px-12 lg:px-24 bg-gradient-to-b from-transparent via-navy/5 to-transparent">
        <div className="max-w-xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground/70 mb-4 text-center">
            Emotional Gravity
          </p>
          <h3 className="font-serif text-2xl text-cream mb-16 text-center">
            Where Your Listening Pulls
          </h3>

          <div className="space-y-12">
            <EmotionalDimension left="Warmth" right="Cold" value={72} description="You lean warm, but a specific kind — the warmth of a fire in a cold room." />
            <EmotionalDimension left="Intimate" right="Expansive" value={28} description="Close listening. Small spaces. Music that sits with you." />
            <EmotionalDimension left="Organic" right="Synthetic" value={22} description="Strongly acoustic. Human hands, real rooms, imperfect takes." />
            <EmotionalDimension left="Sparse" right="Dense" value={38} description="You prefer space, but you can disappear into density when it&apos;s earned." />
            <EmotionalDimension left="Hopeful" right="Melancholic" value={68} description="The melancholy side, but not despair. Sadness that knows beauty." />
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* YOUR LISTENING LIFE — Evolution Timeline */}
      {/* ============================================ */}
      <section className="px-6 py-24 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground/70 mb-4">
            How you&apos;ve changed
          </p>
          <h3 className="font-serif text-3xl md:text-4xl text-cream mb-16">
            Your Listening Life
          </h3>

          <div className="relative pl-8 border-l border-tobacco/30">
            <EvolutionMoment
              period="This Winter"
              archetype="The Nocturnal Romantic"
              insight="Your listening became more introspective. You&apos;re choosing immersion over variety — returning to the same records rather than seeking new ones."
              isRecent
            />
            <EvolutionMoment
              period="Autumn 2025"
              archetype="The Cathedral Listener"
              insight="A turn toward analog production, room tone, organic texture. Something in you started rejecting digital precision."
            />
            <EvolutionMoment
              period="Summer 2025"
              archetype="The Sonic Wanderer"
              insight="Your ambient phase deepened. Entire weeks passed without lyrical content. You were listening to space, not songs."
            />
            <EvolutionMoment
              period="Winter 2024"
              archetype="The Midnight Archivist"
              insight="The winter that changed everything. Bon Iver opened a door. You&apos;ve been walking through rooms like it ever since."
              isLast
            />
          </div>

          <Link 
            href="/archive"
            className="mt-12 block text-tobacco hover:text-cream transition-colors duration-500 flex items-center gap-2 text-sm"
          >
            <span>See your complete listening archive</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ============================================ */}
      {/* THE SHAREABLE IDENTITY CARD */}
      {/* Premium, collectible, Criterion-inspired */}
      {/* ============================================ */}
      <section className="px-6 py-28 md:px-12 lg:px-24 bg-gradient-to-b from-burgundy/5 to-transparent">
        <div className="max-w-sm mx-auto">
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground/70 text-center mb-10">
            Your Listening Identity
          </p>

          {/* The Card — Criterion Collection inspired */}
          <div className="relative">
            <div className="aspect-[3/4] bg-gradient-to-br from-background via-card to-burgundy/10 border border-cream/10 p-10 flex flex-col justify-between shadow-2xl">
              {/* Card Header */}
              <div>
                <p className="text-[9px] uppercase tracking-[0.5em] text-tobacco font-medium">LongPlay</p>
                <div className="w-12 h-px bg-tobacco/40 mt-2" />
              </div>

              {/* Card Content */}
              <div className="text-center py-8">
                <p className="text-[8px] uppercase tracking-[0.5em] text-muted-foreground mb-6">
                  Listening Archetype
                </p>
                <h4 className="font-serif text-4xl text-cream mb-8 leading-tight">
                  The Nocturnal<br />Romantic
                </h4>
                <div className="w-16 h-px bg-burgundy/50 mx-auto mb-8" />
                <p className="font-serif text-sm text-cream/60 italic leading-relaxed max-w-[220px] mx-auto">
                  {'"'}You listen like someone writing letters they&apos;ll never send.{'"'}
                </p>
              </div>

              {/* Card Footer */}
              <div className="text-center">
                <p className="text-[9px] uppercase tracking-[0.5em] text-muted-foreground">
                  Elena / Winter 2026
                </p>
              </div>
            </div>

            {/* Share button */}
            <button
              onClick={handleShareCard}
              className="mt-8 w-full py-4 border border-cream/20 text-cream/70 text-sm uppercase tracking-[0.25em] hover:bg-cream/5 hover:border-cream/30 transition-all duration-500"
            >
              {cardCopied ? 'Copied to clipboard' : 'Share your identity'}
            </button>

            <Link 
              href="/share"
              className="mt-6 block text-center text-sm text-muted-foreground hover:text-cream transition-colors"
            >
              See all shareable artifacts
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* ROOM AFFINITY — Where Your Listening Belongs */}
      {/* NOT recommendations. CULTURAL PLACEMENT. */}
      {/* ============================================ */}
      <section className="px-6 py-24 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground/70 mb-4">
            Where Your Listening Belongs
          </p>
          <h3 className="font-serif text-2xl text-cream mb-6">
            Rooms That Understand How You Listen
          </h3>
          
          <p className="text-cream/60 leading-relaxed mb-12">
            These are not recommendations. These are the listening cultures that align with your 
            emotional tendencies, sonic gravities, and identity patterns.
          </p>

          {/* Affinity Field Visualization */}
          <div className="mb-16 py-8">
            <AffinityFieldVisualization />
            <p className="text-center text-xs text-muted-foreground mt-6 italic">
              Your room affinities, visualized as emotional gravity
            </p>
          </div>
          
          {/* Room Affinities with rich explanations */}
          <div className="space-y-8 mb-12">
            {getResonatingRooms().map((affinity) => (
              <div key={affinity.roomSlug} className="border border-border/20 bg-card/20 p-6">
                <div className="flex items-start justify-between mb-4">
                  <Link 
                    href={`/rooms/${affinity.roomSlug}`}
                    className="font-serif text-xl text-cream hover:text-tobacco transition-colors duration-500"
                  >
                    {affinity.roomName}
                  </Link>
                  <span className={`text-[9px] uppercase tracking-[0.2em] px-2 py-1 border ${
                    affinity.resonance === 'deep' ? 'text-burgundy border-burgundy/50' :
                    affinity.resonance === 'strong' ? 'text-tobacco border-tobacco/50' :
                    'text-olive border-olive/50'
                  }`}>
                    {affinity.resonance === 'deep' ? 'Primary' : 
                     affinity.resonance === 'strong' ? 'Strong' : 'Emerging'}
                  </span>
                </div>
                
                {/* Why this room resonates */}
                <p className="font-serif text-cream/80 italic leading-relaxed mb-4">
                  "{affinity.resonanceExplanation}"
                </p>
                
                {/* Emotional threads */}
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
                    Emotional Threads
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {affinity.emotionalThreads.map((thread) => (
                      <span
                        key={thread}
                        className="text-xs text-cream/60 border border-border/20 px-2 py-1"
                      >
                        {thread}
                      </span>
                    ))}
                  </div>
                </div>
                
                {/* Sonic patterns */}
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
                    Sonic Patterns
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {affinity.sonicPatterns.map((pattern) => (
                      <span
                        key={pattern}
                        className="text-xs text-cream/60 border border-border/20 px-2 py-1"
                      >
                        {pattern}
                      </span>
                    ))}
                  </div>
                </div>
                
                {/* Drift indicator */}
                {affinity.trendNote && (
                  <p className="text-xs text-olive italic mt-4 pt-4 border-t border-border/10">
                    {affinity.trendNote}
                  </p>
                )}
              </div>
            ))}
          </div>
          
          {/* Room drift */}
          <RoomDriftDisplay className="mb-12" />
          
          {/* Expansion rooms */}
          <ExpansionRoomsDisplay className="mb-12" />

          <Link 
            href="/clubs"
            className="block text-tobacco hover:text-cream transition-colors duration-500 flex items-center gap-2 text-sm"
          >
            <span>Explore all listening rooms</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
            </svg>
          </Link>
        </div>
      </section>
      
      {/* ============================================ */}
      {/* ROOM MEMORY — How rooms accumulate meaning */}
      {/* ============================================ */}
      <section className="px-6 py-24 md:px-12 lg:px-24 bg-card/20 border-y border-border/10">
        <div className="max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground/70 mb-4">
            Your Room Memory
          </p>
          <h3 className="font-serif text-2xl text-cream mb-12">
            How Rooms Have Shaped Your Listening
          </h3>
          
          <div className="space-y-8">
            {ROOM_MEMORIES.slice(0, 3).map((memory) => (
              <div key={memory.roomSlug} className="border-l-2 border-tobacco/30 pl-6 py-2">
                <Link 
                  href={`/rooms/${memory.roomSlug}`}
                  className="font-serif text-xl text-cream hover:text-tobacco transition-colors duration-500 mb-2 block"
                >
                  {ROOM_AFFINITIES.find(a => a.roomSlug === memory.roomSlug)?.roomName || memory.roomSlug}
                </Link>
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                  <span>Member since {memory.firstVisit}</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span>{memory.totalCyclesParticipated} cycles</span>
                </div>
                
                {memory.seasonalPattern && (
                  <p className="text-sm text-cream/60 italic mb-2">
                    {memory.seasonalPattern}
                  </p>
                )}
                
                {memory.significantMoment && (
                  <div className="mt-4 p-4 bg-burgundy/5 border border-burgundy/20">
                    <p className="text-xs text-burgundy/70 uppercase tracking-[0.2em] mb-1">
                      Significant Moment
                    </p>
                    <p className="text-sm text-cream/80">
                      <span className="text-tobacco">{memory.significantMoment.cycle}:</span>{' '}
                      {memory.significantMoment.note}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// ============================================
// COMPONENT: Foundational Record
// ============================================
function FoundationalRecord({
  album,
  note,
  impact,
}: {
  album: typeof ALBUMS.forEmma
  note: string
  impact: string
}) {
  return (
    <div className="grid md:grid-cols-[200px_1fr] gap-8 items-start">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <AlbumCover
          src={album.cover}
          alt={album.title}
          title={album.title}
          artist={album.artist}
          fill
        />
      </div>
      <div>
        <p className="text-xs text-tobacco mb-2">{album.year}</p>
        <h4 className="font-serif text-2xl text-cream mb-1">{album.title}</h4>
        <p className="text-muted-foreground mb-6">{album.artist}</p>
        <p className="font-serif text-lg text-cream/80 italic leading-relaxed mb-4">{note}</p>
        <p className="text-cream/60 leading-relaxed">{impact}</p>
      </div>
    </div>
  )
}

// ============================================
// COMPONENT: Resonance Connection
// ============================================
function ResonanceConnection({
  left,
  right,
  explanation,
}: {
  left: { album: typeof ALBUMS.forEmma; label: string }
  right: { album: typeof ALBUMS.forEmma; label: string }
  explanation: string
}) {
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative w-14 h-14 overflow-hidden bg-muted shrink-0">
            <AlbumCover
              src={left.album.cover}
              alt={left.album.title}
              title={left.album.title}
              artist={left.album.artist}
              fill
            />
          </div>
          <span className="font-serif text-cream">{left.label}</span>
        </div>
        <span className="text-tobacco text-lg">↔</span>
        <div className="flex items-center gap-3 flex-1 justify-end">
          <span className="font-serif text-cream">{right.label}</span>
          <div className="relative w-14 h-14 overflow-hidden bg-muted shrink-0">
            <AlbumCover
              src={right.album.cover}
              alt={right.album.title}
              title={right.album.title}
              artist={right.album.artist}
              fill
            />
          </div>
        </div>
      </div>
      <p className="font-serif text-cream/70 leading-relaxed italic">{explanation}</p>
    </div>
  )
}

// ============================================
// COMPONENT: Sonic Thread
// ============================================
function SonicThread({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h4 className="font-serif text-xl text-cream mb-3">{title}</h4>
      <p className="text-cream/70 leading-relaxed">{description}</p>
    </div>
  )
}

// ============================================
// COMPONENT: Emotional Dimension
// ============================================
function EmotionalDimension({ 
  left, 
  right, 
  value, 
  description 
}: { 
  left: string
  right: string
  value: number
  description: string 
}) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-3">
        <span className={value < 50 ? 'text-cream' : 'text-muted-foreground'}>{left}</span>
        <span className={value >= 50 ? 'text-cream' : 'text-muted-foreground'}>{right}</span>
      </div>
      <div className="relative h-1 bg-muted/30 rounded-full mb-3">
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-tobacco rounded-full shadow-sm shadow-tobacco/30"
          style={{ left: `calc(${value}% - 6px)` }}
        />
      </div>
      <p className="text-xs text-cream/50 italic">{description}</p>
    </div>
  )
}

// ============================================
// COMPONENT: Evolution Moment
// ============================================
function EvolutionMoment({ 
  period, 
  archetype,
  insight, 
  isRecent,
  isLast 
}: { 
  period: string
  archetype: string
  insight: string
  isRecent?: boolean
  isLast?: boolean 
}) {
  return (
    <div className={`relative ${isLast ? '' : 'pb-12'}`}>
      <div className={`absolute -left-[33px] top-1 w-2.5 h-2.5 rounded-full border-2 ${isRecent ? 'bg-burgundy border-burgundy' : 'bg-background border-tobacco'}`} />
      <p className="text-xs text-tobacco uppercase tracking-wider mb-1">{period}</p>
      <p className="font-serif text-lg text-cream mb-2">{archetype}</p>
      <p className="text-cream/70 leading-relaxed">{insight}</p>
    </div>
  )
}

// ============================================
// COMPONENT: Club Fit
// ============================================
function ClubFit({ 
  name, 
  reason,
  fit 
}: { 
  name: string
  reason: string
  fit: string 
}) {
  return (
    <Link 
      href={`/clubs/${name.toLowerCase().replace(/\s+/g, '-')}`}
      className="block p-6 border border-border/20 hover:border-burgundy/30 hover:bg-burgundy/5 transition-all duration-500"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <h4 className="font-serif text-xl text-cream">{name}</h4>
        <span className="text-xs text-tobacco uppercase tracking-wider whitespace-nowrap">{fit}</span>
      </div>
      <p className="text-cream/60 leading-relaxed">{reason}</p>
    </Link>
  )
}
