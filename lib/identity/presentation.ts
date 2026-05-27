import type { TraitBand, TraitKey } from './traits'

/**
 * lib/identity/presentation.ts — Phase 6A.7
 *
 * Pure formatting helpers for the identity UI. Translates the
 * machine-shaped trait/archetype data from Layer 5 into display
 * strings the UI can render without inventing copy.
 *
 * Architectural rules (Phase 6A.7 design constraints):
 *   - All descriptions are OBSERVATIONAL, not personality copy.
 *     "You listen mostly after dark" — yes.
 *     "You're a midnight soul" — no.
 *   - Per-trait descriptions are scoped to band (low/medium/high)
 *     so the UI can show different copy for different scores without
 *     branching.
 *   - All strings are static — no AI generation, no LLM inference,
 *     no random selection. Same trait + band → same string.
 *   - Tone is restrained. No exclamation points. No emoji. No
 *     "you are…" framing. The UI shows the listening pattern; the
 *     user supplies the interpretation.
 *
 * When you add a trait in lib/identity/traits.ts, add its display
 * metadata here too. The components in components/identity-profile-
 * screen.tsx read these maps directly.
 */

interface TraitDisplay {
  /** Display name. Short. Title-case noun phrase, not adjective. */
  label: string
  /** One-line behavioral framing, used as a subtitle. Tense:
   *  observational present, no second-person pronoun. */
  framing: string
  /** Per-band one-line descriptions. The band is the user's bucket;
   *  the string describes what that bucket LOOKS LIKE in listening
   *  behavior, not what it MEANS about the person. */
  bandCopy: Record<TraitBand, string>
}

export const TRAIT_DISPLAY: Record<TraitKey, TraitDisplay> = {
  obscurity_score: {
    label: 'Obscurity',
    framing: 'How well-known your top artists are.',
    bandCopy: {
      low: 'Artists with broad public reach.',
      medium: 'A mix of well-known and lesser-played names.',
      high: 'Artists with smaller audiences.',
      unknown: 'No popularity data yet.',
    },
  },
  exploratory_score: {
    label: 'Exploration',
    framing: 'How many different artists appear in recent listening.',
    bandCopy: {
      low: 'A small recent rotation; familiar names.',
      medium: 'A balanced rotation across known and newer artists.',
      high: 'Many different artists across recent plays.',
      unknown: 'Not enough recent listening to tell.',
    },
  },
  album_focus_score: {
    label: 'Album focus',
    framing: 'Saved albums vs. saved tracks.',
    bandCopy: {
      low: 'Library leans toward individual tracks.',
      medium: 'Mix of saved tracks and saved albums.',
      high: 'Saves whole albums.',
      unknown: 'No saved library data yet.',
    },
  },
  nocturnal_score: {
    label: 'Nocturnal',
    framing: 'Fraction of plays after dark (22:00–06:00 UTC).',
    bandCopy: {
      low: 'Mostly daytime listening.',
      medium: 'Listening spans day and night.',
      high: 'Listening concentrates in the late hours.',
      unknown: 'No recent listening to chart.',
    },
  },
  recency_bias_score: {
    label: 'Recency',
    framing: 'How concentrated listening is in the last 30 days.',
    bandCopy: {
      low: 'Listening spans across long stretches of time.',
      medium: 'Recent plays and older catalog roughly balanced.',
      high: 'Listening is concentrated in the last month.',
      unknown: 'Not enough plays to compare windows.',
    },
  },
  genre_breadth_score: {
    label: 'Breadth',
    framing: 'Number of distinct canonical genres in your graph.',
    bandCopy: {
      low: 'A focused set of genres.',
      medium: 'A handful of genres at comparable depth.',
      high: 'Listening spans many genres.',
      unknown: 'Not enough genre data yet.',
    },
  },
  consistency_score: {
    label: 'Consistency',
    framing: 'How much one genre dominates the listening graph.',
    bandCopy: {
      low: 'No single genre dominates.',
      medium: 'A top genre stands out, with several close behind.',
      high: 'One genre carries most of the listening.',
      unknown: 'Not enough genre data yet.',
    },
  },
}

/**
 * Confidence label. Used instead of a raw percentage so the UI
 * doesn't promise more precision than the heuristic deserves.
 */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'Strong match'
  if (confidence >= 0.65) return 'Clear match'
  if (confidence >= 0.4) return 'Emerging match'
  return 'Tentative'
}

/**
 * Position 1..3 on the 3-position band scale. NULL band → 0
 * (rendered as "no signal yet" in the UI). The numeric position
 * is what the band bar component uses to light up segments.
 */
export function bandPosition(band: TraitBand | null | undefined): 0 | 1 | 2 | 3 {
  switch (band) {
    case 'low':
      return 1
    case 'medium':
      return 2
    case 'high':
      return 3
    default:
      return 0
  }
}

/**
 * "Updated 3 hours ago" relative-time formatter. Stable enough for
 * the freshness footer; no need for date-fns just for this.
 */
export function relativeTimeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'unknown'
  const seconds = Math.max(0, Math.round((now.getTime() - t) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.round(days / 365)
  return `${years}y ago`
}
