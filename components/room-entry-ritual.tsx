'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { type Room, getRoomSeasonalMood } from '@/lib/rooms'

interface RoomEntryRitualProps {
  room: Room
  onEnter: () => void
  onDecline?: () => void
}

/**
 * Room Entry Ritual
 * 
 * This is NOT a loading screen.
 * This is an emotional orientation — a moment of intention before entering a listening culture.
 * 
 * Each room should feel like stepping across a threshold.
 */
export function RoomEntryRitual({ room, onEnter, onDecline }: RoomEntryRitualProps) {
  const [phase, setPhase] = useState<'invitation' | 'entering' | 'entered'>('invitation')
  const [showSeasonalNote, setShowSeasonalNote] = useState(false)
  const router = useRouter()
  
  const seasonalMood = getRoomSeasonalMood(room)
  
  // Handle entry animation
  const handleEnter = () => {
    setPhase('entering')
    setTimeout(() => {
      setPhase('entered')
      onEnter()
    }, 1500)
  }
  
  // Aesthetic variations per room type
  const aestheticClasses: Record<string, {
    container: string
    glow: string
    text: string
    button: string
    accent: string
  }> = {
    'nocturnal-room': {
      container: 'from-slate-950 via-slate-900/95 to-slate-950',
      glow: 'from-blue-900/20 via-transparent to-transparent',
      text: 'text-blue-200/80',
      button: 'border-blue-800/40 hover:border-blue-600/60 hover:bg-blue-900/20',
      accent: 'text-blue-300/60',
    },
    'analog-futures': {
      container: 'from-amber-950/90 via-orange-950/80 to-stone-950',
      glow: 'from-amber-800/15 via-transparent to-transparent',
      text: 'text-amber-200/80',
      button: 'border-amber-700/40 hover:border-amber-500/60 hover:bg-amber-900/20',
      accent: 'text-amber-400/60',
    },
    'cathedral-hour': {
      container: 'from-emerald-950/80 via-teal-950/70 to-slate-950',
      glow: 'from-emerald-800/15 via-transparent to-transparent',
      text: 'text-emerald-200/70',
      button: 'border-emerald-800/40 hover:border-emerald-600/60 hover:bg-emerald-900/20',
      accent: 'text-emerald-300/50',
    },
    'beautiful-damage': {
      container: 'from-rose-950/80 via-pink-950/70 to-slate-950',
      glow: 'from-rose-800/15 via-transparent to-transparent',
      text: 'text-rose-200/80',
      button: 'border-rose-800/40 hover:border-rose-600/60 hover:bg-rose-900/20',
      accent: 'text-rose-300/60',
    },
    'records-rain': {
      container: 'from-slate-900/95 via-slate-800/90 to-slate-950',
      glow: 'from-slate-600/10 via-transparent to-transparent',
      text: 'text-slate-300/80',
      button: 'border-slate-600/40 hover:border-slate-500/60 hover:bg-slate-800/20',
      accent: 'text-slate-400/60',
    },
    'warm-static': {
      container: 'from-amber-950/80 via-yellow-950/70 to-stone-950',
      glow: 'from-amber-700/15 via-transparent to-transparent',
      text: 'text-amber-200/80',
      button: 'border-amber-700/40 hover:border-amber-500/60 hover:bg-amber-900/20',
      accent: 'text-amber-400/60',
    },
    'spiritual-jazz': {
      container: 'from-yellow-950/70 via-orange-950/60 to-stone-950',
      glow: 'from-yellow-700/15 via-transparent to-transparent',
      text: 'text-yellow-200/70',
      button: 'border-yellow-700/40 hover:border-yellow-500/60 hover:bg-yellow-900/20',
      accent: 'text-yellow-400/50',
    },
    'criterion-listening': {
      container: 'from-neutral-900/95 via-neutral-800/90 to-neutral-950',
      glow: 'from-neutral-600/10 via-transparent to-transparent',
      text: 'text-neutral-200/80',
      button: 'border-neutral-600/40 hover:border-neutral-500/60 hover:bg-neutral-800/20',
      accent: 'text-neutral-400/60',
    },
    'pitchfork-deep': {
      container: 'from-red-950/70 via-rose-950/60 to-slate-950',
      glow: 'from-red-800/10 via-transparent to-transparent',
      text: 'text-red-200/70',
      button: 'border-red-800/40 hover:border-red-600/60 hover:bg-red-900/20',
      accent: 'text-red-400/50',
    },
  }
  
  const aesthetic = aestheticClasses[room.aesthetics.themeClass] || aestheticClasses['nocturnal-room']
  
  // Typography rhythm based on room style
  const typographyClasses = {
    intimate: 'text-lg leading-relaxed tracking-normal',
    expansive: 'text-xl leading-loose tracking-wide',
    structured: 'text-base leading-relaxed tracking-normal',
    organic: 'text-lg leading-relaxed tracking-tight',
    restrained: 'text-base leading-relaxed tracking-wider',
  }
  
  const typography = typographyClasses[room.aesthetics.typographyStyle]
  
  // Transition speed based on room pacing
  const transitionClasses = {
    slow: 'duration-1000',
    medium: 'duration-700',
    deliberate: 'duration-500',
  }
  
  const transition = transitionClasses[room.aesthetics.transitionSpeed]

  return (
    <div 
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-gradient-to-b",
        aesthetic.container,
        phase === 'entering' && "animate-pulse",
        phase === 'entered' && "opacity-0 pointer-events-none transition-opacity duration-1000"
      )}
    >
      {/* Ambient glow */}
      <div 
        className={cn(
          "absolute inset-0 bg-gradient-radial pointer-events-none",
          aesthetic.glow
        )} 
      />
      
      {/* Grain texture */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          opacity: room.aesthetics.grainOpacity,
        }}
      />
      
      {/* Content */}
      <div 
        className={cn(
          "relative max-w-lg mx-auto px-8 text-center",
          "transition-all",
          transition,
          phase === 'invitation' && "translate-y-0 opacity-100",
          phase === 'entering' && "translate-y-4 opacity-50",
          phase === 'entered' && "translate-y-8 opacity-0"
        )}
      >
        {/* Room name */}
        <h1 
          className={cn(
            "font-serif mb-4 text-cream",
            room.aesthetics.typographyStyle === 'expansive' ? 'text-4xl md:text-5xl' : 'text-3xl md:text-4xl',
            room.aesthetics.spacingRhythm === 'expansive' ? 'mb-6' : 'mb-4'
          )}
        >
          {room.name}
        </h1>
        
        {/* Tagline */}
        {room.tagline && (
          <p 
            className={cn(
              "font-serif italic mb-8",
              aesthetic.accent,
              room.aesthetics.typographyStyle === 'expansive' ? 'text-lg' : 'text-base'
            )}
          >
            {room.tagline}
          </p>
        )}
        
        {/* Invitation text */}
        <p 
          className={cn(
            "font-serif mb-12",
            typography,
            aesthetic.text,
            room.aesthetics.spacingRhythm === 'expansive' ? 'mb-16' : 'mb-12'
          )}
        >
          {room.culture.invitationText}
        </p>
        
        {/* Seasonal note (expandable) */}
        <div className="mb-12">
          <button
            onClick={() => setShowSeasonalNote(!showSeasonalNote)}
            className={cn(
              "text-xs uppercase tracking-[0.3em] transition-colors duration-500",
              aesthetic.accent,
              "hover:opacity-80"
            )}
          >
            {showSeasonalNote ? 'Hide seasonal note' : 'This season\'s mood'}
          </button>
          
          {showSeasonalNote && (
            <div 
              className={cn(
                "mt-4 p-4 border border-border/10 animate-fade-in",
                aesthetic.text
              )}
            >
              <p className="font-serif text-sm leading-relaxed mb-2">
                {seasonalMood.description}
              </p>
              <p className={cn("text-xs", aesthetic.accent)}>
                {seasonalMood.moodShift}
              </p>
            </div>
          )}
        </div>
        
        {/* Entry actions */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleEnter}
            disabled={phase !== 'invitation'}
            className={cn(
              "px-8 py-4 border text-cream text-sm tracking-[0.2em] uppercase",
              "transition-all",
              transition,
              aesthetic.button,
              phase !== 'invitation' && "opacity-50 cursor-not-allowed"
            )}
          >
            {phase === 'entering' ? 'Entering...' : room.culture.entryPhrase}
          </button>
          
          {onDecline && (
            <button
              onClick={onDecline}
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Not now
            </button>
          )}
        </div>
        
        {/* Curator attribution */}
        <div className={cn("mt-16", aesthetic.accent)}>
          <p className="text-[10px] uppercase tracking-[0.3em] mb-1">
            Curated by
          </p>
          <p className="text-sm">
            {room.curator.name}
          </p>
        </div>
      </div>
    </div>
  )
}
