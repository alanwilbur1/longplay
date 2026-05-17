'use client'

/**
 * Share — honest-empty surface (Phase 3D Truth Pass).
 *
 * The previous version rendered an "artifact gallery" of shareable
 * identity cards. Every card was attributed to "Elena" by default and
 * built from hardcoded archetype data identical for every viewer.
 * Sharing fictional content with a fictional name on it is the
 * cleanest possible violation of the truth principle.
 *
 * The shareable-artifacts component still exists as orphaned code for
 * the day the identity inference engine lands and a card has real
 * attribution. Until then, this screen does not generate artifacts.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRitualPhase } from '@/lib/cadence'

export function ShareScreen() {
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
      <section className="px-6 py-24 md:py-32 md:px-12 lg:px-24 min-h-[80vh] flex items-center">
        <div className="max-w-xl mx-auto text-center">
          <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco/60 mb-10">
            Share
          </p>

          <h1 className="font-serif text-3xl md:text-4xl text-cream/90 leading-relaxed mb-10">
            There is nothing here to share yet.
          </h1>

          <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-10" />

          <p className="font-serif text-lg text-cream/60 italic leading-relaxed mb-12">
            Artifacts will surface as your listening identity forms.
            <br />
            Until then, the page is quiet on purpose.
          </p>

          <Link
            href="/identity"
            className="inline-flex items-center gap-2 text-sm text-tobacco hover:text-cream transition-colors duration-500"
          >
            <span>Read about your identity</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  )
}
