'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  getCompatibilityWith,
  type CompatibilityEnvelope,
} from '@/lib/actions/compatibility'
import { compatibilityBandLabel } from '@/lib/identity/compatibility'
import { ARCHETYPE_CATALOG } from '@/lib/identity/archetypes'
import { TRAIT_DISPLAY, relativeTimeAgo } from '@/lib/identity/presentation'
import type { TraitKey, TraitBand } from '@/lib/identity/traits'

/**
 * CompatibilityDetailScreen — Phase 6A.10
 *
 * Renders the caller's compatibility envelope with one target user.
 * The envelope is normalized to "me / them" frames by the server
 * action so the UI never reasons about canonical pair ordering.
 *
 * Design constraints (Phase 6A.10):
 *   - Observational tone. Bands are qualitative ("Strong resonance"),
 *     never percentages.
 *   - Shared sections describe overlap; a separate "Where you
 *     diverge" section is honest about meaningful gaps.
 *   - All copy is static (catalogs + envelope payload). No AI prose.
 *   - Restrained layout — same typography and posture as
 *     IdentityProfileScreen.
 *
 * Fallback states branch on envelope.state. Detail page is safe to
 * render unconditionally — every state produces something honest or
 * a tasteful nothing.
 */

const ARCHETYPE_LABELS: Record<string, string> = Object.fromEntries(
  ARCHETYPE_CATALOG.map((a) => [a.key, a.label]),
)

export function CompatibilityDetailScreen({
  targetUserId,
}: {
  targetUserId: string
}) {
  const [envelope, setEnvelope] = useState<CompatibilityEnvelope | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getCompatibilityWith(targetUserId)
      .then((env) => {
        if (!cancelled) setEnvelope(env)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load')
        }
      })
    return () => {
      cancelled = true
    }
  }, [targetUserId])

  if (error) return <ErrorState message={error} />
  if (!envelope) return <LoadingState />
  if (envelope.state === 'unauthenticated') return <UnauthenticatedState />
  if (envelope.state === 'self') return <SelfState message={envelope.message} />
  if (envelope.state === 'unknown_target') return <UnknownTargetState />

  return <ReadyState envelope={envelope} />
}

// ── States ────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="grain relative min-h-[60vh] flex items-center justify-center px-6 py-24">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground animate-fade-in">
        Loading…
      </p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="grain relative min-h-[60vh] flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-burgundy mb-4">
          Compatibility unavailable
        </p>
        <p className="text-sm text-cream/70">{message}</p>
      </div>
    </div>
  )
}

function UnauthenticatedState() {
  return (
    <div className="grain relative min-h-[60vh] flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <h2 className="font-serif text-2xl text-cream mb-4">
          Sign in to see compatibility
        </h2>
        <Link
          href="/sign-in"
          className="text-sm text-tobacco hover:text-cream transition-colors duration-500"
        >
          Sign in →
        </Link>
      </div>
    </div>
  )
}

function SelfState({ message }: { message: string }) {
  return (
    <div className="grain relative min-h-[60vh] flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <p className="text-sm text-cream/70 leading-relaxed">{message}</p>
        <Link
          href="/identity"
          className="mt-6 inline-block text-sm text-tobacco hover:text-cream transition-colors duration-500"
        >
          View your own identity →
        </Link>
      </div>
    </div>
  )
}

function UnknownTargetState() {
  return (
    <div className="grain relative min-h-[60vh] flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          No such listener
        </p>
        <Link
          href="/compatibility"
          className="text-sm text-tobacco hover:text-cream transition-colors duration-500"
        >
          Back to compatibility →
        </Link>
      </div>
    </div>
  )
}

// ── Ready ─────────────────────────────────────────────────────────

function ReadyState({
  envelope,
}: {
  envelope: Extract<CompatibilityEnvelope, { state: 'ready' }>
}) {
  return (
    <div className="grain relative pb-32 md:pb-16 md:pt-16">
      <HeroBand envelope={envelope} />
      <ArchetypeAlignmentSection envelope={envelope} />
      {envelope.shared_genres.length > 0 && (
        <SharedGenresSection genres={envelope.shared_genres} />
      )}
      {envelope.shared_rooms.length > 0 && (
        <SharedRoomsSection rooms={envelope.shared_rooms} />
      )}
      {envelope.shared_traits.length > 0 && (
        <SharedTraitsSection traits={envelope.shared_traits} />
      )}
      {envelope.divergence_points.length > 0 && (
        <DivergenceSection points={envelope.divergence_points} />
      )}
      <FreshnessFooter
        computedAt={envelope.computed_at}
        algorithmVersion={envelope.algorithm_version}
      />
    </div>
  )
}

function HeroBand({
  envelope,
}: {
  envelope: Extract<CompatibilityEnvelope, { state: 'ready' }>
}) {
  return (
    <section className="relative px-6 py-24 md:py-32 md:px-12 lg:px-24">
      <div className="max-w-2xl mx-auto text-center animate-fade-in-up">
        <p className="text-xs uppercase tracking-[0.3em] text-tobacco/70 mb-6">
          {compatibilityBandLabel(envelope.band)}
        </p>
        <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl text-cream leading-[1.15]">
          You and this listener move through music in related ways.
        </h1>
      </div>
    </section>
  )
}

function ArchetypeAlignmentSection({
  envelope,
}: {
  envelope: Extract<CompatibilityEnvelope, { state: 'ready' }>
}) {
  const me = envelope.me_primary_archetype
  const them = envelope.them_primary_archetype
  const meLabel = me ? (ARCHETYPE_LABELS[me] ?? me) : null
  const themLabel = them ? (ARCHETYPE_LABELS[them] ?? them) : null

  let copy: string | null = null
  if (envelope.same_primary_archetype && meLabel) {
    copy = `Both currently ${meLabel}.`
  } else if (envelope.archetype_cross_listed && meLabel && themLabel) {
    copy = `Cross-listed archetypes: ${meLabel} and ${themLabel}.`
  } else if (meLabel && themLabel) {
    copy = `${meLabel} • ${themLabel}.`
  } else if (meLabel || themLabel) {
    copy = `${meLabel ?? '—'} • ${themLabel ?? '—'}.`
  }

  if (!copy) return null

  return (
    <section className="px-6 py-12 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          Archetype alignment
        </h2>
        <p className="font-serif text-lg text-cream/80 leading-relaxed">
          {copy}
        </p>
      </div>
    </section>
  )
}

function SharedGenresSection({
  genres,
}: {
  genres: Extract<
    CompatibilityEnvelope,
    { state: 'ready' }
  >['shared_genres']
}) {
  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">
          Shared genres
        </h2>
        <ul className="space-y-3">
          {genres.slice(0, 8).map((g, i) => (
            <li
              key={g.genre}
              className="flex items-baseline gap-4 border-b border-border/10 pb-3 last:border-0"
            >
              <span className="text-xs text-tobacco/60 w-6 shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-serif text-base text-cream flex-1">
                {g.genre}
              </span>
              <span className="text-xs text-muted-foreground">
                you {g.my_weight.toFixed(1)} · them {g.their_weight.toFixed(1)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function SharedRoomsSection({
  rooms,
}: {
  rooms: Extract<CompatibilityEnvelope, { state: 'ready' }>['shared_rooms']
}) {
  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">
          Shared rooms
        </h2>
        <ul className="space-y-3">
          {rooms.slice(0, 6).map((r) => (
            <li key={r.room_id}>
              {r.slug ? (
                <Link
                  href={`/rooms/${r.slug}`}
                  className="group flex items-baseline gap-4 border-b border-border/10 hover:border-border/40 pb-3 last:border-0 transition-colors duration-500"
                >
                  <span className="font-serif text-base text-cream group-hover:text-cream/80 transition-colors duration-500 flex-1">
                    {r.name ?? r.slug}
                  </span>
                  <span className="text-xs text-tobacco">→</span>
                </Link>
              ) : (
                <div className="flex items-baseline gap-4 border-b border-border/10 pb-3 last:border-0">
                  <span className="font-serif text-base text-cream flex-1">
                    {r.name ?? r.room_id}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function SharedTraitsSection({
  traits,
}: {
  traits: Extract<CompatibilityEnvelope, { state: 'ready' }>['shared_traits']
}) {
  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">
          Shared listening posture
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
          {traits.slice(0, 6).map((t) => {
            const display = TRAIT_DISPLAY[t.trait_key as TraitKey]
            if (!display) return null
            return (
              <div key={t.trait_key} className="min-w-0">
                <p className="text-sm text-cream uppercase tracking-[0.15em] mb-1">
                  {display.label}
                </p>
                <p className="text-xs text-tobacco/70 uppercase tracking-[0.15em]">
                  you {t.my_band} · them {t.their_band}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function DivergenceSection({
  points,
}: {
  points: Extract<
    CompatibilityEnvelope,
    { state: 'ready' }
  >['divergence_points']
}) {
  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10 bg-card/20">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          Where you diverge
        </h2>
        <p className="text-xs text-muted-foreground italic mb-8">
          Differences are observations, not problems.
        </p>
        <ul className="space-y-4">
          {points.slice(0, 4).map((d) => {
            const display = TRAIT_DISPLAY[d.trait_key as TraitKey]
            if (!display) return null
            return (
              <li
                key={d.trait_key}
                className="flex items-baseline gap-4 border-b border-border/10 pb-3 last:border-0"
              >
                <span className="font-serif text-base text-cream flex-1">
                  {display.label}
                </span>
                <span className="text-xs text-tobacco/70 uppercase tracking-[0.15em] shrink-0">
                  you {d.my_band} · them {d.their_band}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function FreshnessFooter({
  computedAt,
  algorithmVersion,
}: {
  computedAt: string
  algorithmVersion: string
}) {
  return (
    <section className="px-6 py-10 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-2xl mx-auto flex items-baseline justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
        <span>Updated {relativeTimeAgo(computedAt)}</span>
        <span>{algorithmVersion}</span>
      </div>
    </section>
  )
}

// Suppress unused-import false positives — TraitBand is referenced
// transitively via the envelope shape.
type _BandRef = TraitBand
