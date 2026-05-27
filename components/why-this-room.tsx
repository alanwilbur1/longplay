'use client'

import { useEffect, useState } from 'react'
import {
  readRoomAffinityForUser,
  type RoomAffinityEnvelope,
} from '@/lib/actions/room-affinity'
import {
  affinityBandLabel,
  factorGroupLabel,
  factorKindLabel,
  groupFactorsForDisplay,
} from '@/lib/recommendations/explanation'
import { relativeTimeAgo } from '@/lib/identity/presentation'

/**
 * WhyThisRoom — Phase 6A.8
 *
 * Renders the user's explanation envelope for one room. Designed to
 * be dropped into:
 *   - the room detail page (`components/room-detail-screen.tsx`)
 *   - the recommendation card overlay (future)
 *
 * Reads the Layer 4 cache via the cookie-aware server action; ALL
 * states are handled so the component is safe to render
 * unconditionally — it returns null for envelopes where there's
 * nothing meaningful to show (unauthenticated, unknown room, no
 * affinity).
 *
 * Design rules (Phase 6A.8 constraints):
 *   - Restrained visual language. Factor list, not analytics grid.
 *   - Qualitative band ("Strong match", "Clear match", etc.) not raw
 *     percentage.
 *   - Honest about staleness — stale envelopes render a quiet
 *     freshness notice rather than pretending the cached factors are
 *     current.
 *   - No fabricated reasoning. Every label + detail comes from the
 *     scorer's structured factor breakdown.
 */

interface WhyThisRoomProps {
  roomSlug: string
  /** Visual variant. "section" is for room-detail-screen (wide, full
   *  factor breakdown). "compact" is for recommendation cards
   *  (tight, top 2-3 factors only). */
  variant?: 'section' | 'compact'
}

export function WhyThisRoom({
  roomSlug,
  variant = 'section',
}: WhyThisRoomProps) {
  const [envelope, setEnvelope] = useState<RoomAffinityEnvelope | null>(null)

  useEffect(() => {
    let cancelled = false
    readRoomAffinityForUser(roomSlug)
      .then((env) => {
        if (!cancelled) setEnvelope(env)
      })
      .catch(() => {
        if (!cancelled) setEnvelope(null)
      })
    return () => {
      cancelled = true
    }
  }, [roomSlug])

  if (!envelope) return null

  // Three states that render nothing — the "Why this room?" surface
  // only appears when there's a fresh cached row with factors.
  if (
    envelope.state === 'unauthenticated' ||
    envelope.state === 'unknown_room' ||
    envelope.state === 'no_affinity'
  ) {
    return null
  }

  if (envelope.state === 'stale') {
    return variant === 'section' ? <StaleNotice /> : null
  }

  return variant === 'section' ? (
    <ReadySection envelope={envelope} />
  ) : (
    <ReadyCompact envelope={envelope} />
  )
}

// ── Ready: full section (room detail page) ────────────────────────

function ReadySection({
  envelope,
}: {
  envelope: Extract<RoomAffinityEnvelope, { state: 'ready' }>
}) {
  const groups = groupFactorsForDisplay(envelope.factor_breakdown)
  if (groups.length === 0) {
    // Score exists but no positive-weight factors — rare; nothing
    // meaningful to surface beyond the band.
    return (
      <div className="border-l-2 border-tobacco/30 pl-6 py-4">
        <p className="text-xs uppercase tracking-[0.2em] text-tobacco/70 mb-2">
          {affinityBandLabel(envelope.band)}
        </p>
        <p className="text-sm text-cream/60">
          No prominent factors recorded for this match.
        </p>
      </div>
    )
  }
  return (
    <div className="border-l-2 border-tobacco/30 pl-6 py-4">
      <div className="flex items-baseline justify-between gap-4 mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-tobacco/70">
          Why this room
        </p>
        <p className="text-xs uppercase tracking-[0.15em] text-cream/60">
          {affinityBandLabel(envelope.band)}
        </p>
      </div>
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
              {factorGroupLabel(g.group)}
            </p>
            <ul className="space-y-2">
              {g.factors.map((f, i) => (
                <li
                  key={`${f.kind}-${i}`}
                  className="flex items-baseline gap-3"
                >
                  <span className="font-serif text-sm text-cream/90 shrink-0">
                    {factorKindLabel(f.kind)}
                  </span>
                  {f.detail && (
                    <span className="text-sm text-cream/60 leading-relaxed">
                      {f.detail}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
        Updated {relativeTimeAgo(envelope.computed_at)}
      </p>
    </div>
  )
}

// ── Ready: compact (recommendation card) ──────────────────────────

function ReadyCompact({
  envelope,
}: {
  envelope: Extract<RoomAffinityEnvelope, { state: 'ready' }>
}) {
  // Top 3 factors regardless of group; deterministic by weight desc.
  const groups = groupFactorsForDisplay(envelope.factor_breakdown)
  const flat = groups.flatMap((g) => g.factors).slice(0, 3)
  if (flat.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {flat.map((f, i) => (
        <span
          key={`${f.kind}-${i}`}
          className="text-[10px] uppercase tracking-[0.15em] text-tobacco/80 border border-tobacco/20 px-2 py-0.5"
        >
          {factorKindLabel(f.kind)}
        </span>
      ))}
    </div>
  )
}

// ── Stale notice ──────────────────────────────────────────────────

function StaleNotice() {
  return (
    <div className="border-l-2 border-burgundy/30 pl-6 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-burgundy/70 mb-2">
        Match details refreshing
      </p>
      <p className="text-sm text-cream/60 leading-relaxed">
        The scoring formula recently changed. Your match for this room
        will update on the next sync.
      </p>
    </div>
  )
}
