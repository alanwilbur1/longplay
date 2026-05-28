import { cn } from '@/lib/utils'
import type { CycleEcology, VisibleReflection } from '@/lib/data/ritual'

/**
 * components/ritual/ritual-ecology-section.tsx — Phase 6B.3
 *
 * "This Week in the Room" — quiet communal evidence that other
 * listeners inhabit this cycle. NOT a feed. NOT a dashboard.
 *
 * Two columns on desktop:
 *   LEFT — Editorial observations
 *     · Headline count line ("8 listeners are in this cycle…")
 *     · 0-2 observational signals derived from real participation
 *       and reflection timing data (lib/ritual/observations.ts).
 *     · Suppresses entirely when the cycle has no participation
 *       (ecology.observations.length === 0).
 *
 *   RIGHT — "From the Room" — published peer reflections rendered
 *     as marginalia. Italic serif, pull-quote glyph, quiet date.
 *     No avatars. No usernames. No timestamps beyond month-day.
 *     Bounded at 5 excerpts; the rest stay in the cycle's archive.
 *
 * If both halves are empty, the entire section returns null —
 * authentic sparsity over fake richness.
 */

export interface RitualEcologySectionProps {
  ecology: CycleEcology
  /** Peer-visible published reflections for the active cycle. The
   *  caller passes the same array used by the hero composer — we
   *  filter for `is_own === false` here so the user's own reflection
   *  doesn't appear in the communal column. */
  reflections: VisibleReflection[]
  /** Visual tokens from the room's aesthetic system so the section
   *  composes with the room's identity rather than against it. */
  aesthetics: {
    borderTint: string
    primaryAccent: string
  }
  /** Whether the ritual cycle is currently in its reflection window
   *  or archived. Peer reflections only render in those states —
   *  mirrors the RLS gate on ritual_reflections. */
  reflectionWindowOpen: boolean
}

const MAX_PEER_EXCERPTS = 5

export function RitualEcologySection({
  ecology,
  reflections,
  aesthetics,
  reflectionWindowOpen,
}: RitualEcologySectionProps) {
  const peerReflections = reflections
    .filter((r) => !r.is_own && r.reflection_state === 'published')
    .slice(0, MAX_PEER_EXCERPTS)

  const hasObservations = ecology.observations.length > 0
  const hasPeerReflections = reflectionWindowOpen && peerReflections.length > 0

  // Authentic sparsity: render nothing when there is nothing real
  // to say. The hero above already communicates the cycle exists.
  if (!hasObservations && !hasPeerReflections) return null

  return (
    <section
      className={cn(
        'px-6 py-14 md:px-12 lg:px-24 md:py-20 border-t',
        aesthetics.borderTint,
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-12 md:gap-16 items-start max-w-6xl">
        <EditorialObservations
          ecology={ecology}
          aesthetics={aesthetics}
          renderHeader={hasObservations}
        />
        <FromTheRoom
          reflections={peerReflections}
          aesthetics={aesthetics}
          reflectionWindowOpen={reflectionWindowOpen}
          totalAvailable={
            reflections.filter(
              (r) => !r.is_own && r.reflection_state === 'published',
            ).length
          }
        />
      </div>
    </section>
  )
}

// ── Left: editorial observations ──────────────────────────────────

function EditorialObservations({
  ecology,
  aesthetics,
  renderHeader,
}: {
  ecology: CycleEcology
  aesthetics: RitualEcologySectionProps['aesthetics']
  renderHeader: boolean
}) {
  // When there are no observations (empty cycle on this side but
  // peer reflections rendering on the other), we keep the column
  // present but quiet — a single anchor line — to preserve the
  // two-column hero composition.
  if (!renderHeader) {
    return (
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-6">
          This Week in the Room
        </p>
        <p className="text-sm text-muted-foreground/50 italic">
          Quiet so far.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-8">
        This Week in the Room
      </p>
      <ul className="space-y-5">
        {ecology.observations.map((line, i) => (
          <li
            key={i}
            className={cn(
              'font-serif leading-relaxed',
              // First observation reads as the headline — slightly
              // larger, fuller weight. Subsequent observations are
              // smaller marginalia.
              i === 0
                ? 'text-xl text-cream/85'
                : 'text-base text-cream/65 italic',
            )}
          >
            {line}
          </li>
        ))}
      </ul>
      {/* Slim, ambient accent rule — composes with the room aesthetic
          but doesn't draw a hard card boundary. */}
      <div
        className={cn(
          'h-px w-12 mt-10',
          aesthetics.primaryAccent
            .replace('text-', 'bg-')
            .replace('/70', '/30')
            .replace('/80', '/30'),
        )}
        aria-hidden
      />
    </div>
  )
}

// ── Right: from the room ──────────────────────────────────────────

function FromTheRoom({
  reflections,
  aesthetics,
  reflectionWindowOpen,
  totalAvailable,
}: {
  reflections: VisibleReflection[]
  aesthetics: RitualEcologySectionProps['aesthetics']
  reflectionWindowOpen: boolean
  totalAvailable: number
}) {
  if (!reflectionWindowOpen) {
    // Pre-reflection state. We don't show peer reflections — even if
    // some exist as drafts elsewhere, the cycle hasn't opened the
    // window. Render a quiet anchor line so the column doesn't sit
    // empty on the page.
    return (
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-6">
          From the Room
        </p>
        <p className="text-sm text-muted-foreground/50 italic">
          Reflections appear once the reflection window opens.
        </p>
      </div>
    )
  }

  if (reflections.length === 0) {
    return (
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-6">
          From the Room
        </p>
        <p className="text-sm text-muted-foreground/50 italic">
          No reflections yet.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-8">
        From the Room
      </p>
      <div className="space-y-10">
        {reflections.map((r) => (
          <Marginalia key={r.id} reflection={r} aesthetics={aesthetics} />
        ))}
      </div>
      {totalAvailable > reflections.length && (
        <p className="text-[10px] text-muted-foreground/40 italic mt-10">
          {totalAvailable - reflections.length} more in the archive.
        </p>
      )}
    </div>
  )
}

function Marginalia({
  reflection,
  aesthetics,
}: {
  reflection: VisibleReflection
  aesthetics: RitualEcologySectionProps['aesthetics']
}) {
  // Editorial pull-quote treatment. Hanging quote glyph in the
  // room's accent color (heavily faded). Body in italic serif.
  // Date is small, mono, muted — never the focus.
  return (
    <figure className="relative pl-8 md:pl-10">
      <span
        aria-hidden
        className={cn(
          'absolute left-0 top-0 font-serif text-5xl leading-none select-none',
          aesthetics.primaryAccent,
          'opacity-30',
        )}
      >
        &ldquo;
      </span>
      <blockquote className="font-serif text-lg md:text-xl text-cream/80 leading-relaxed italic whitespace-pre-wrap">
        {reflection.body}
      </blockquote>
      <figcaption className="mt-4 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 font-mono">
        {formatShortDate(reflection.created_at)}
      </figcaption>
    </figure>
  )
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}
