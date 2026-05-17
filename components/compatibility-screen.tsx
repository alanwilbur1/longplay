'use client'

/**
 * Compatibility — honest-empty surface (Phase 3D Truth Pass).
 *
 * The previous version showed a fixed reading between two fictional
 * listeners (Elena and Marcus). That violated the product philosophy:
 * compatibility presumes connections, and connections do not exist as
 * a primitive in this product yet.
 *
 * Until connections (Identity Mechanics §12) and compatibility readings
 * are real, this page is a quiet placeholder. The atmospheric framing
 * is preserved; the fictional content is gone.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRitualPhase } from '@/lib/cadence'

export function CompatibilityScreen() {
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
            Compatibility
          </p>

          <h1 className="font-serif text-3xl md:text-4xl text-cream/90 leading-relaxed mb-10">
            Compatibility requires another listener
            you have connected with.
          </h1>

          <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-10" />

          <p className="font-serif text-lg text-cream/60 italic leading-relaxed mb-12">
            That part of the room is still empty.
            <br />
            It will fill when there is someone to read against.
          </p>

          <Link
            href="/rooms"
            className="inline-flex items-center gap-2 text-sm text-tobacco hover:text-cream transition-colors duration-500"
          >
            <span>Return to your rooms</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  )
}
