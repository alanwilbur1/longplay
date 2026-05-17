'use client'

/**
 * Identity — honest "still forming" surface (Phase 3D Truth Pass).
 *
 * The previous version of this page rendered a fixed archetype ("The
 * Nocturnal Romantic"), fixed taste portrait paragraphs, fixed
 * emotional dimensions, and a fixed evolution timeline — identical for
 * every viewer. That violated the product philosophy: when the system
 * does not yet know something about a listener, it must not pretend
 * that it does.
 *
 * The inference engine (3C.3) is intentionally deferred. Until it
 * exists, this page expresses honest emptiness with phase-aware
 * literary framing instead of fictional depth. The atmospheric
 * treatment (gradient, typography, spacing, italic register) is
 * preserved so the page still feels like part of the same world.
 *
 * What this surface promises: a slow, accumulating understanding of
 * who you are through how you listen. What it currently delivers: an
 * acknowledgment that the understanding is still gathering. The two
 * are no longer in conflict.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth-provider'
import { useRitualPhase } from '@/lib/cadence'
import { listMyMoments } from '@/lib/actions/moments'

export function IdentityProfileScreen() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const ritualPhase = useRitualPhase()

  const [momentCount, setMomentCount] = useState<number | null>(null)
  const [isLateNight, setIsLateNight] = useState(false)

  useEffect(() => {
    const hour = new Date().getHours()
    setIsLateNight(hour >= 23 || hour < 5)
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setMomentCount(0)
      return
    }
    listMyMoments()
      .then(r => setMomentCount(r.success && r.data ? r.data.length : 0))
      .catch(() => setMomentCount(0))
  }, [isAuthenticated])

  // Anchor copy. The page is the same shape for every viewer until the
  // identity inference engine exists. Two small details vary:
  //   - the current ritual phase (subtle observational framing)
  //   - the moment count (a quiet honest signal of accumulation)
  const observation = ritualPhase?.observation ?? ' '
  const phaseTitle = ritualPhase?.title ?? 'Listening'

  const hasAnyMoments = (momentCount ?? 0) > 0

  return (
    <div
      className={[
        'grain relative pb-24 md:pb-0 bg-background',
        isLateNight && 'after-midnight',
        ritualPhase?.atmosphereClass ?? '',
      ].filter(Boolean).join(' ')}
    >
      {/* ──────────────────────────────────────────────────────────────
          THE QUESTION — preserved as the page's emotional anchor
          ────────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[100svh] flex items-center justify-center px-6 py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-burgundy/8 via-transparent to-transparent opacity-60" />
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-background to-transparent" />

        <div className="relative max-w-2xl mx-auto text-center">
          <div className="animate-fade-in-slow">
            <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco/60 mb-8">
              The question everyone asks
            </p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-cream/90 leading-[1.15] mb-16">
              {'"'}What kind of music<br />do you like?{'"'}
            </h1>
          </div>

          <div className="animate-fade-in-slow" style={{ animationDelay: '400ms' }}>
            <p className="font-serif text-xl md:text-2xl text-cream/80 leading-relaxed italic max-w-xl mx-auto">
              The answer is still gathering.
            </p>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          STILL FORMING — the page's quiet centre
          ────────────────────────────────────────────────────────────── */}
      <section className="px-6 py-24 md:py-32 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground/70 mb-12">
            Your Listening Identity
          </p>

          <div className="space-y-8">
            <p className="font-serif text-xl md:text-2xl text-cream leading-relaxed">
              An identity in this room is not a profile you fill out.
              It is the slow accumulation of how you have listened.
            </p>

            <p className="font-serif text-xl md:text-2xl text-cream/70 leading-relaxed italic">
              {observation}
            </p>

            <p className="font-serif text-xl md:text-2xl text-cream/70 leading-relaxed">
              The patterns will surface as you keep returning.
              The room is listening for them.
            </p>
          </div>

          <div className="mt-16 pt-12 border-t border-border/20">
            <p className="text-[10px] uppercase tracking-[0.3em] text-tobacco/70 mb-4">
              {phaseTitle}
            </p>
            <p className="font-serif text-base text-cream/55 italic leading-relaxed">
              {hasAnyMoments
                ? momentCount === 1
                  ? 'One moment so far. The first marks shape what follows.'
                  : `${momentCount} moments so far. The shape is beginning to settle.`
                : 'No moments yet. Listening leaves traces the longer you stay.'}
            </p>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────
          INVITATION — quiet, two-route
          ────────────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground/70 mb-6">
            What you can do now
          </p>

          <div className="space-y-6">
            <Link
              href="/rooms"
              className="group flex items-start justify-between gap-6 p-5 border border-border/20 hover:border-border/40 transition-colors duration-500"
            >
              <div className="flex-1">
                <p className="font-serif text-xl text-cream group-hover:text-cream/90 transition-colors duration-500 mb-1">
                  Enter a room
                </p>
                <p className="text-sm text-muted-foreground/60 leading-relaxed">
                  Each room is a different listening culture. The first one you stay with begins the shape.
                </p>
              </div>
              <svg className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1 transition-transform duration-500 group-hover:translate-x-1 group-hover:text-cream/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>

            <Link
              href="/archive/moments"
              className="group flex items-start justify-between gap-6 p-5 border border-border/20 hover:border-border/40 transition-colors duration-500"
            >
              <div className="flex-1">
                <p className="font-serif text-xl text-cream group-hover:text-cream/90 transition-colors duration-500 mb-1">
                  Read what you have marked
                </p>
                <p className="text-sm text-muted-foreground/60 leading-relaxed">
                  Your archive is private. It will grow into something only you recognise.
                </p>
              </div>
              <svg className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1 transition-transform duration-500 group-hover:translate-x-1 group-hover:text-cream/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          </div>

          {!authLoading && !isAuthenticated && (
            <p className="mt-10 text-sm text-muted-foreground/40 italic leading-relaxed">
              Sign in to begin accumulating an identity the room can see.
            </p>
          )}

          {!authLoading && user && (
            <p className="mt-10 text-[10px] uppercase tracking-[0.3em] text-muted-foreground/30">
              Listener · {user.email?.split('@')[0] ?? 'unnamed'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
