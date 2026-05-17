'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlbumCover } from '@/components/album-cover'
import { MomentComposer } from '@/components/moment-composer'
import { PresenceStrip } from '@/components/presence-strip'
import { createMoment, type Moment } from '@/lib/actions/moments'
import { cn } from '@/lib/utils'
import { type Room } from '@/lib/rooms'
import type { PresenceSnapshot } from '@/lib/data/presence'
import { cyclePhaseModulationClass } from '@/lib/presence/atmosphere'
import { setLastRoom } from '@/lib/last-room'
import { useRitualPhase, roomToneLine, emptyStateLine } from '@/lib/cadence'

interface ActiveListeningRoomScreenProps {
  room: Room
  initialMoments?: Moment[]
  initialPresenceSnapshot?: PresenceSnapshot
}

// Sample tracklist - would come from album data in production
const SAMPLE_TRACKLIST = [
  { number: 1, title: "Track 1", duration: "4:12" },
  { number: 2, title: "Track 2", duration: "3:45" },
  { number: 3, title: "Track 3", duration: "5:18" },
  { number: 4, title: "Track 4", duration: "4:02" },
  { number: 5, title: "Track 5", duration: "6:33" },
  { number: 6, title: "Track 6", duration: "3:58" },
  { number: 7, title: "Track 7", duration: "4:44" },
  { number: 8, title: "Track 8", duration: "5:21" },
]

// Sample annotations for this room
const SAMPLE_ANNOTATIONS = [
  {
    id: 1,
    timestamp: "2:47",
    track: "Track 3",
    trackNumber: 3,
    content: "There's something in the way this moment opens up—like a door you didn't know was there.",
    author: "Elena",
    emotion: "revelation",
  },
  {
    id: 2,
    timestamp: "0:30",
    track: "Track 1",
    trackNumber: 1,
    content: "The first thirty seconds tell you everything you need to know about what's coming.",
    author: "Marcus",
    emotion: "anticipation",
  },
  {
    id: 3,
    timestamp: "4:18",
    track: "Track 5",
    trackNumber: 5,
    content: "This is where the album stops asking and starts telling.",
    author: "Sofia",
    emotion: "intensity",
  },
]

// Saved moments
const SAMPLE_MOMENTS = [
  { timestamp: "2:47", track: "Track 3", note: "The opening", savedBy: 23 },
  { timestamp: "4:18", track: "Track 5", note: "The shift", savedBy: 18 },
  { timestamp: "0:30", track: "Track 1", note: "First breath", savedBy: 15 },
]

export function ActiveListeningRoomScreen({ room, initialMoments, initialPresenceSnapshot }: ActiveListeningRoomScreenProps) {
  const router = useRouter()
  const [isPendingMark, startMarkTransition] = useTransition()
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null)
  const [isLateNight, setIsLateNight] = useState(false)
  const [markingTrack, setMarkingTrack] = useState<number | null>(null)
  const [markSuccess, setMarkSuccess] = useState<number | null>(null)
  const [markError, setMarkError] = useState('')

  useEffect(() => {
    const hour = new Date().getHours()
    setIsLateNight(hour >= 23 || hour < 5)
  }, [])

  // Remember this room as the user's last-visited active room. Reads in
  // the nav "Listening Room" item to provide a one-tap return path.
  useEffect(() => {
    if (room.slug && room.name) setLastRoom(room.slug, room.name)
  }, [room.slug, room.name])

  const isPrivatePhase = room.weeklyPhase === 'arrival' || room.weeklyPhase === 'private'

  const handleMarkTrack = (trackNumber: number, trackTitle: string) => {
    setMarkingTrack(trackNumber)
    setMarkError('')
    const localTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    startMarkTransition(async () => {
      const result = await createMoment({
        type: 'mark',
        albumId: room.currentAlbum.id,
        content: `Track ${trackNumber}: ${trackTitle}`,
        trackId: String(trackNumber),
        visibility: 'private',
        createdLocalTime: localTime,
      })
      setMarkingTrack(null)
      if (result.success) {
        setMarkSuccess(trackNumber)
        router.refresh()
        setTimeout(() => setMarkSuccess(null), 3000)
      } else {
        setMarkError(result.error ?? 'Could not save mark')
        setTimeout(() => setMarkError(''), 4000)
      }
    })
  }

  const phaseModulation = cyclePhaseModulationClass(room.weeklyPhase)
  const ritualPhase = useRitualPhase()

  return (
    <div className={cn(
      "grain relative pb-24 md:pb-0 min-h-screen",
      isLateNight && "after-midnight",
      phaseModulation,
      ritualPhase?.atmosphereClass,
    )}>
      
      {/* ============================================ */}
      {/* ROOM HEADER */}
      {/* ============================================ */}
      {/* Back navigation: always to /rooms (the discovery surface), never
          to the editorial /rooms/[slug] profile. After the room-flow
          simplification, the active room is the canonical room — the
          profile page is only a discovery / join surface for non-members
          and is no longer the conceptual parent of the active room. */}
      <div className="px-6 pt-6 md:pt-20 md:px-12 lg:px-24">
        <Link
          href="/rooms"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-cream transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          <span>Back to Rooms</span>
        </Link>
      </div>

      {/* ============================================ */}
      {/* THE ALBUM - Gravitational Center */}
      {/* ============================================ */}
      <section className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-navy/20 pointer-events-none" />
        
        <div className="relative px-6 pt-8 pb-8 md:px-12 lg:px-24">
          <div className="max-w-4xl mx-auto">
            
            {/* Phase indicator — cycle phase (room-side) + ritual tone (listener-side).
                Cycle phase tells you what content the room has opened this week;
                the ritual line tells you what today is asking of you as a listener.
                Both are present, neither performative. */}
            <div className="mb-8 animate-fade-in">
              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {room.phaseDay}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-[10px] uppercase tracking-[0.3em] text-tobacco">
                  {room.weeklyPhase.replace('-', ' ')}
                </span>
                {isPrivatePhase && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-olive/80">
                      Private
                    </span>
                  </>
                )}
              </div>
              {ritualPhase && (
                <p className="text-sm text-muted-foreground/45 italic mt-3 max-w-md leading-relaxed">
                  {roomToneLine(ritualPhase.phase)}
                </p>
              )}
            </div>
            
            {/* Album presentation */}
            <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center md:items-start">
              <div className="relative w-64 h-64 md:w-80 md:h-80 shrink-0 animate-fade-in">
                <div className="absolute inset-0 bg-burgundy/10 blur-3xl -z-10" />
                <AlbumCover
                  src={room.currentAlbum.cover}
                  alt={room.currentAlbum.title}
                  title={room.currentAlbum.title}
                  artist={room.currentAlbum.artist}
                  fill
                  className="shadow-2xl"
                />
              </div>
              
              <div className="flex-1 text-center md:text-left animate-fade-in-up">
                <p className="text-xs uppercase tracking-[0.3em] text-tobacco mb-3">
                  {room.name}
                </p>
                <h1 className="font-serif text-4xl md:text-5xl text-cream mb-3 tracking-tight">
                  {room.currentAlbum.title}
                </h1>
                <p className="text-xl text-muted-foreground mb-4">
                  {room.currentAlbum.artist} · {room.currentAlbum.year}
                </p>

                {/* Presence strip — tier control always visible when cycleId exists */}
                {room.cycleId && (
                  <div className="flex justify-center md:justify-start mb-6">
                    <PresenceStrip
                      cycleId={room.cycleId}
                      roomSlug={room.slug}
                      initialSnapshot={initialPresenceSnapshot ?? { presenceCount: 0, faces: [] }}
                    />
                  </div>
                )}

                {room.currentAlbum.description && (
                  <p className="font-serif text-lg text-cream/70 leading-relaxed max-w-md mb-8">
                    {room.currentAlbum.description}
                  </p>
                )}
                
                {/* Streaming links */}
                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  {room.streamingLinks.spotify && (
                    <a 
                      href={room.streamingLinks.spotify}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 border border-border/30 text-sm text-cream/70 hover:border-[#1DB954] hover:text-[#1DB954] transition-all duration-300"
                    >
                      Spotify
                    </a>
                  )}
                  {room.streamingLinks.appleMusic && (
                    <a 
                      href={room.streamingLinks.appleMusic}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 border border-border/30 text-sm text-cream/70 hover:border-[#fc3c44] hover:text-[#fc3c44] transition-all duration-300"
                    >
                      Apple Music
                    </a>
                  )}
                  {room.streamingLinks.tidal && (
                    <a 
                      href={room.streamingLinks.tidal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 border border-border/30 text-sm text-cream/70 hover:border-cream hover:text-cream transition-all duration-300"
                    >
                      TIDAL
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* ROOM ATMOSPHERE */}
      {/* ============================================ */}
      <section className="px-6 py-12 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-4xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-6">
            The Room Tonight
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <p className="text-xs text-tobacco mb-3">Emotional Texture</p>
              <div className="flex flex-wrap gap-2">
                {room.emotionalTags.slice(0, 3).map((tag) => (
                  <span 
                    key={tag}
                    className="text-sm text-cream/60 border-b border-cream/20 pb-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-xs text-tobacco mb-3">Sonic Character</p>
              <div className="flex flex-wrap gap-2">
                {room.sonicTags.slice(0, 3).map((tag) => (
                  <span 
                    key={tag}
                    className="text-sm text-cream/60 border-b border-cream/20 pb-0.5"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-xs text-tobacco mb-3">Room Activity</p>
              <div className="space-y-1.5">
                {room.atmosphereNotes.slice(0, 2).map((note, i) => (
                  <p key={i} className="text-sm text-cream/60">{note}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* TRACKLIST WITH MOMENTS */}
      {/* ============================================ */}
      <section className="px-6 py-12 md:px-12 lg:px-24 border-t border-border/10 bg-navy/10">
        <div className="max-w-4xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-8">
            Save a Moment
          </p>
          
          <div className="space-y-1">
            {SAMPLE_TRACKLIST.map((track) => {
              const moments = SAMPLE_MOMENTS.filter(m => m.track === track.title)
              const isSelected = selectedTrack === track.number
              
              return (
                <div
                  key={track.number}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedTrack(isSelected ? null : track.number)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedTrack(isSelected ? null : track.number)}
                  className={cn(
                    "w-full text-left p-4 transition-all duration-500 border border-transparent cursor-pointer",
                    isSelected
                      ? "bg-card/50 border-border/30"
                      : "hover:bg-card/20"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground/40 w-6 font-mono">
                      {track.number}
                    </span>
                    <span className={cn(
                      "flex-1 transition-colors",
                      isSelected ? "text-cream" : "text-cream/70"
                    )}>
                      {track.title}
                    </span>
                    <span className="text-sm text-muted-foreground/40 font-mono">
                      {track.duration}
                    </span>
                    {moments.length > 0 && (
                      <span className="text-xs text-tobacco">
                        {moments.length} moment{moments.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  
                  {isSelected && (
                    <div className="mt-4 pl-10 space-y-3 animate-fade-in">
                      {moments.map((moment, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <span className="text-tobacco font-mono">{moment.timestamp}</span>
                          <span className="text-cream/60">{moment.note}</span>
                          <span className="text-muted-foreground/40 text-xs">
                            {moment.savedBy} saved
                          </span>
                        </div>
                      ))}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMarkTrack(track.number, track.title) }}
                        disabled={markingTrack === track.number || isPendingMark}
                        className="flex items-center gap-2 text-olive/80 hover:text-olive text-sm transition-colors disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        <span>
                          {markSuccess === track.number ? '✓ Marked' : markingTrack === track.number ? 'Marking…' : 'Mark a moment'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* ANNOTATION SPACE */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-3xl mx-auto">
          
          <div className="mb-16">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-8">
              {isPrivatePhase ? 'Your Notebook' : 'Capture a Moment'}
            </p>
            <MomentComposer albumId={room.currentAlbum.id} roomSlug={room.slug} />
          </div>
          
          {/* Moments — real DB data when available; sample fallback when empty */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-8">
              {(initialMoments?.length ?? 0) > 0 ? 'Your Moments' : 'Sample Moments'}
            </p>

            {(initialMoments?.length ?? 0) > 0 ? (
              <div className="space-y-8">
                {initialMoments!.map((moment) => (
                  <div key={moment.id} className="group relative pl-8 border-l border-tobacco/20">
                    <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-tobacco/30" />
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-tobacco/60">
                        {moment.type}
                      </span>
                      {moment.createdLocalTime && (
                        <span className="text-[10px] text-muted-foreground/30 font-mono">
                          {moment.createdLocalTime}
                        </span>
                      )}
                    </div>
                    {moment.content && moment.content !== '✓' && moment.content !== '⭐ saved' && !moment.content.startsWith('Track ') ? (
                      <p className="font-serif text-lg text-cream/80 leading-relaxed">
                        {moment.content}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground/40 italic">
                        {moment.type === 'mark' ? 'Marked' : moment.type === 'save' ? 'Saved to collection' : moment.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground/30 italic mb-10">
                  {ritualPhase
                    ? emptyStateLine('no-moments-active-room', ritualPhase.phase)
                    : 'No marks yet.'}
                  {' '}
                  <span className="text-muted-foreground/20 not-italic">
                    These are examples.
                  </span>
                </p>
                <div className="space-y-8 opacity-30 pointer-events-none select-none">
                  {SAMPLE_ANNOTATIONS.map((note) => (
                    <div key={note.id} className="group relative pl-8 border-l border-burgundy/20">
                      <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-burgundy/40" />
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs text-tobacco font-mono">
                          {note.timestamp} · {note.track}
                        </span>
                        {note.emotion && (
                          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">
                            {note.emotion}
                          </span>
                        )}
                      </div>
                      <p className="font-serif text-lg text-cream/80 leading-relaxed mb-3">
                        {note.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {markError && (
              <p className="text-[10px] text-red-400/70 font-mono mt-4">⚠ {markError}</p>
            )}
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* LISTENING PROMPTS */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 border-t border-border/10 bg-olive/5">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.3em] text-olive/60 mb-8">
            This Week&apos;s Prompts
          </p>
          
          <div className="space-y-6">
            {room.prompts.map((prompt, i) => (
              <div key={i} className="group">
                <div className="flex items-start gap-4">
                  <span className="text-olive/40 font-serif text-lg">{i + 1}</span>
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
      {/* CURATOR'S NOTE PREVIEW */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.3em] text-tobacco mb-2">
            Curator&apos;s Note
          </p>
          <p className="text-xs text-muted-foreground/60 mb-6">
            {room.curator.name}
          </p>
          
          <h3 className="font-serif text-2xl md:text-3xl text-cream mb-6">
            {room.curatorNote.title}
          </h3>
          
          <p className="font-serif text-lg text-cream/80 leading-relaxed">
            {room.curatorNote.excerpt}
          </p>
          
          <Link
            href={`/rooms/${room.slug}`}
            className="inline-flex items-center gap-2 mt-6 text-sm text-tobacco hover:text-cream transition-colors"
          >
            <span>Read full note</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  )
}
