'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { readMyListenerIdentity } from '@/lib/actions/identity'
import type {
  IdentityArchetype,
  IdentityEnvelope,
  IdentitySupportingTrait,
  IdentityTrait,
} from '@/lib/actions/identity'
import {
  TRAIT_DISPLAY,
  bandPosition,
  confidenceLabel,
  relativeTimeAgo,
} from '@/lib/identity/presentation'
import { ARCHETYPE_CATALOG } from '@/lib/identity/archetypes'
import { IdentityHistoryTimeline } from '@/components/identity-history-timeline'
import type { TraitBand, TraitKey } from '@/lib/identity/traits'

/**
 * IdentityProfileScreen — Phase 6A.7
 *
 * Surfaces the Layer 5 identity substrate (listener_identity_traits +
 * listener_archetype_snapshots) for the calling user.
 *
 * Design principles (Phase 6A.7 constraints — restated here so the
 * file documents its own constraints alongside its code):
 *   - The UI REVEALS identity. It does not INVENT it.
 *   - Tone is observational, not personality-coded. No "you are…"
 *     copy, no horoscope language, no AI prose.
 *   - Confidence is shown as a qualitative label, not a percentage.
 *   - Users with insufficient data see a grounded "identity forming"
 *     state, not a fabricated archetype.
 *   - All copy is static, sourced from lib/identity/presentation.ts
 *     and lib/identity/archetypes.ts catalogs. Same inputs → same
 *     output, every render.
 *
 * Architecture: client component that calls the readMyListenerIdentity
 * server action once on mount. Branches on envelope.state to decide
 * which surface to render. No client-side scoring; no hardcoded
 * archetype copy beyond the catalog descriptions.
 */

const ARCHETYPE_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  ARCHETYPE_CATALOG.map((a) => [a.key, a.description]),
)

export function IdentityProfileScreen() {
  const [envelope, setEnvelope] = useState<IdentityEnvelope | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    readMyListenerIdentity()
      .then((env) => {
        if (!cancelled) setEnvelope(env)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load identity')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <IdentityErrorState message={error} />
  }
  if (!envelope) {
    return <IdentityLoadingState />
  }
  if (envelope.state === 'unauthenticated') {
    return <IdentityUnauthenticatedState />
  }
  if (envelope.state === 'forming') {
    return (
      <IdentityFormingState
        hasConnection={envelope.has_connection}
        hasPartialTraits={envelope.has_partial_traits}
      />
    )
  }
  return <IdentityReadyState envelope={envelope} />
}

// ── States ────────────────────────────────────────────────────────

function IdentityLoadingState() {
  return (
    <div className="grain relative min-h-[60vh] flex items-center justify-center px-6 py-24">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground animate-fade-in">
        Loading…
      </p>
    </div>
  )
}

function IdentityErrorState({ message }: { message: string }) {
  return (
    <div className="grain relative min-h-[60vh] flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-burgundy mb-4">
          Identity unavailable
        </p>
        <p className="text-sm text-cream/70">{message}</p>
      </div>
    </div>
  )
}

function IdentityUnauthenticatedState() {
  return (
    <div className="grain relative min-h-[60vh] flex items-center justify-center px-6 py-24">
      <div className="max-w-md text-center">
        <h2 className="font-serif text-2xl text-cream mb-4">
          Sign in to see your listening identity
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

/**
 * Forming state: the user has no archetype snapshot yet. Three
 * sub-cases drive the copy — see lib/actions/identity.ts for the
 * envelope shape.
 *
 *   no connection           → ask them to connect Spotify
 *   connection, no traits   → first sync hasn't landed
 *   connection, partial     → traits exist but no archetype cleared
 *                              the confidence threshold yet
 *
 * Never fabricates an archetype. The page is honest about what we
 * don't know yet.
 */
function IdentityFormingState({
  hasConnection,
  hasPartialTraits,
}: {
  hasConnection: boolean
  hasPartialTraits: boolean
}) {
  const heading = !hasConnection
    ? 'Your listening identity is waiting on data.'
    : 'Your listening identity is still forming.'

  const subtext = !hasConnection
    ? 'Connect a listening source so LongPlay can read your listening behavior. Identity is derived from real plays — no playlist surveys, no personality quizzes.'
    : hasPartialTraits
      ? 'A few traits are visible already, but no archetype has cleared confidence yet. Continued listening strengthens the signal.'
      : 'Your first sync is still being processed. Identity will appear here once enough listening data has landed.'

  return (
    <div className="grain relative pb-32 md:pb-16 md:pt-24">
      <section className="relative min-h-[60vh] flex items-center justify-center px-6 py-24">
        <div className="max-w-xl mx-auto text-center animate-fade-in-slow">
          <div className="mb-10 inline-flex">
            <FormingGlyph />
          </div>
          <h1 className="font-serif text-3xl md:text-4xl text-cream/90 leading-tight mb-6">
            {heading}
          </h1>
          <p className="text-base text-cream/60 leading-relaxed max-w-md mx-auto mb-10">
            {subtext}
          </p>
          {!hasConnection && (
            <Link
              href="/profile"
              className="inline-flex items-center gap-2 text-sm text-tobacco hover:text-cream transition-colors duration-500 border-b border-tobacco/30 pb-1"
            >
              <span>Connect a listening source</span>
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * Ready state: primary archetype + supporting evidence + alternates
 * + full trait gallery. All copy comes from static catalogs in
 * lib/identity/{presentation,archetypes}.ts.
 */
function IdentityReadyState({
  envelope,
}: {
  envelope: Extract<IdentityEnvelope, { state: 'ready' }>
}) {
  const { primary, alternates, traits, computed_at, algorithm_version } =
    envelope

  return (
    <div className="grain relative pb-32 md:pb-16 md:pt-16">
      <ArchetypeHero archetype={primary} />
      <SupportingTraits archetype={primary} traits={traits} />
      {primary.supporting_genres.length > 0 && (
        <SupportingGenres genres={primary.supporting_genres} />
      )}
      {primary.supporting_rooms.length > 0 && (
        <SupportingRooms rooms={primary.supporting_rooms} />
      )}
      {alternates.length > 0 && <Alternates alternates={alternates} />}
      <TraitGallery traits={traits} />
      {/* Phase 6A.9: listening evolution timeline. Renders its own
          "forming" state on single-entry timelines; returns null
          entirely when the user has no history rows yet. */}
      <IdentityHistoryTimeline />
      <FreshnessFooter
        computedAt={computed_at}
        algorithmVersion={algorithm_version}
      />
    </div>
  )
}

// ── Sections ─────────────────────────────────────────────────────

function ArchetypeHero({ archetype }: { archetype: IdentityArchetype }) {
  const description = ARCHETYPE_DESCRIPTIONS[archetype.archetype_key] ?? ''
  return (
    <section className="relative px-6 py-24 md:py-32 md:px-12 lg:px-24">
      <div className="max-w-2xl mx-auto text-center animate-fade-in-up">
        <p className="text-xs uppercase tracking-[0.3em] text-tobacco/70 mb-6">
          {confidenceLabel(archetype.confidence_score)}
        </p>
        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-cream leading-[1.1] mb-8">
          {archetype.archetype_label}
        </h1>
        {description && (
          <p className="font-serif text-lg md:text-xl text-cream/70 italic leading-relaxed max-w-xl mx-auto">
            {description}
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * "Why this archetype" — supporting_traits from the archetype row,
 * each rendered as a band bar with framing copy. The contribution
 * value is what the matcher used; we render it as a subtle weight
 * indicator without a raw number.
 */
function SupportingTraits({
  archetype,
  traits,
}: {
  archetype: IdentityArchetype
  traits: IdentityTrait[]
}) {
  const traitsByKey = new Map<TraitKey, IdentityTrait>(
    traits.map((t) => [t.trait_key, t]),
  )
  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">
          Why this match
        </h2>
        <div className="space-y-6">
          {archetype.supporting_traits.map((st) => {
            const t = traitsByKey.get(st.trait_key as TraitKey)
            const band = t?.trait_band ?? 'unknown'
            return (
              <SupportingTraitRow
                key={st.trait_key}
                supporting={st}
                band={band}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}

function SupportingTraitRow({
  supporting,
  band,
}: {
  supporting: IdentitySupportingTrait
  band: TraitBand
}) {
  const display = TRAIT_DISPLAY[supporting.trait_key as TraitKey]
  if (!display) return null
  const copy = display.bandCopy[band]
  return (
    <div className="flex flex-col md:flex-row md:items-baseline md:gap-8">
      <div className="md:w-40 shrink-0 mb-2 md:mb-0">
        <p className="text-sm text-cream uppercase tracking-[0.15em]">
          {display.label}
        </p>
        <BandBar band={band} />
      </div>
      <p className="text-sm text-cream/70 leading-relaxed flex-1">{copy}</p>
    </div>
  )
}

function SupportingGenres({
  genres,
}: {
  genres: IdentityArchetype['supporting_genres']
}) {
  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">
          Strongest genres
        </h2>
        <ul className="space-y-3">
          {genres.map((g, i) => (
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
                weight {g.weighted_score.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function SupportingRooms({
  rooms,
}: {
  rooms: IdentityArchetype['supporting_rooms']
}) {
  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">
          Rooms this matches
        </h2>
        <ul className="space-y-3">
          {rooms.map((r) => (
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

function Alternates({ alternates }: { alternates: IdentityArchetype[] }) {
  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10 bg-card/20">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">
          Also matches
        </h2>
        <div className="space-y-6">
          {alternates.map((a) => {
            const description = ARCHETYPE_DESCRIPTIONS[a.archetype_key] ?? ''
            return (
              <div key={a.archetype_key}>
                <div className="flex items-baseline justify-between mb-2 gap-4">
                  <h3 className="font-serif text-xl text-cream">
                    {a.archetype_label}
                  </h3>
                  <span className="text-xs uppercase tracking-[0.15em] text-tobacco/70 shrink-0">
                    {confidenceLabel(a.confidence_score)}
                  </span>
                </div>
                {description && (
                  <p className="text-sm text-cream/60 leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function TraitGallery({ traits }: { traits: IdentityTrait[] }) {
  // Render in TRAIT_DISPLAY iteration order so the gallery is
  // deterministic per recompute. Filter to known trait_keys only.
  const known = traits.filter((t) => TRAIT_DISPLAY[t.trait_key])
  if (known.length === 0) return null
  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">
          Listening traits
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
          {known.map((t) => {
            const display = TRAIT_DISPLAY[t.trait_key]
            return (
              <div key={t.trait_key} className="min-w-0">
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-sm text-cream uppercase tracking-[0.15em]">
                    {display.label}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-tobacco/70">
                    {t.trait_band}
                  </p>
                </div>
                <BandBar band={t.trait_band} />
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  {display.framing}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FreshnessFooter({
  computedAt,
  algorithmVersion,
}: {
  computedAt: string | null
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

// ── Atomic visual elements ───────────────────────────────────────

function BandBar({ band }: { band: TraitBand }) {
  // 3-position scale. Position 0 (unknown) shows a flat track with no
  // active segment — visually honest about missing data.
  const pos = bandPosition(band)
  return (
    <div
      className="mt-3 flex items-center gap-1.5"
      role="meter"
      aria-valuemin={1}
      aria-valuemax={3}
      aria-valuenow={pos || undefined}
      aria-label={`Band: ${band}`}
    >
      {[1, 2, 3].map((p) => (
        <span
          key={p}
          className={
            'h-[3px] flex-1 transition-colors duration-700 ' +
            (pos >= p && pos > 0 ? 'bg-tobacco' : 'bg-border/30')
          }
        />
      ))}
    </div>
  )
}

function FormingGlyph() {
  // Restrained, atmospheric — same posture as DesignedFallback in
  // components/album-cover.tsx. Concentric circles suggest a record
  // still being read, no glyph clutter.
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className="w-12 h-12 text-cream/30"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1" />
      <circle
        cx="24"
        cy="24"
        r="14"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.6"
      />
      <circle
        cx="24"
        cy="24"
        r="6"
        stroke="currentColor"
        strokeWidth="0.5"
        opacity="0.4"
      />
      <circle cx="24" cy="24" r="1.5" fill="currentColor" opacity="0.6" />
    </svg>
  )
}
