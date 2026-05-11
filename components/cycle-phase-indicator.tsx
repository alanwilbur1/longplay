'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCurrentPhase, getWeekProgress, type PhaseInfo } from '@/lib/weekly-cadence'
import { cn } from '@/lib/utils'

/**
 * Main phase indicator module for the Home screen
 * Shows the current phase with ritual-like presentation
 */
export function CyclePhaseModule({ className }: { className?: string }) {
  const [phase, setPhase] = useState<PhaseInfo | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setPhase(getCurrentPhase())
    setProgress(getWeekProgress())
  }, [])

  if (!phase) return null

  return (
    <div className={cn("animate-fade-in", className)}>
      {/* Phase Card */}
      <div className="bg-card/30 border border-border/20 p-6 md:p-8">
        {/* Day & Phase Title */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-tobacco mb-2">
              {phase.day}
            </p>
            <h3 className="font-serif text-2xl md:text-3xl text-cream">
              {phase.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {phase.subtitle}
            </p>
          </div>
          
          {/* Privacy indicator */}
          {phase.isPrivate && (
            <div className="flex items-center gap-2 text-xs text-olive bg-olive/10 px-3 py-1.5">
              <PrivateIcon className="w-3 h-3" />
              <span>Private</span>
            </div>
          )}
        </div>

        {/* Invitation text - the key ritual instruction */}
        <p className="font-serif text-lg text-cream/80 italic leading-relaxed mb-6">
          {phase.invitation}
        </p>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          {phase.description}
        </p>

        {/* Week Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-muted-foreground mb-3">
            <span>Week Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1 bg-muted/30 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-burgundy/60 to-burgundy transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Next phase teaser */}
        <div className="flex items-center justify-between pt-4 border-t border-border/20">
          <p className="text-sm text-muted-foreground">
            {phase.nextPhase}
          </p>
          <span className="text-xs text-tobacco">{phase.nextPhaseTime}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact phase badge for navigation or headers
 */
export function CyclePhaseBadge({ className }: { className?: string }) {
  const [phase, setPhase] = useState<PhaseInfo | null>(null)

  useEffect(() => {
    setPhase(getCurrentPhase())
  }, [])

  if (!phase) return null

  return (
    <div className={cn(
      "inline-flex items-center gap-3 px-4 py-2 bg-card/30 border border-border/20",
      className
    )}>
      <span className="text-[10px] uppercase tracking-[0.3em] text-tobacco">
        {phase.day}
      </span>
      <span className="w-px h-3 bg-border/40" />
      <span className="text-sm text-cream">
        {phase.title}
      </span>
      {phase.isPrivate && (
        <PrivateIcon className="w-3 h-3 text-olive" />
      )}
    </div>
  )
}

/**
 * Mini week timeline showing all phases
 */
export function WeekTimeline({ className }: { className?: string }) {
  const [currentPhase, setCurrentPhase] = useState<PhaseInfo | null>(null)

  useEffect(() => {
    setCurrentPhase(getCurrentPhase())
  }, [])

  const days = [
    { label: 'M', phase: 'album', title: 'Album' },
    { label: 'T', phase: 'prompts', title: 'Prompts' },
    { label: 'W', phase: 'annotation', title: 'Annotate' },
    { label: 'T', phase: 'annotation', title: 'Annotate' },
    { label: 'F', phase: 'discussion', title: 'Discussion' },
    { label: 'S', phase: 'curators-note', title: 'Essay' },
    { label: 'S', phase: 'identity-update', title: 'Identity' },
  ]

  if (!currentPhase) return null

  // Map dayOfWeek to index (Monday = 0 for display)
  const currentIndex = currentPhase.dayOfWeek === 0 ? 6 : currentPhase.dayOfWeek - 1

  return (
    <div className={cn("", className)}>
      <div className="flex gap-2">
        {days.map((day, i) => {
          const isToday = i === currentIndex
          const isPast = i < currentIndex
          
          return (
            <div key={i} className="flex-1 text-center group relative">
              <p className={cn(
                "text-[10px] uppercase mb-2 transition-colors",
                isToday ? "text-burgundy font-medium" : "text-muted-foreground"
              )}>
                {day.label}
              </p>
              <div 
                className={cn(
                  "h-1.5 rounded-full transition-all duration-500",
                  isToday ? "bg-burgundy" : isPast ? "bg-tobacco/40" : "bg-muted/40"
                )}
              />
              {isToday && (
                <p className="text-[9px] text-burgundy mt-2 uppercase tracking-wider">
                  Now
                </p>
              )}
              
              {/* Tooltip on hover */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-[10px] text-cream bg-card/90 px-2 py-1 whitespace-nowrap">
                  {day.title}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Room-specific phase context (for Listening Room)
 */
export function RoomPhaseContext({ className }: { className?: string }) {
  const [phase, setPhase] = useState<PhaseInfo | null>(null)

  useEffect(() => {
    setPhase(getCurrentPhase())
  }, [])

  if (!phase) return null

  const isAnnotationPhase = phase.phase === 'annotation'
  const isDiscussionPhase = phase.phase === 'discussion' || phase.phase === 'curators-note'

  return (
    <div className={cn(
      "p-4 border-l-2 transition-colors duration-500",
      isAnnotationPhase ? "border-olive bg-olive/5" : 
      isDiscussionPhase ? "border-tobacco bg-tobacco/5" :
      "border-border/30 bg-card/20",
      className
    )}>
      {isAnnotationPhase ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <PrivateIcon className="w-4 h-4 text-olive" />
            <p className="text-sm text-olive font-medium">Annotation Room</p>
          </div>
          <p className="text-sm text-cream/70">
            Your notes remain private. Write freely. Discussion opens {phase.nextPhaseTime.toLowerCase()}.
          </p>
        </>
      ) : isDiscussionPhase ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <CommunityIcon className="w-4 h-4 text-tobacco" />
            <p className="text-sm text-tobacco font-medium">Discussion Open</p>
          </div>
          <p className="text-sm text-cream/70">
            Private reflections are now visible. See how others heard the same record.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {phase.invitation}
          </p>
        </>
      )}
    </div>
  )
}

/**
 * Phase-based action button
 */
export function PhaseAction({ className }: { className?: string }) {
  const [phase, setPhase] = useState<PhaseInfo | null>(null)

  useEffect(() => {
    setPhase(getCurrentPhase())
  }, [])

  if (!phase) return null

  const actions: Record<string, { href: string; label: string }> = {
    'album': { href: '/room', label: 'Begin Listening' },
    'prompts': { href: '/room', label: 'View Prompts' },
    'annotation': { href: '/room', label: 'Open Notebook' },
    'discussion': { href: '/room', label: 'Join Discussion' },
    'curators-note': { href: '/room', label: 'Read Essay' },
    'identity-update': { href: '/identity', label: 'See Your Update' },
  }

  const action = actions[phase.phase]

  return (
    <Link 
      href={action.href}
      className={cn(
        "inline-flex items-center gap-2 px-6 py-3 bg-burgundy/80 hover:bg-burgundy text-cream text-sm transition-colors duration-500",
        className
      )}
    >
      <span>{action.label}</span>
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
      </svg>
    </Link>
  )
}

// Icons
function PrivateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}

function CommunityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  )
}
