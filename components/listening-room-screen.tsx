'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Textarea } from '@/components/ui/textarea'
import { AlbumCover } from '@/components/album-cover'
import { ALBUMS } from '@/lib/albums'
import { getCurrentPhase, CURRENT_PROMPTS, CURATORS_NOTE, type PhaseInfo } from '@/lib/weekly-cadence'
import { cn } from '@/lib/utils'
import { createMoment } from '@/lib/actions/moments'
import { useAuth } from '@/components/auth-provider'

const ALBUM = ALBUMS.forEmma

// Tracklist for the album
const TRACKLIST = [
  { number: 1, title: "Flume", duration: "3:39" },
  { number: 2, title: "Lump Sum", duration: "3:21" },
  { number: 3, title: "Skinny Love", duration: "3:58" },
  { number: 4, title: "The Wolves (Act I and II)", duration: "5:22" },
  { number: 5, title: "Blindsided", duration: "5:29" },
  { number: 6, title: "Creature Fear", duration: "3:06" },
  { number: 7, title: "Team", duration: "1:57" },
  { number: 8, title: "For Emma", duration: "3:41" },
  { number: 9, title: "Re: Stacks", duration: "6:41" },
]

// Phase 6A.13: hardcoded ANNOTATIONS, ROOM_ATMOSPHERE, and SAVED_MOMENTS
// arrays were removed. They previously fabricated member names + invented
// quotes + invented save counts, presenting them as emergent community
// activity. Until those surfaces read from the real moments table, the
// component renders honest empty states. Real values will hydrate the
// same component shape once a presence / moments backend exists.
type Annotation = {
  id: number
  timestamp: string
  track: string
  trackNumber: number
  content: string
  author: string
  emotion: string | null
  isPrivate: boolean
}
const ANNOTATIONS: Annotation[] = []

const ROOM_ATMOSPHERE: {
  dominantEmotions: string[]
  sonicTextures: string[]
  recurringThemes: string[]
  annotationClusters: Array<{ track: string; count: number; peak: string }>
} = {
  dominantEmotions: [],
  sonicTextures: [],
  recurringThemes: [],
  annotationClusters: [],
}

const SAVED_MOMENTS: Array<{
  timestamp: string
  track: string
  note: string
  savedBy: number
}> = []

export function ListeningRoomScreen() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const [isPending, startTransition] = useTransition()
  const [annotation, setAnnotation] = useState('')
  const [phase, setPhase] = useState<PhaseInfo | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null)
  const [timestamp, setTimestamp] = useState('')
  const [isLateNight, setIsLateNight] = useState(false)
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null)
  const [markingTrack, setMarkingTrack] = useState<number | null>(null)
  const [markSuccess, setMarkSuccess] = useState<number | null>(null)
  const [markError, setMarkError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    setPhase(getCurrentPhase())
    const hour = new Date().getHours()
    setIsLateNight(hour >= 23 || hour < 5)
  }, [])

  const isPrivatePhase = phase?.isPrivate ?? true

  const handleMarkTrack = (trackNumber: number, trackTitle: string) => {
    if (!isAuthenticated) { setMarkError('Sign in to mark moments'); return }
    setMarkingTrack(trackNumber)
    setMarkError('')
    const localTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    startTransition(async () => {
      const result = await createMoment({
        type: 'mark',
        albumId: ALBUM.id,
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

  const handleSaveAnnotation = () => {
    if (!annotation.trim()) return
    if (!isAuthenticated) { setSaveStatus('error'); setSaveError('Sign in to save annotations'); return }
    setSaveStatus('idle')
    setSaveError('')
    const localTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    const trackContext = selectedTrack ? TRACKLIST.find(t => t.number === selectedTrack) : null
    startTransition(async () => {
      const result = await createMoment({
        type: 'annotation',
        albumId: ALBUM.id,
        content: annotation.trim(),
        trackId: trackContext ? String(trackContext.number) : null,
        visibility: 'private',
        createdLocalTime: localTime,
      })
      if (result.success) {
        setSaveStatus('success')
        setAnnotation('')
        setTimestamp('')
        setSelectedTrack(null)
        setSelectedEmotion(null)
        router.refresh()
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        setSaveStatus('error')
        setSaveError(result.error ?? 'Could not save annotation')
      }
    })
  }
  const showDiscussion = phase?.phase === 'discussion' || phase?.phase === 'curators-note' || phase?.phase === 'identity-update'
  const showCuratorsNote = phase?.phase === 'curators-note' || phase?.phase === 'identity-update'

  return (
    <div className={cn(
      "grain relative pb-24 md:pb-0 md:pt-16 min-h-screen",
      isLateNight && "after-midnight"
    )}>
      
      {/* ============================================ */}
      {/* THE ALBUM - Gravitational Center */}
      {/* ============================================ */}
      <section className="relative">
        {/* Atmospheric background */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-navy/20 pointer-events-none" />
        
        <div className="relative px-6 pt-12 pb-8 md:px-12 lg:px-24">
          <div className="max-w-4xl mx-auto">
            
            {/* Phase indicator - subtle */}
            {phase && (
              <div className="flex items-center gap-3 mb-8 animate-fade-in">
                <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {phase.day}
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-[10px] uppercase tracking-[0.3em] text-tobacco">
                  {phase.title}
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
            )}
            
            {/* Album - Large, cinematic, centered */}
            <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center md:items-start">
              <div className="relative w-64 h-64 md:w-80 md:h-80 shrink-0 animate-fade-in">
                <div className="absolute inset-0 bg-burgundy/10 blur-3xl -z-10" />
                <AlbumCover
                  src={ALBUM.cover}
                  alt={ALBUM.title}
                  title={ALBUM.title}
                  artist={ALBUM.artist}
                  fill
                  className="shadow-2xl"
                />
              </div>
              
              <div className="flex-1 text-center md:text-left animate-fade-in-up">
                <p className="text-xs uppercase tracking-[0.3em] text-tobacco mb-3">
                  This Week&apos;s Album
                </p>
                <h1 className="font-serif text-4xl md:text-5xl text-cream mb-3 tracking-tight">
                  {ALBUM.title}
                </h1>
                <p className="text-xl text-muted-foreground mb-6">
                  {ALBUM.artist} · {ALBUM.year}
                </p>
                
                {/* Album description - editorial */}
                <p className="font-serif text-lg text-cream/70 leading-relaxed max-w-md mb-8">
                  {ALBUM.description}
                </p>
                
                {/* Streaming links - elegant, secondary */}
                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  <StreamingPill href={ALBUM.spotifyUrl} label="Spotify" />
                  <StreamingPill href={ALBUM.appleMusicUrl} label="Apple Music" />
                  <StreamingPill href={ALBUM.tidalUrl} label="TIDAL" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* ROOM ATMOSPHERE - Ambient observation */}
      {/* ============================================ */}
      {/* Phase 6A.13: "The Room Tonight" is a real-data surface. While
          the underlying ROOM_ATMOSPHERE constant is empty (no real
          moments backend yet), the section stays mounted but each
          sub-column hides itself. Once real data flows in, the
          rendering shape is unchanged — only the constant gets a
          live source. */}
      {(ROOM_ATMOSPHERE.dominantEmotions.length > 0 ||
        ROOM_ATMOSPHERE.sonicTextures.length > 0 ||
        ROOM_ATMOSPHERE.annotationClusters.length > 0) && (
        <section className="px-6 py-12 md:px-12 lg:px-24 border-t border-border/10">
          <div className="max-w-4xl mx-auto">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-6">
              The Room Tonight
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              {ROOM_ATMOSPHERE.dominantEmotions.length > 0 && (
                <div>
                  <p className="text-xs text-tobacco mb-3">Emotional Texture</p>
                  <div className="flex flex-wrap gap-2">
                    {ROOM_ATMOSPHERE.dominantEmotions.map((emotion) => (
                      <span
                        key={emotion}
                        className="text-sm text-cream/60 border-b border-cream/20 pb-0.5"
                      >
                        {emotion}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {ROOM_ATMOSPHERE.sonicTextures.length > 0 && (
                <div>
                  <p className="text-xs text-tobacco mb-3">Sonic Observations</p>
                  <div className="flex flex-wrap gap-2">
                    {ROOM_ATMOSPHERE.sonicTextures.map((texture) => (
                      <span
                        key={texture}
                        className="text-sm text-cream/60 border-b border-cream/20 pb-0.5"
                      >
                        {texture}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {ROOM_ATMOSPHERE.annotationClusters.length > 0 && (
                <div>
                  <p className="text-xs text-tobacco mb-3">Annotation Clusters</p>
                  <div className="space-y-1.5">
                    {ROOM_ATMOSPHERE.annotationClusters.slice(0, 3).map((cluster) => (
                      <div key={cluster.track} className="flex items-center gap-2 text-sm">
                        <span className="text-cream/60">{cluster.track}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-muted-foreground text-xs">{cluster.peak}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ============================================ */}
      {/* TRACKLIST WITH MOMENTS */}
      {/* ============================================ */}
      <section className="px-6 py-12 md:px-12 lg:px-24 border-t border-border/10 bg-navy/10">
        <div className="max-w-4xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-8">
            Save a Moment
          </p>
          
          <div className="space-y-1">
            {TRACKLIST.map((track) => {
              const moments = SAVED_MOMENTS.filter(m => m.track === track.title)
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
                  
                  {/* Expanded: show moments and add option */}
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
                        disabled={markingTrack === track.number || isPending}
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
      {/* ANNOTATION SPACE - The literary margin */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-3xl mx-auto">
          
          {/* Writing area */}
          <div className="mb-16">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-8">
              {isPrivatePhase ? 'Your Notebook' : 'Leave a Note'}
            </p>
            
            {/* Timestamp selector */}
            <div className="flex items-center gap-4 mb-6">
              <button 
                onClick={() => setTimestamp(timestamp ? '' : '2:47')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm border transition-all duration-300",
                  timestamp 
                    ? "border-tobacco/50 bg-tobacco/10 text-tobacco" 
                    : "border-border/30 text-muted-foreground hover:border-tobacco/30 hover:text-tobacco/70"
                )}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {timestamp || 'Add timestamp'}
              </button>
              
              {timestamp && (
                <select 
                  className="bg-transparent border border-border/30 text-sm text-cream/70 px-3 py-2 focus:outline-none focus:border-tobacco/50"
                  value={selectedTrack || ''}
                  onChange={(e) => setSelectedTrack(Number(e.target.value))}
                >
                  <option value="">Select track</option>
                  {TRACKLIST.map((track) => (
                    <option key={track.number} value={track.number}>
                      {track.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            {/* Annotation textarea - literary feel */}
            <div className="relative">
              <Textarea
                value={annotation}
                onChange={(e) => setAnnotation(e.target.value)}
                placeholder="What are you hearing? A moment, a texture, a feeling that stays..."
                maxLength={8000}
                className="bg-transparent border-0 border-b border-border/20 rounded-none resize-none min-h-[120px] text-cream placeholder:text-muted-foreground/30 focus-visible:ring-0 focus-visible:border-tobacco/40 text-lg font-serif leading-relaxed px-0"
              />
              {annotation.length >= 7000 && (
                <p className={cn(
                  'text-[10px] font-mono mt-1 text-right',
                  annotation.length >= 8000 ? 'text-red-400/80' : 'text-tobacco/60'
                )}>
                  {(8000 - annotation.length).toLocaleString()} characters remaining
                </p>
              )}
              {/* Paper texture effect */}
              <div className="absolute left-0 top-0 bottom-0 w-px bg-burgundy/20" />
            </div>
            
            {/* Emotion markers */}
            <div className="mt-6 flex flex-wrap gap-2">
              {['devastation', 'warmth', 'tension', 'release', 'nostalgia', 'solitude', 'transcendence'].map((emotion) => (
                <button
                  key={emotion}
                  onClick={() => setSelectedEmotion(selectedEmotion === emotion ? null : emotion)}
                  className={cn(
                    "text-xs px-3 py-1.5 border transition-all duration-300",
                    selectedEmotion === emotion
                      ? "border-burgundy/50 bg-burgundy/10 text-burgundy"
                      : "border-border/20 text-muted-foreground/60 hover:border-burgundy/30 hover:text-burgundy/70"
                  )}
                >
                  {emotion}
                </button>
              ))}
            </div>
            
            {/* Save */}
            <div className="flex items-center justify-between mt-8">
              <p className="text-xs text-muted-foreground/50">
                {isPrivatePhase
                  ? 'Private until Friday'
                  : 'Visible to other listeners'}
              </p>
              {saveStatus === 'success' ? (
                <span className="text-[11px] text-olive tracking-wide">✓ Saved</span>
              ) : (
                <button
                  onClick={handleSaveAnnotation}
                  className="px-8 py-3 bg-tobacco/80 hover:bg-tobacco text-cream text-sm tracking-wide transition-all duration-500 disabled:opacity-30"
                  disabled={annotation.length === 0 || isPending}
                >
                  {isPending ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
            {(saveStatus === 'error' && saveError) && (
              <p className="text-[11px] text-red-400/80 font-mono mt-2">⚠ {saveError}</p>
            )}
            {markError && (
              <p className="text-[11px] text-red-400/80 font-mono mt-2">⚠ {markError}</p>
            )}
          </div>
          
          {/* ============================================ */}
          {/* ANNOTATIONS - The literary margin notes */}
          {/* ============================================ */}
          {/* Phase 6A.13: hidden until real annotations exist. The
              prior fake "From the Room" list with named members
              ("Elena/Marcus/Sofia/James") was removed — empty rooms
              should feel intentionally quiet, not pre-populated. */}
          {ANNOTATIONS.filter(a => !isPrivatePhase || a.isPrivate).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-8">
                {isPrivatePhase ? 'Your Annotations' : 'From the Room'}
              </p>
              <div className="space-y-8">
                {ANNOTATIONS.filter(a => !isPrivatePhase || a.isPrivate).map((note) => (
                  <AnnotationCard key={note.id} annotation={note} showAuthor={!isPrivatePhase} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============================================ */}
      {/* LISTENING PROMPTS - Editorial guidance */}
      {/* ============================================ */}
      <section className="px-6 py-16 md:px-12 lg:px-24 border-t border-border/10 bg-olive/5">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.3em] text-olive/60 mb-8">
            This Week&apos;s Prompts
          </p>
          
          <div className="space-y-6">
            {CURRENT_PROMPTS.map((prompt, i) => (
              <div key={prompt.id} className="group">
                <div className="flex items-start gap-4">
                  <span className="text-olive/40 font-serif text-lg">{i + 1}</span>
                  <div>
                    <p className="font-serif text-xl text-cream/90 leading-relaxed mb-2">
                      {prompt.prompt}
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
      {/* CURATOR'S NOTE - Editorial essay */}
      {/* ============================================ */}
      {showCuratorsNote && (
        <section className="px-6 py-16 md:px-12 lg:px-24 border-t border-border/10">
          <div className="max-w-3xl mx-auto">
            <p className="text-[10px] uppercase tracking-[0.3em] text-tobacco mb-2">
              Curator&apos;s Note
            </p>
            <p className="text-xs text-muted-foreground/50 mb-8">
              {CURATORS_NOTE.readingTime}
            </p>
            
            <article className="prose prose-invert prose-lg max-w-none">
              <h2 className="font-serif text-3xl md:text-4xl text-cream mb-8 leading-tight tracking-tight">
                {CURATORS_NOTE.title}
              </h2>
              
              <p className="font-serif text-xl text-cream/80 leading-relaxed mb-8">
                {CURATORS_NOTE.excerpt}
              </p>
              
              <p className="text-cream/70 leading-relaxed mb-6">
                The mythology has become so central to the record&apos;s reception that it can be difficult to hear the music itself. Vernon, heartbroken and exhausted, retreated to his father&apos;s hunting cabin in northwestern Wisconsin for three months. He emerged with nine songs recorded on basic equipment, songs that would go on to define a particular strain of 21st-century intimacy in music.
              </p>
              
              <p className="text-cream/70 leading-relaxed mb-6">
                But the cabin story, however true, has become a kind of filter that shapes how we hear. We listen for isolation. We listen for healing. We listen for the particular quality of winter light through old windows.
              </p>
              
              {/* Phase 6A.13: removed fabricated "highlighted by 23
                  members this week" attribution. The blockquote stands
                  on its own editorial weight. */}
              <blockquote className="border-l-2 border-burgundy/40 pl-6 my-10">
                <p className="font-serif text-2xl text-cream/90 italic leading-relaxed">
                  &ldquo;Come on skinny love, just last the year&rdquo;
                </p>
              </blockquote>
              
              <p className="text-cream/70 leading-relaxed">
                What strikes me most, listening this week with all of you, is something different: the architecture of emotional accumulation. These songs don&apos;t assault you with feeling. They build it, layer by layer, until suddenly you realize you&apos;re inside something larger than any single moment.
              </p>
            </article>
          </div>
        </section>
      )}

      {/* ============================================ */}
      {/* LATE NIGHT MODE - After midnight atmosphere */}
      {/* ============================================ */}
      {isLateNight && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <div className="absolute inset-0 bg-navy/20 mix-blend-multiply" />
        </div>
      )}
    </div>
  )
}

// ============================================
// COMPONENTS
// ============================================

function StreamingPill({ href, label }: { href?: string; label: string }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-muted-foreground/60 border border-border/20 px-4 py-2 hover:border-cream/30 hover:text-cream/70 transition-all duration-500"
    >
      {label}
    </a>
  )
}

function AnnotationCard({ 
  annotation, 
  showAuthor 
}: { 
  annotation: typeof ANNOTATIONS[0]
  showAuthor: boolean 
}) {
  return (
    <div className="group relative pl-6 border-l border-border/20 hover:border-tobacco/30 transition-colors duration-500">
      {/* Timestamp marker */}
      {annotation.timestamp && (
        <div className="absolute -left-px top-0 w-px h-4 bg-tobacco" />
      )}
      
      <div className="flex items-center gap-3 mb-3 text-xs">
        {annotation.timestamp && (
          <>
            <span className="font-mono text-tobacco">{annotation.timestamp}</span>
            <span className="text-muted-foreground/30">·</span>
          </>
        )}
        <span className="text-muted-foreground/50">{annotation.track}</span>
        {showAuthor && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-cream/50">{annotation.author}</span>
          </>
        )}
      </div>
      
      <p className="font-serif text-lg text-cream/80 leading-relaxed">
        {annotation.content}
      </p>
      
      {annotation.emotion && (
        <span className="inline-block mt-3 text-xs text-burgundy/60 border-b border-burgundy/20 pb-0.5">
          {annotation.emotion}
        </span>
      )}
    </div>
  )
}
