'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AlbumCover } from '@/components/album-cover'
import { type Room, getRelatedRooms, getRoomSeasonalMood, getRoomBySlug } from '@/lib/rooms'
import { joinRoom, leaveRoom } from '@/lib/actions/membership'
import { useAuth } from '@/components/auth-provider'
import { WhyThisRoom } from '@/components/why-this-room'
import { RoomEcologySection } from '@/components/room-ecology-section'

const DEV_MODE = process.env.NODE_ENV === 'development'

interface RoomDetailScreenProps {
  room: Room
  initialIsJoined?: boolean
}

/**
 * Room Detail Screen — Editorial profile / join flow.
 *
 * Discovery surface only. Members of a room should reach the active
 * listening room (/room/[slug]) directly from "Your Rooms" or any other
 * deep-link surface. This page is for non-members and editorial browsing.
 *
 * There is no entry ritual / interstitial. The Enter CTA navigates
 * directly to the active room; the Join CTA joins, then the same CTA
 * becomes the Enter link.
 */
export function RoomDetailScreen({ room, initialIsJoined = false }: RoomDetailScreenProps) {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const [isJoined, setIsJoined] = useState(initialIsJoined)
  const [showFullNote, setShowFullNote] = useState(false)
  const [showManifesto, setShowManifesto] = useState(false)
  const [showCuratorProfile, setShowCuratorProfile] = useState(false)
  const [membershipError, setMembershipError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const seasonalMood = getRoomSeasonalMood(room)
  const relatedRooms = getRelatedRooms(room)

  // Map room aesthetic theme classes to CSS themes
  const themeClassMap: Record<string, string> = {
    'nocturnal-room': 'room-theme-nocturnal',
    'analog-futures': 'room-theme-analog',
    'cathedral-hour': 'room-theme-cathedral',
    'beautiful-damage': 'room-theme-damage',
    'records-rain': 'room-theme-rain',
    'warm-static': 'room-theme-static',
    'spiritual-jazz': 'room-theme-spiritual',
    'criterion-listening': 'room-theme-criterion',
    'pitchfork-deep': 'room-theme-pitchfork',
  }

  const roomTheme = themeClassMap[room.aesthetics.themeClass] || ''
  const typographyClass = `room-typography-${room.aesthetics.typographyStyle}`
  const spacingClass = `room-spacing-${room.aesthetics.spacingRhythm}`

  return (
    <>
      <div
        className={cn(
          "grain relative min-h-screen pb-32 md:pb-16",
          roomTheme,
          typographyClass
        )}
      >
        {/* Room-specific ambient glow */}
        <div className="room-glow fixed inset-0 pointer-events-none" />
        
        {/* ============================================ */}
        {/* BACK NAVIGATION */}
        {/* ============================================ */}
        <div className="px-6 pt-6 md:pt-24 md:px-12 lg:px-24">
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-cream transition-colors"
            style={{ transitionDuration: 'var(--room-transition, 500ms)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span>Back to Clubs</span>
          </button>
        </div>

        {/* ============================================ */}
        {/* ROOM HERO — The Entry Point */}
        {/* ============================================ */}
        <section className={cn("px-6 pt-8 pb-12 md:px-12 lg:px-24", spacingClass)}>
          <div className="max-w-4xl">
            {/* Room type badge */}
            <p 
              className={cn(
                "text-[10px] uppercase tracking-[0.4em] mb-4",
                room.aesthetics.primaryAccent
              )}
            >
              {room.type === 'editorial' ? 'Editorial Room' : 
               room.type === 'genre' ? 'Listening Space' : 
               room.type === 'creator' ? 'Curator-Led' : 'Private Room'}
            </p>
            
            {/* Room name */}
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-cream mb-4 leading-tight">
              {room.name}
            </h1>
            
            {/* Tagline */}
            {room.tagline && (
              <p className={cn(
                "font-serif text-xl md:text-2xl italic mb-6",
                room.aesthetics.primaryAccent
              )}>
                {room.tagline}
              </p>
            )}
            
            {/* Description */}
            <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mb-8">
              {room.description}
            </p>
            
            {/* Atmosphere and stats. Phase 6A.13: member count omitted
                when not backed by a real count — render either the
                count + atmosphere + curator, or atmosphere + curator,
                with separators conditional on what's present. */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className={room.aesthetics.primaryAccent}>
                {room.atmosphere}
              </span>
              {room.memberCountLabel && (
                <>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                  <span>{room.memberCountLabel}</span>
                </>
              )}
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <span>Curated by {room.curator.name}</span>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* WHY THIS ROOM — Phase 6A.8 */}
        {/* ============================================ */}
        {/* Renders the user's room_affinity_scores envelope. Returns */}
        {/* null when there's no affinity for this listener (e.g. */}
        {/* signed-out browsing, listener with no sync yet) so the */}
        {/* section disappears cleanly rather than showing a fallback. */}
        <section
          className={cn(
            'px-6 py-8 md:px-12 lg:px-24 border-t',
            room.aesthetics.borderTint,
          )}
        >
          <div className="max-w-3xl">
            <WhyThisRoom roomSlug={room.slug} variant="section" />
          </div>
        </section>

        {/* ============================================ */}
        {/* ROOM ECOLOGY — Phase 6A.11 */}
        {/* ============================================ */}
        {/* Renders the room's current ecology snapshot + top */}
        {/* adjacent rooms. Hides cleanly when no snapshot exists yet */}
        {/* (forming state) or active_listener_count < threshold. */}
        <RoomEcologySection roomSlug={room.slug} />

        {/* ============================================ */}
        {/* ROOM MANIFESTO — The Philosophy */}
        {/* ============================================ */}
        <section className={cn(
          "px-6 py-12 md:px-12 lg:px-24 border-t",
          room.aesthetics.borderTint
        )}>
          <div className="max-w-3xl">
            <button
              onClick={() => setShowManifesto(!showManifesto)}
              className="flex items-center justify-between w-full group"
            >
              <p className={cn(
                "text-[10px] uppercase tracking-[0.3em]",
                room.aesthetics.primaryAccent
              )}>
                Room Manifesto
              </p>
              <svg 
                className={cn(
                  "w-4 h-4 transition-transform",
                  room.aesthetics.primaryAccent,
                  showManifesto && "rotate-180"
                )} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            
            {showManifesto && (
              <div className="mt-8 animate-fade-in">
                <div className="font-serif text-lg text-cream/80 leading-relaxed space-y-6">
                  {room.culture.manifesto.split('\n\n').map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
                
                {/* What we look for / avoid */}
                <div className="grid md:grid-cols-2 gap-8 mt-12 pt-8 border-t border-border/10">
                  <div>
                    <p className="text-xs text-tobacco mb-4">What we look for</p>
                    <ul className="space-y-2">
                      {room.culture.whatWeLookFor.map((item, i) => (
                        <li key={i} className="text-sm text-cream/70 flex items-start gap-2">
                          <span className={cn("mt-1.5 w-1 h-1 rounded-full shrink-0", room.aesthetics.primaryAccent.replace('text-', 'bg-'))} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs text-tobacco mb-4">What we avoid</p>
                    <ul className="space-y-2">
                      {room.culture.whatWeAvoid.map((item, i) => (
                        <li key={i} className="text-sm text-muted-foreground/60 flex items-start gap-2">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground/30 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ============================================ */}
        {/* CURATOR PROFILE — The Voice */}
        {/* ============================================ */}
        <section className={cn(
          "px-6 py-12 md:px-12 lg:px-24 border-t",
          room.aesthetics.borderTint,
          "bg-card/10"
        )}>
          <div className="max-w-3xl">
            <button
              onClick={() => setShowCuratorProfile(!showCuratorProfile)}
              className="flex items-center justify-between w-full group"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
                  room.aesthetics.borderTint.replace('border-', 'bg-').replace('/20', '/10'),
                  "border",
                  room.aesthetics.borderTint
                )}>
                  <span className="text-lg text-cream font-serif">
                    {room.curator.name[0]}
                  </span>
                </div>
                <div className="text-left">
                  <p className="text-sm text-cream">{room.curator.name}</p>
                  <p className="text-xs text-muted-foreground">{room.curator.role}</p>
                </div>
              </div>
              <svg 
                className={cn(
                  "w-4 h-4 transition-transform",
                  "text-muted-foreground",
                  showCuratorProfile && "rotate-180"
                )} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            
            {showCuratorProfile && (
              <div className="mt-8 animate-fade-in space-y-8">
                {/* Listening philosophy */}
                <div>
                  <p className="text-xs text-tobacco mb-3">Listening Philosophy</p>
                  <p className="font-serif text-lg text-cream/80 italic">
                    &ldquo;{room.curator.listeningPhilosophy}&rdquo;
                  </p>
                </div>
                
                {/* Curator statement */}
                <div>
                  <p className="text-xs text-tobacco mb-3">Curatorial Statement</p>
                  <p className="text-muted-foreground leading-relaxed">
                    {room.curator.curatorStatement}
                  </p>
                </div>
                
                {/* Current obsessions */}
                <div>
                  <p className="text-xs text-tobacco mb-3">Current Obsessions</p>
                  <div className="flex flex-wrap gap-2">
                    {room.curator.currentObsessions.map((obsession, i) => (
                      <span 
                        key={i}
                        className={cn(
                          "text-xs px-2 py-1 border rounded-full",
                          room.aesthetics.borderTint,
                          room.aesthetics.primaryAccent
                        )}
                      >
                        {obsession}
                      </span>
                    ))}
                  </div>
                </div>
                
                {/* Recurring themes */}
                <div>
                  <p className="text-xs text-tobacco mb-3">Recurring Themes</p>
                  <ul className="space-y-1">
                    {room.curator.recurringThemes.map((theme, i) => (
                      <li key={i} className="text-sm text-cream/60">{theme}</li>
                    ))}
                  </ul>
                </div>
                
                {/* Credentials */}
                {room.curator.credentials && (
                  <p className="text-xs text-muted-foreground/50 italic">
                    {room.curator.credentials}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ============================================ */}
        {/* CURRENT ALBUM CYCLE */}
        {/* ============================================ */}
        <section className={cn(
          "px-6 py-12 md:px-12 lg:px-24 border-t",
          room.aesthetics.borderTint
        )}>
          <div className="max-w-4xl">
            <div className="flex items-center gap-3 mb-8">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                This Week&apos;s Album
              </p>
              <span className={cn(
                "text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 border rounded-full",
                room.weeklyPhase === 'arrival' ? 'border-olive/50 text-olive' :
                room.weeklyPhase === 'private' ? 'border-burgundy/50 text-burgundy' :
                room.weeklyPhase === 'discussion' ? 'border-tobacco/50 text-tobacco' :
                'border-cream/30 text-cream/70'
              )}>
                {room.phaseDay} · {room.weeklyPhase.replace('-', ' ')}
              </span>
            </div>
            
            <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start">
              {/* Album art */}
              <div className="relative w-full max-w-xs md:w-72 shrink-0">
                <div 
                  className={cn(
                    "absolute inset-0 blur-3xl -z-10",
                    room.aesthetics.primaryAccent.replace('text-', 'bg-').replace('/70', '/10').replace('/80', '/10')
                  )} 
                />
                <AlbumCover
                  src={room.currentAlbum.cover}
                  alt={room.currentAlbum.title}
                  title={room.currentAlbum.title}
                  artist={room.currentAlbum.artist}
                  className="w-full aspect-square shadow-2xl"
                />
              </div>
              
              {/* Album info */}
              <div className="flex-1">
                <h2 className="font-serif text-3xl md:text-4xl text-cream mb-2">
                  {room.currentAlbum.title}
                </h2>
                <p className="text-xl text-muted-foreground mb-4">
                  {room.currentAlbum.artist} · {room.currentAlbum.year}
                </p>
                
                {/* Album description */}
                {room.currentAlbum.description && (
                  <p className="font-serif text-lg text-cream/70 leading-relaxed mb-6">
                    {room.currentAlbum.description}
                  </p>
                )}
                
                {/* Streaming links */}
                <div className="flex flex-wrap gap-3 mb-8">
                  {room.streamingLinks.spotify && (
                    <a 
                      href={room.streamingLinks.spotify}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "px-4 py-2 border text-sm text-cream/70 transition-all",
                        room.aesthetics.borderTint,
                        "hover:border-[#1DB954] hover:text-[#1DB954]"
                      )}
                      style={{ transitionDuration: 'var(--room-transition, 500ms)' }}
                    >
                      Spotify
                    </a>
                  )}
                  {room.streamingLinks.appleMusic && (
                    <a 
                      href={room.streamingLinks.appleMusic}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "px-4 py-2 border text-sm text-cream/70 transition-all",
                        room.aesthetics.borderTint,
                        "hover:border-[#fc3c44] hover:text-[#fc3c44]"
                      )}
                      style={{ transitionDuration: 'var(--room-transition, 500ms)' }}
                    >
                      Apple Music
                    </a>
                  )}
                  {room.streamingLinks.tidal && (
                    <a 
                      href={room.streamingLinks.tidal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "px-4 py-2 border text-sm text-cream/70 transition-all",
                        room.aesthetics.borderTint,
                        "hover:border-cream hover:text-cream"
                      )}
                      style={{ transitionDuration: 'var(--room-transition, 500ms)' }}
                    >
                      TIDAL
                    </a>
                  )}
                </div>
                
                {/* Phase 6B.2: removed the "Enter Listening Room"
                    CTA. The user is already on the canonical room
                    page; the ritual context panel below renders the
                    active cycle inline. There is no separate
                    listening-room destination anymore. */}
              </div>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* CURATOR'S NOTE */}
        {/* ============================================ */}
        <section className={cn(
          "px-6 py-12 md:px-12 lg:px-24 border-t",
          room.aesthetics.borderTint,
          "bg-card/20"
        )}>
          <div className="max-w-3xl">
            <p className={cn(
              "text-[10px] uppercase tracking-[0.3em] mb-2",
              room.aesthetics.primaryAccent
            )}>
              Curator&apos;s Note
            </p>
            <p className="text-xs text-muted-foreground/60 mb-6">
              {room.curator.name}
            </p>
            
            <h3 className="font-serif text-2xl md:text-3xl text-cream mb-6">
              {room.curatorNote.title}
            </h3>
            
            <div className="font-serif text-lg text-cream/80 leading-relaxed">
              {showFullNote ? (
                <div className="space-y-4">
                  {room.curatorNote.fullText.split('\n\n').map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <p>{room.curatorNote.excerpt}</p>
              )}
            </div>
            
            <button
              onClick={() => setShowFullNote(!showFullNote)}
              className={cn(
                "mt-6 text-sm transition-colors",
                room.aesthetics.primaryAccent,
                "hover:opacity-80"
              )}
            >
              {showFullNote ? 'Show less' : 'Read full note'}
            </button>
          </div>
        </section>

        {/* ============================================ */}
        {/* LISTENING PROMPTS */}
        {/* ============================================ */}
        <section className={cn(
          "px-6 py-12 md:px-12 lg:px-24 border-t",
          room.aesthetics.borderTint
        )}>
          <div className="max-w-3xl">
            <p className={cn(
              "text-[10px] uppercase tracking-[0.3em] mb-8",
              room.aesthetics.primaryAccent
            )}>
              This Week&apos;s Prompts
            </p>
            
            <div className={cn("space-y-8", spacingClass)}>
              {room.prompts.map((prompt, i) => (
                <div key={i} className="group">
                  <div className="flex items-start gap-4">
                    <span className={cn(
                      "font-serif text-lg",
                      room.aesthetics.primaryAccent
                    )}>
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-serif text-xl text-cream/90 leading-relaxed mb-2">
                        {prompt.question}
                      </p>
                      <p className="text-sm text-muted-foreground/50 italic">
                        {prompt.hint}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* LISTENING RITUAL */}
        {/* ============================================ */}
        <section className={cn(
          "px-6 py-12 md:px-12 lg:px-24 border-t",
          room.aesthetics.borderTint
        )}>
          <div className="max-w-3xl">
            <p className={cn(
              "text-[10px] uppercase tracking-[0.3em] mb-6",
              room.aesthetics.primaryAccent
            )}>
              How We Listen Here
            </p>
            
            <p className="font-serif text-lg text-cream/70 leading-relaxed mb-8">
              {room.culture.listeningRitual}
            </p>
            
            {/* Seasonal mood */}
            <div className={cn(
              "p-6 border",
              room.aesthetics.borderTint,
              "bg-card/10"
            )}>
              <p className="text-xs text-tobacco mb-2">Current Season</p>
              <p className="text-sm text-cream/80 leading-relaxed mb-2">
                {seasonalMood.description}
              </p>
              <p className={cn("text-xs", room.aesthetics.primaryAccent)}>
                {seasonalMood.moodShift}
              </p>
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* ASSOCIATED ARCHETYPES */}
        {/* ============================================ */}
        {room.culture.associatedArchetypes.length > 0 && (
          <section className={cn(
            "px-6 py-12 md:px-12 lg:px-24 border-t",
            room.aesthetics.borderTint
          )}>
            <div className="max-w-3xl">
              <p className={cn(
                "text-[10px] uppercase tracking-[0.3em] mb-8",
                room.aesthetics.primaryAccent
              )}>
                This Room Speaks To
              </p>
              
              <div className="space-y-4">
                {room.culture.associatedArchetypes.map((archetype, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      room.aesthetics.borderTint.replace('border-', 'bg-').replace('/20', '/10'),
                      "border",
                      room.aesthetics.borderTint
                    )}>
                      <span className={cn("text-xs", room.aesthetics.primaryAccent)}>
                        {archetype.name[0]}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm text-cream mb-1">{archetype.name}</p>
                      <p className="text-xs text-muted-foreground">{archetype.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ============================================ */}
        {/* ROOM ATMOSPHERE */}
        {/* ============================================ */}
        <section className={cn(
          "px-6 py-12 md:px-12 lg:px-24 border-t",
          room.aesthetics.borderTint
        )}>
          <div className="max-w-4xl">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-8">
              Room Atmosphere
            </p>
            
            <div className="grid md:grid-cols-3 gap-8">
              {/* Emotional tags */}
              <div>
                <p className="text-xs text-tobacco mb-3">Emotional Texture</p>
                <div className="flex flex-wrap gap-2">
                  {room.emotionalTags.map((tag) => (
                    <span 
                      key={tag}
                      className={cn(
                        "text-sm border-b pb-0.5",
                        room.aesthetics.primaryAccent,
                        room.aesthetics.borderTint.replace('border-', 'border-b-')
                      )}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Sonic tags */}
              <div>
                <p className="text-xs text-tobacco mb-3">Sonic Character</p>
                <div className="flex flex-wrap gap-2">
                  {room.sonicTags.map((tag) => (
                    <span 
                      key={tag}
                      className="text-sm text-cream/60 border-b border-cream/20 pb-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Atmosphere notes. Phase 6A.13: hide the whole section
                  when there are no real notes — the prior strings were
                  hardcoded fictional observations of activity. */}
              {room.atmosphereNotes.length > 0 && (
                <div>
                  <p className="text-xs text-tobacco mb-3">This Room</p>
                  <div className="space-y-1.5">
                    {room.atmosphereNotes.map((note, i) => (
                      <p key={i} className="text-sm text-cream/60">{note}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ============================================ */}
        {/* PAST CYCLES */}
        {/* ============================================ */}
        {room.pastCycles.length > 0 && (
          <section className={cn(
            "px-6 py-12 md:px-12 lg:px-24 border-t",
            room.aesthetics.borderTint,
            "bg-navy/10"
          )}>
            <div className="max-w-4xl">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-8">
                Past Cycles
              </p>
              
              <div className="space-y-6">
                {room.pastCycles.map((cycle) => (
                  <div 
                    key={cycle.id}
                    className={cn(
                      "flex gap-4 p-4 border bg-background/50 transition-all cursor-pointer",
                      room.aesthetics.borderTint,
                      "hover:border-border/40"
                    )}
                    style={{ transitionDuration: 'var(--room-transition, 500ms)' }}
                  >
                    <AlbumCover
                      src={cycle.album.cover}
                      alt={cycle.album.title}
                      title={cycle.album.title}
                      artist={cycle.album.artist}
                      className="w-20 h-20 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-tobacco mb-1">{cycle.dateRange}</p>
                      <h4 className="font-serif text-lg text-cream truncate">
                        {cycle.album.title}
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        {cycle.album.artist}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {cycle.highlights.slice(0, 2).map((highlight, i) => (
                          <span key={i} className="text-xs text-cream/50 italic">
                            &ldquo;{highlight}&rdquo;
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("font-serif", room.aesthetics.primaryAccent)}>
                        {cycle.annotationCount}
                      </p>
                      <p className="text-[10px] text-muted-foreground">annotations</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ============================================ */}
        {/* RELATED ROOMS */}
        {/* ============================================ */}
        {relatedRooms.length > 0 && (
          <section className={cn(
            "px-6 py-12 md:px-12 lg:px-24 border-t",
            room.aesthetics.borderTint
          )}>
            <div className="max-w-4xl">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-8">
                Related Rooms
              </p>
              
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 md:mx-0 md:px-0 scrollbar-hide">
                {relatedRooms.map((related) => (
                  <Link
                    key={related.id}
                    href={`/rooms/${related.slug}`}
                    className={cn(
                      "shrink-0 w-64 p-4 border transition-all",
                      room.aesthetics.borderTint,
                      "hover:border-border/40"
                    )}
                    style={{ transitionDuration: 'var(--room-transition, 500ms)' }}
                  >
                    <p className={cn(
                      "text-[10px] uppercase tracking-[0.3em] mb-2",
                      related.aesthetics.primaryAccent
                    )}>
                      {related.type}
                    </p>
                    <h4 className="font-serif text-lg text-cream mb-2">
                      {related.name}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {related.tagline || related.atmosphere}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ============================================ */}
        {/* JOIN / ENTER CTA */}
        {/* ============================================ */}
        <section className={cn(
          "px-6 py-12 md:px-12 lg:px-24 border-t",
          room.aesthetics.borderTint
        )}>
          <div className="max-w-4xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 className="font-serif text-xl text-cream mb-2">
                {isJoined ? 'You\'re part of this room' : 'Join this room'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isJoined
                  ? 'This week\'s ritual is shown below.'
                  : room.culture.invitationText}
              </p>
            </div>

            <div className="flex flex-col gap-2 items-end">
              <div className="flex gap-4">
                {isJoined ? (
                  // Phase 6B.2: removed the "Enter Listening Room" CTA
                  // — the ritual panel below renders the active cycle
                  // in place. Only the Leave control remains.
                  <button
                    disabled={isPending}
                    onClick={() => {
                      setMembershipError(null)
                      startTransition(async () => {
                        const result = await leaveRoom(room.slug)
                        if (result.success) {
                          setIsJoined(false)
                          router.refresh()
                        } else {
                          setMembershipError(result.error ?? 'Leave failed')
                        }
                      })
                    }}
                    className={cn(
                      'px-6 py-4 border text-muted-foreground text-sm transition-all',
                      room.aesthetics.borderTint,
                      'hover:text-cream hover:border-border/50 disabled:opacity-50',
                    )}
                    style={{ transitionDuration: 'var(--room-transition, 500ms)' }}
                  >
                    {isPending ? 'Leaving…' : 'Leave'}
                  </button>
                ) : isAuthenticated ? (
                  <button
                    disabled={isPending}
                    onClick={() => {
                      setMembershipError(null)
                      startTransition(async () => {
                        const result = await joinRoom(room.slug)
                        if (result.success) {
                          setIsJoined(true)
                          router.refresh()
                        } else {
                          setMembershipError(result.error ?? 'Join failed')
                        }
                      })
                    }}
                    className={cn(
                      "px-8 py-4 text-cream text-sm tracking-wide transition-all",
                      room.aesthetics.primaryAccent.replace('text-', 'bg-').replace('/70', '/80').replace('/80', '/90'),
                      "hover:opacity-90 disabled:opacity-50"
                    )}
                    style={{ transitionDuration: 'var(--room-transition, 500ms)' }}
                  >
                    {isPending ? 'Joining…' : 'Join Room'}
                  </button>
                ) : (
                  <Link
                    href="/onboarding"
                    className={cn(
                      "px-8 py-4 text-cream text-sm tracking-wide transition-all",
                      "border",
                      room.aesthetics.borderTint,
                      "hover:bg-card/20"
                    )}
                    style={{ transitionDuration: 'var(--room-transition, 500ms)' }}
                  >
                    Sign in to join
                  </Link>
                )}
              </div>

              {/* Dev-only: surface action errors so auth/DB issues are visible */}
              {DEV_MODE && membershipError && (
                <p className="text-[10px] text-red-400/80 font-mono max-w-xs text-right">
                  ⚠ {membershipError}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
