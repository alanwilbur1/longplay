'use client'

/**
 * Listening Life — honest minimum (Phase 3D Truth Pass).
 *
 * The previous version rendered a "lifelong archive" of fixed listening
 * periods, archetype evolution, formative records, resurfaced moments,
 * quiet milestones, sonic threads, and a year-in-review — all hardcoded
 * static data identical for every viewer. None of it was true.
 *
 * What this page can honestly show: the real number of moments and
 * reflections the listener has accumulated. Everything else is deferred
 * to the longitudinal-memory layer (Phase 3F). Until that exists, the
 * page is two real counters and a literary acknowledgment.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRitualPhase } from '@/lib/cadence'

interface ListeningLifeScreenProps {
  totalMoments?: number
  reflectionCount?: number
}

export function ListeningLifeScreen({
  totalMoments = 0,
  reflectionCount = 0,
}: ListeningLifeScreenProps) {
  const ritualPhase = useRitualPhase()
  const [isLateNight, setIsLateNight] = useState(false)

  useEffect(() => {
    const hour = new Date().getHours()
    setIsLateNight(hour >= 23 || hour < 5)
  }, [])

  return (
    <div
      className={[
        'grain relative pb-24 md:pb-0',
        isLateNight && 'after-midnight',
        ritualPhase?.atmosphereClass ?? '',
      ].filter(Boolean).join(' ')}
    >
      {/* ──────────────────────────────────────────────────────────────
          HERO — real counters, literary framing
          ────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[80svh] flex items-center justify-center px-6 py-24">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-card/10" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200%] h-[60%] bg-gradient-radial from-burgundy/5 via-transparent to-transparent opacity-60" />
        </div>

        <div className="text-center max-w-xl mx-auto animate-fade-in-slow">
          <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-10">
            A Lifelong Archive
          </p>

          <h1 className="font-serif text-4xl md:text-5xl text-cream/90 mb-10 leading-[1.15]">
            Your Listening Life
          </h1>

          <p className="font-serif text-lg md:text-xl text-cream/70 italic leading-relaxed mb-16 max-w-md mx-auto">
            Not statistics. Not a recap.
            <br />
            A private archive that grows as you listen.
          </p>

          {/* Honest counters — only signal we can truthfully show today */}
          <div className="flex items-center justify-center gap-3 text-muted-foreground text-sm mb-10">
            <span>
              {totalMoments.toLocaleString()} {totalMoments === 1 ? 'moment' : 'moments'}
            </span>
            <span className="w-1 h-1 rounded-full bg-tobacco/40" />
            <span>
              {reflectionCount} {reflectionCount === 1 ? 'reflection' : 'reflections'}
            </span>
          </div>

          <p className="font-serif text-sm text-muted-foreground/45 italic max-w-sm mx-auto leading-relaxed">
            {totalMoments === 0
              ? 'The archive begins the first time you mark something.'
              : 'Patterns surface slowly. This is still becoming.'}
          </p>

          {/* Two routes to the real archive surfaces */}
          <div className="mt-16 flex flex-col items-center gap-4">
            <Link
              href="/archive/moments"
              className="inline-flex items-center gap-2 text-sm text-tobacco hover:text-cream transition-colors duration-500"
            >
              <span>Your moments</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link
              href="/archive/cycles"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground/60 hover:text-cream transition-colors duration-500"
            >
              <span>Past listening cycles</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          ACKNOWLEDGMENT — what is not yet here, framed as patience
          ────────────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground/70 mb-8">
            Still gathering
          </p>

          <p className="font-serif text-xl md:text-2xl text-cream/70 leading-relaxed italic">
            Resurfaced moments, listening eras, archetype evolution,
            year-in-review — these surface from accumulated listening,
            not from a profile filled out at the start.
          </p>

          <p className="font-serif text-base text-cream/45 mt-8 leading-relaxed">
            The archive will begin speaking more clearly the longer
            you stay in the room.
          </p>
        </div>
      </section>
    </div>
  )
}
