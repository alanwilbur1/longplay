'use client'

import { useState, useRef, useCallback } from 'react'
import { useAuth } from '@/components/auth-provider'
import { AlbumCover } from '@/components/album-cover'
import { ALBUMS, type Album } from '@/lib/albums'
import { cn } from '@/lib/utils'

/**
 * LONGPLAY SHAREABLE ARTIFACT SYSTEM
 * 
 * Beautiful, collectible, premium editorial objects.
 * These are NOT social media cards or Spotify Wrapped clones.
 * 
 * Think:
 * - Criterion Collection inserts
 * - A24 print pieces
 * - Literary magazine spreads
 * - Museum exhibition cards
 * - High-end vinyl packaging
 * 
 * These are the growth mechanism: people share them because
 * they feel deeply personal and aesthetically beautiful.
 */

// ============================================
// EXPORT MODES
// ============================================
export type ExportMode = 
  | 'portrait'      // Standard vertical card
  | 'story'         // Instagram story aspect ratio
  | 'print'         // High-res printable
  | 'wallpaper'     // Phone/desktop wallpaper
  | 'poster'        // Large format poster
  | 'editorial'     // Magazine spread style

// ============================================
// SHARED UTILITIES
// ============================================
function ArtifactWrapper({ 
  children, 
  className,
  onExport 
}: { 
  children: React.ReactNode
  className?: string
  onExport?: () => void 
}) {
  const [exported, setExported] = useState(false)

  const handleExport = () => {
    setExported(true)
    onExport?.()
    setTimeout(() => setExported(false), 2500)
  }

  return (
    <div className={cn("relative", className)}>
      {children}
      <button
        onClick={handleExport}
        className="mt-6 w-full py-4 border border-cream/15 text-cream/60 text-xs uppercase tracking-[0.3em] hover:bg-cream/5 hover:border-cream/25 hover:text-cream/80 transition-all duration-500"
      >
        {exported ? 'Preserved' : 'Export artifact'}
      </button>
    </div>
  )
}

function LongPlayBrand({ variant = 'default' }: { variant?: 'default' | 'minimal' | 'full' }) {
  if (variant === 'minimal') {
    return <span className="text-[8px] uppercase tracking-[0.6em] text-tobacco/80">LP</span>
  }
  if (variant === 'full') {
    return (
      <div>
        <p className="text-[9px] uppercase tracking-[0.5em] text-tobacco font-medium">LongPlay</p>
        <p className="text-[7px] uppercase tracking-[0.4em] text-muted-foreground mt-0.5">A Listening Club</p>
      </div>
    )
  }
  return <p className="text-[9px] uppercase tracking-[0.5em] text-tobacco font-medium">LongPlay</p>
}

// ============================================
// 1. ARCHETYPE CARD — The signature artifact
// ============================================
interface ArchetypeCardProps {
  archetype: string
  tagline: string
  userName: string
  year?: string
  emotionalTendencies?: string[]
  sonicTendencies?: string[]
  associatedAlbums?: Album[]
  mode?: ExportMode
}

export function ArchetypeCard({ 
  archetype, 
  tagline, 
  userName, 
  year = '2026',
  emotionalTendencies = ['Late-night listener', 'Atmosphere-first', 'Patient builds'],
  sonicTendencies = ['Analog warmth', 'Restrained vocals', 'Winter aesthetics'],
  associatedAlbums = [ALBUMS.forEmma, ALBUMS.pinkMoon, ALBUMS.spiritOfEden],
  mode = 'portrait'
}: ArchetypeCardProps) {
  const aspectClass = mode === 'story' ? 'aspect-[9/16]' : mode === 'wallpaper' ? 'aspect-[9/19.5]' : 'aspect-[3/4]'

  return (
    <ArtifactWrapper className="max-w-sm">
      <div className={cn(
        "relative bg-gradient-to-br from-background via-card to-burgundy/8 border border-cream/8 overflow-hidden",
        aspectClass
      )}>
        {/* Subtle grain overlay */}
        <div className="absolute inset-0 opacity-[0.02] bg-[url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjU2IDI1NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZmlsdGVyIGlkPSJub2lzZSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOSIgbnVtT2N0YXZlcz0iNCIgc3RpdGNoVGlsZXM9InN0aXRjaCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNub2lzZSkiLz48L3N2Zz4=')]" />
        
        {/* Content */}
        <div className="relative h-full p-8 flex flex-col justify-between">
          {/* Header */}
          <div>
            <LongPlayBrand />
            <div className="w-12 h-px bg-tobacco/30 mt-2" />
          </div>

          {/* Center - Archetype */}
          <div className="text-center py-8">
            <p className="text-[8px] uppercase tracking-[0.5em] text-muted-foreground mb-6">
              Listening Archetype
            </p>
            <h2 className="font-serif text-4xl md:text-5xl text-cream mb-8 leading-[1.1]">
              {archetype.split(' ').length > 2 ? (
                <>
                  {archetype.split(' ').slice(0, -1).join(' ')}<br />
                  {archetype.split(' ').slice(-1)}
                </>
              ) : archetype}
            </h2>
            <div className="w-16 h-px bg-burgundy/40 mx-auto mb-8" />
            <p className="font-serif text-sm text-cream/60 italic leading-relaxed max-w-[240px] mx-auto">
              &ldquo;{tagline}&rdquo;
            </p>
          </div>

          {/* Tendencies */}
          {mode === 'poster' && (
            <div className="space-y-6 mb-8">
              <div className="flex flex-wrap justify-center gap-2">
                {emotionalTendencies.map((t) => (
                  <span key={t} className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-tobacco border border-tobacco/25">
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex justify-center gap-3">
                {associatedAlbums.slice(0, 3).map((album) => (
                  <div key={album.id} className="w-12 h-12">
                    <AlbumCover src={album.cover} alt={album.title} title={album.title} artist={album.artist} className="w-full h-full" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-[0.5em] text-muted-foreground">
              {userName} / {year}
            </p>
          </div>
        </div>
      </div>
    </ArtifactWrapper>
  )
}

// ============================================
// 2. TASTE PORTRAIT — The most powerful artifact
// ============================================
interface TastePortraitCardProps {
  question?: string
  answer: string
  userName: string
  albums?: Album[]
  mode?: ExportMode
}

export function TastePortraitCard({ 
  question = "What kind of music do you like?",
  answer, 
  userName, 
  albums = [ALBUMS.forEmma, ALBUMS.pinkMoon, ALBUMS.blue, ALBUMS.inRainbows],
  mode = 'portrait'
}: TastePortraitCardProps) {
  return (
    <ArtifactWrapper className="max-w-md">
      <div className={cn(
        "relative bg-gradient-to-b from-background via-background to-burgundy/5 border border-cream/8 p-8 md:p-10 flex flex-col",
        mode === 'story' ? 'aspect-[9/16]' : mode === 'editorial' ? 'aspect-[4/3]' : 'aspect-[4/5]'
      )}>
        {/* Header */}
        <div className="mb-8">
          <p className="text-[8px] uppercase tracking-[0.4em] text-muted-foreground mb-2">
            {userName} on
          </p>
          <p className="font-serif text-2xl text-cream leading-snug">
            &ldquo;{question}&rdquo;
          </p>
        </div>

        {/* The Answer - Editorial */}
        <div className="flex-1 flex items-center">
          <p className="font-serif text-lg md:text-xl text-cream/85 leading-relaxed italic">
            &ldquo;{answer}&rdquo;
          </p>
        </div>

        {/* Albums */}
        <div className="flex gap-2 mt-8">
          {albums.slice(0, 4).map((album) => (
            <div key={album.id} className="flex-1 aspect-square max-w-16 overflow-hidden">
              <AlbumCover
                src={album.cover}
                alt={album.title}
                title={album.title}
                artist={album.artist}
                fill
                className="object-cover"
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-6 border-t border-cream/10">
          <LongPlayBrand variant="full" />
        </div>
      </div>
    </ArtifactWrapper>
  )
}

// ============================================
// 3. RECORDS THAT BUILT YOU — Poster format
// ============================================
interface RecordsThatBuiltYouCardProps {
  albums: Album[]
  userName: string
  mode?: ExportMode
}

export function RecordsThatBuiltYouCard({ albums, userName, mode = 'portrait' }: RecordsThatBuiltYouCardProps) {
  const displayAlbums = albums.slice(0, mode === 'poster' ? 9 : 3)
  const gridCols = mode === 'poster' ? 'grid-cols-3' : 'grid-cols-3'

  return (
    <ArtifactWrapper className="max-w-lg">
      <div className={cn(
        "relative bg-gradient-to-br from-background via-card to-tobacco/5 border border-cream/8",
        mode === 'poster' ? 'aspect-[3/4] p-10' : 'aspect-[5/4] p-6',
        "flex flex-col"
      )}>
        {/* Header */}
        <div className="mb-8">
          <p className="text-[8px] uppercase tracking-[0.4em] text-muted-foreground mb-1">
            Records That Built
          </p>
          <p className="font-serif text-2xl text-cream">{userName}</p>
        </div>

        {/* Albums Grid */}
        <div className={cn("flex-1 grid gap-4", gridCols)}>
          {displayAlbums.map((album) => (
            <div key={album.id} className="flex flex-col">
              <div className="relative aspect-square overflow-hidden bg-muted mb-2">
                <AlbumCover
                  src={album.cover}
                  alt={album.title}
                  title={album.title}
                  artist={album.artist}
                  fill
                />
              </div>
              <p className="text-[10px] text-cream truncate">{album.title}</p>
              <p className="text-[8px] text-muted-foreground truncate">{album.artist}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-cream/10 flex justify-between items-center">
          <LongPlayBrand />
          <p className="text-[8px] text-muted-foreground">2026</p>
        </div>
      </div>
    </ArtifactWrapper>
  )
}

// ============================================
// 4. LISTENING ERA CARD — Timeline segment
// ============================================
interface ListeningEraCardProps {
  era: string
  timeRange: string
  archetype: string
  dominantEmotion: string
  insight: string
  topAlbum: Album
  userName: string
}

export function ListeningEraCard({ 
  era, 
  timeRange, 
  archetype, 
  dominantEmotion, 
  insight, 
  topAlbum, 
  userName 
}: ListeningEraCardProps) {
  return (
    <ArtifactWrapper className="max-w-sm">
      <div className="aspect-[4/5] bg-gradient-to-b from-navy/10 via-background to-card border border-cream/8 overflow-hidden">
        {/* Album as background */}
        <div className="relative h-2/5">
          <AlbumCover
            src={topAlbum.cover}
            alt={topAlbum.title}
            title={topAlbum.title}
            artist={topAlbum.artist}
            fill
            className="opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
        </div>

        {/* Content */}
        <div className="relative p-8 -mt-16">
          <p className="text-[8px] uppercase tracking-[0.4em] text-tobacco mb-2">
            {timeRange}
          </p>
          <h4 className="font-serif text-2xl text-cream mb-3">{era}</h4>
          
          <div className="flex gap-2 mb-6">
            <span className="px-2 py-1 text-[8px] uppercase tracking-widest text-cream/60 border border-cream/20">
              {archetype}
            </span>
            <span className="px-2 py-1 text-[8px] uppercase tracking-widest text-tobacco border border-tobacco/30">
              {dominantEmotion}
            </span>
          </div>

          <p className="font-serif text-sm text-cream/70 italic leading-relaxed mb-8">
            &ldquo;{insight}&rdquo;
          </p>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 overflow-hidden shrink-0">
              <AlbumCover
                src={topAlbum.cover}
                alt={topAlbum.title}
                title={topAlbum.title}
                artist={topAlbum.artist}
                fill
              />
            </div>
            <div>
              <p className="text-xs text-cream">{topAlbum.title}</p>
              <p className="text-[10px] text-muted-foreground">{topAlbum.artist}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="absolute bottom-6 left-8 right-8 flex justify-between items-center">
            <LongPlayBrand variant="minimal" />
            <p className="text-[8px] text-muted-foreground">{userName}</p>
          </div>
        </div>
      </div>
    </ArtifactWrapper>
  )
}

// ============================================
// 5. EMOTIONAL MAP — Artistic interpretation
// ============================================
interface EmotionalMapCardProps {
  dimensions: Array<{ left: string; right: string; value: number; description?: string }>
  userName: string
  archetype?: string
}

export function EmotionalMapCard({ dimensions, userName, archetype }: EmotionalMapCardProps) {
  return (
    <ArtifactWrapper className="max-w-sm">
      <div className="aspect-[3/4] bg-gradient-to-b from-burgundy/5 via-background to-card border border-cream/8 p-8 flex flex-col">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[8px] uppercase tracking-[0.4em] text-muted-foreground mb-1">
            Emotional Gravity
          </p>
          <p className="font-serif text-xl text-cream">{userName}</p>
          {archetype && (
            <p className="text-[9px] text-tobacco mt-2">{archetype}</p>
          )}
        </div>

        {/* Dimensions — Artistic, not chart-like */}
        <div className="flex-1 flex flex-col justify-center space-y-8">
          {dimensions.slice(0, 5).map((dim, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between text-[10px]">
                <span className={dim.value < 50 ? 'text-cream' : 'text-cream/40'}>{dim.left}</span>
                <span className={dim.value >= 50 ? 'text-cream' : 'text-cream/40'}>{dim.right}</span>
              </div>
              <div className="relative h-px bg-cream/10">
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-tobacco rounded-full shadow-[0_0_8px_rgba(var(--tobacco),0.4)]"
                  style={{ left: `calc(${dim.value}% - 4px)` }}
                />
              </div>
              {dim.description && (
                <p className="text-[8px] text-muted-foreground italic">{dim.description}</p>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-cream/10">
          <LongPlayBrand variant="full" />
        </div>
      </div>
    </ArtifactWrapper>
  )
}

// ============================================
// 6. YEAR IN REVIEW — Literary essay format
// ============================================
interface YearInReviewCardProps {
  year: string
  openingReflection: string
  archetypeJourney: { start: string; end: string }
  topAlbums: Album[]
  stats: { label: string; value: string }[]
  userName: string
}

export function YearInReviewCard({ 
  year, 
  openingReflection, 
  archetypeJourney, 
  topAlbums, 
  stats,
  userName 
}: YearInReviewCardProps) {
  return (
    <ArtifactWrapper className="max-w-md">
      <div className="bg-gradient-to-b from-background to-burgundy/5 border border-cream/8 p-10 space-y-8">
        {/* Header */}
        <div className="text-center border-b border-cream/10 pb-8">
          <p className="text-[8px] uppercase tracking-[0.5em] text-muted-foreground mb-4">
            A Year in Listening
          </p>
          <h3 className="font-serif text-5xl text-cream mb-2">{year}</h3>
          <p className="text-[9px] text-tobacco uppercase tracking-widest">{userName}</p>
        </div>

        {/* Opening reflection */}
        <p className="font-serif text-base text-cream/80 leading-relaxed italic text-center">
          &ldquo;{openingReflection.slice(0, 150)}...&rdquo;
        </p>

        {/* Archetype Journey */}
        <div className="flex items-center justify-center gap-3 py-4">
          <span className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-cream/50 border border-cream/15">
            {archetypeJourney.start}
          </span>
          <svg className="w-4 h-4 text-tobacco" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
          <span className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-cream border border-tobacco/40">
            {archetypeJourney.end}
          </span>
        </div>

        {/* Top Albums */}
        <div className="flex justify-center gap-3">
          {topAlbums.slice(0, 4).map((album) => (
            <div key={album.id} className="w-16 h-16 overflow-hidden">
              <AlbumCover src={album.cover} alt={album.title} title={album.title} artist={album.artist} fill />
            </div>
          ))}
        </div>

        {/* Stats — Quiet, not celebratory */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-cream/10">
          {stats.slice(0, 3).map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-serif text-2xl text-cream">{stat.value}</p>
              <p className="text-[8px] uppercase tracking-widest text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-cream/10 text-center">
          <LongPlayBrand variant="full" />
        </div>
      </div>
    </ArtifactWrapper>
  )
}

// ============================================
// 7. ANNOTATION COLLECTION — Literary margins
// ============================================
interface AnnotationCollectionCardProps {
  annotations: Array<{
    quote: string
    album: Album
    timestamp?: string
    when: string
  }>
  userName: string
  title?: string
}

export function AnnotationCollectionCard({ 
  annotations, 
  userName,
  title = "Moments Saved"
}: AnnotationCollectionCardProps) {
  return (
    <ArtifactWrapper className="max-w-md">
      <div className="bg-gradient-to-b from-background to-olive/5 border border-cream/8 p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-[8px] uppercase tracking-[0.4em] text-muted-foreground mb-2">
            {userName}&apos;s
          </p>
          <h3 className="font-serif text-2xl text-cream">{title}</h3>
        </div>

        {/* Annotations */}
        <div className="space-y-8">
          {annotations.slice(0, 3).map((annotation, i) => (
            <div key={i} className="border-l-2 border-tobacco/30 pl-4">
              <p className="font-serif text-sm text-cream/80 italic leading-relaxed mb-3">
                &ldquo;{annotation.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 overflow-hidden shrink-0">
                  <AlbumCover
                    src={annotation.album.cover}
                    alt={annotation.album.title}
                    title={annotation.album.title}
                    artist={annotation.album.artist}
                    fill
                  />
                </div>
                <div>
                  <p className="text-[10px] text-cream">{annotation.album.title}</p>
                  <p className="text-[8px] text-muted-foreground">
                    {annotation.timestamp && `${annotation.timestamp} · `}{annotation.when}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-cream/10">
          <LongPlayBrand />
        </div>
      </div>
    </ArtifactWrapper>
  )
}

// ============================================
// 8. LISTENING CYCLE CARD — Room/club memory
// ============================================
interface ListeningCycleCardProps {
  cycleName: string
  room: string
  album: Album
  week: string
  reflection: string
  userName: string
}

export function ListeningCycleCard({ 
  cycleName, 
  room, 
  album, 
  week, 
  reflection, 
  userName 
}: ListeningCycleCardProps) {
  return (
    <ArtifactWrapper className="max-w-sm">
      <div className="aspect-[4/5] bg-gradient-to-b from-navy/8 via-background to-background border border-cream/8 overflow-hidden">
        {/* Album Hero */}
        <div className="relative h-2/5">
          <AlbumCover
            src={album.cover}
            alt={album.title}
            title={album.title}
            artist={album.artist}
            fill
            className="opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
          
          {/* Room badge */}
          <div className="absolute top-4 left-4">
            <span className="px-2 py-1 text-[8px] uppercase tracking-widest text-tobacco bg-background/80 backdrop-blur-sm">
              {room}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 -mt-8 relative">
          <p className="text-[8px] uppercase tracking-[0.4em] text-muted-foreground mb-2">
            {week}
          </p>
          <h4 className="font-serif text-xl text-cream mb-4">{cycleName}</h4>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 overflow-hidden shrink-0 shadow-lg">
              <AlbumCover
                src={album.cover}
                alt={album.title}
                title={album.title}
                artist={album.artist}
                fill
              />
            </div>
            <div>
              <p className="text-sm text-cream">{album.title}</p>
              <p className="text-xs text-muted-foreground">{album.artist}</p>
            </div>
          </div>

          <p className="font-serif text-sm text-cream/70 italic leading-relaxed">
            &ldquo;{reflection}&rdquo;
          </p>

          {/* Footer */}
          <div className="absolute bottom-4 left-6 right-6 flex justify-between items-center">
            <LongPlayBrand variant="minimal" />
            <p className="text-[8px] text-muted-foreground">{userName}</p>
          </div>
        </div>
      </div>
    </ArtifactWrapper>
  )
}

// ============================================
// 9. SONIC THREAD CARD — Recurring pattern
// ============================================
interface SonicThreadCardProps {
  thread: string
  description: string
  frequency: string
  albums: Album[]
  userName: string
}

export function SonicThreadCard({ thread, description, frequency, albums, userName }: SonicThreadCardProps) {
  return (
    <ArtifactWrapper className="max-w-sm">
      <div className="aspect-[3/4] bg-gradient-to-br from-olive/8 via-background to-background border border-cream/8 p-8 flex flex-col">
        {/* Header */}
        <div className="mb-6">
          <p className="text-[8px] uppercase tracking-[0.4em] text-muted-foreground mb-1">
            Sonic Thread
          </p>
          <h4 className="font-serif text-2xl text-cream">{thread}</h4>
        </div>

        {/* Description */}
        <p className="font-serif text-sm text-cream/75 leading-relaxed flex-1">
          {description}
        </p>

        {/* Frequency */}
        <div className="py-4">
          <p className="text-[9px] text-tobacco">{frequency}</p>
        </div>

        {/* Albums */}
        <div className="flex gap-2 mb-6">
          {albums.slice(0, 4).map((album) => (
            <div key={album.id} className="w-12 h-12 overflow-hidden">
              <AlbumCover src={album.cover} alt={album.title} title={album.title} artist={album.artist} fill />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-cream/10 flex justify-between items-center">
          <LongPlayBrand variant="minimal" />
          <p className="text-[8px] text-muted-foreground">{userName}</p>
        </div>
      </div>
    </ArtifactWrapper>
  )
}

// ============================================
// 10. ARTIFACT GALLERY — Export hub
// ============================================
export function ArtifactGallery() {
  const { user, isAuthenticated } = useAuth()
  const displayName = (isAuthenticated && user)
    ? (user.user_metadata?.name ?? user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Listener')
    : 'Listener'

  const sampleAlbums = [ALBUMS.forEmma, ALBUMS.pinkMoon, ALBUMS.blue, ALBUMS.inRainbows, ALBUMS.spiritOfEden]
  const dimensions = [
    { left: 'Warm', right: 'Cold', value: 72, description: 'The warmth of a fire in a cold room.' },
    { left: 'Intimate', right: 'Expansive', value: 28, description: 'Close listening. Music that sits with you.' },
    { left: 'Organic', right: 'Synthetic', value: 22, description: 'Human hands, real rooms, imperfect takes.' },
    { left: 'Sparse', right: 'Dense', value: 38 },
    { left: 'Hopeful', right: 'Melancholic', value: 68, description: 'Sadness that knows beauty.' },
  ]

  const annotations = [
    { quote: "The voice doesn't just crack here—it shatters. And somehow that's where the beauty lives.", album: ALBUMS.forEmma, timestamp: "2:47", when: "January 2026" },
    { quote: "This is what patience sounds like when it becomes trust.", album: ALBUMS.spiritOfEden, when: "March 2026" },
    { quote: "Twenty-eight minutes that contain infinity.", album: ALBUMS.pinkMoon, when: "October 2026" },
  ]

  return (
    <div className="space-y-24 max-w-4xl mx-auto">
      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-tobacco mb-8">Archetype Card</h3>
        <div className="max-w-xs">
          <ArchetypeCard
            archetype="The Nocturnal Romantic"
            tagline="You listen like someone writing letters they'll never send."
            userName={displayName}
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-tobacco mb-8">Taste Portrait</h3>
        <div className="max-w-md">
          <TastePortraitCard
            answer="I'm drawn less to genre than to emotional architecture. Atmosphere over immediacy. Restraint over spectacle. The right kind of sadness can feel like company."
            userName={displayName}
            albums={sampleAlbums}
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-tobacco mb-8">Records That Built You</h3>
        <div className="max-w-lg">
          <RecordsThatBuiltYouCard albums={sampleAlbums} userName={displayName} />
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-tobacco mb-8">Listening Era</h3>
        <div className="max-w-sm">
          <ListeningEraCard
            era="The Winter Isolation"
            timeRange="December 2025 — February 2026"
            archetype="The Nocturnal Romantic"
            dominantEmotion="Solitude"
            insight="Your listening became more introspective. Choosing immersion over variety."
            topAlbum={ALBUMS.forEmma}
            userName={displayName}
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-tobacco mb-8">Emotional Map</h3>
        <div className="max-w-xs">
          <EmotionalMapCard
            dimensions={dimensions}
            userName={displayName}
            archetype="The Nocturnal Romantic"
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-tobacco mb-8">Year in Review</h3>
        <div className="max-w-md">
          <YearInReviewCard
            year="2026"
            openingReflection="This year, you stopped consuming music and started conversing with it. The shift was gradual—you might not have noticed when background became foreground"
            archetypeJourney={{ start: "Nostalgic Wanderer", end: "Nocturnal Romantic" }}
            topAlbums={sampleAlbums}
            stats={[
              { label: "Sessions", value: "847" },
              { label: "Annotations", value: "174" },
              { label: "Full Albums", value: "312" },
            ]}
            userName={displayName}
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-tobacco mb-8">Annotation Collection</h3>
        <div className="max-w-md">
          <AnnotationCollectionCard
            annotations={annotations}
            userName={displayName}
            title="Moments That Mattered"
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-tobacco mb-8">Listening Cycle</h3>
        <div className="max-w-sm">
          <ListeningCycleCard
            cycleName="The Spirit of Eden Week"
            room="The Nocturnal Room"
            album={ALBUMS.spiritOfEden}
            week="March 2026"
            reflection="This was the week you understood why patience is a form of trust."
            userName={displayName}
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-tobacco mb-8">Sonic Thread</h3>
        <div className="max-w-sm">
          <SonicThreadCard
            thread="Solitude as Comfort"
            description="You gravitated toward artists who made loneliness feel less like absence and more like presence. Solo recordings. Sparse arrangements. One voice in an empty room."
            frequency="Present in 67% of your listening"
            albums={sampleAlbums.slice(0, 4)}
            userName={displayName}
          />
        </div>
      </section>
    </div>
  )
}
