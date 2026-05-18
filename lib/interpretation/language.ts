/**
 * lib/interpretation/language.ts — Phase 3G
 *
 * Literary copy generators for restrained / uncertain states. Surfaces
 * use these in place of fabricated certainty. Same discipline as
 * lib/cadence/language and lib/memory/language: copy lives here, not
 * in components.
 *
 * Two usage patterns:
 *
 *   1. Hard silence (preferred default).
 *      When `assess(...).eligible === false`, the surface renders
 *      nothing. No apology, no "coming soon", no skeleton.
 *
 *   2. Soft uncertainty (opt-in).
 *      When a surface wants to acknowledge that something is forming
 *      but not yet readable, it can call one of the helpers below.
 *      Used sparingly — usually the right choice is still silence.
 *
 * Every helper accepts a `subject` string so a single phrase template
 * composes across surfaces: "Your {subject} is still too quiet to
 * read clearly."
 *
 * Tone discipline:
 *   - No "coming soon", "we're working on it", "stay tuned".
 *   - No second-person diagnoses ("you are...", "you tend to...").
 *   - No promises about what the system WILL know.
 *   - Literary, observational, restrained.
 */

import type { Confidence } from './types'

// ── Hard-silence helpers (preferred) ─────────────────────────────────────────
// These return literary phrases for the rare cases where a surface
// must acknowledge absence rather than render nothing. Default to
// hard silence (no render) instead — use these only when the absence
// itself would feel like a missing system.

export function insufficientEvidenceLine(subject: string): string {
  return `Your ${subject} is still too quiet to read clearly.`
}

export function timeStillPassingLine(): string {
  return 'Not enough time has passed yet.'
}

export function dormantLine(): string {
  return 'It has been a while. The room remembers older shapes of you.'
}

export function contradictoryLine(subject: string): string {
  return `Your ${subject} is sending mixed signals just now.`
}

// ── Soft-uncertainty helpers (opt-in) ───────────────────────────────────────
// For surfaces that want a faint observational line in place of either
// silence or a confident interpretation. Each returns null when no
// observation is appropriate for the given confidence level — callers
// can chain to silence.

export function emergingPatternLine(subject: string): string | null {
  return `A tendency around ${subject} may be forming. It is still faint.`
}

export function recurringTendencyLine(subject: string): string | null {
  return `${subject} is beginning to recur in your listening.`
}

export function strongLongitudinalLine(subject: string): string | null {
  return `Over time, ${subject} has held in your listening.`
}

// ── Confidence → phrase router ──────────────────────────────────────────────
// Surfaces that want a single phrase for an internal confidence level
// can call this directly. Returns null for confidence levels that
// should produce silence rather than soft language.

export function phraseForConfidence(
  confidence: Confidence,
  subject: string,
): string | null {
  switch (confidence) {
    case 'insufficient':
      return null // default: silence; surface may call insufficientEvidenceLine if it must speak
    case 'weak-signal':
      return null // weak signals should rarely speak; default to silence
    case 'emerging-pattern':
      return emergingPatternLine(subject)
    case 'recurring-tendency':
      return recurringTendencyLine(subject)
    case 'strong-longitudinal':
      return strongLongitudinalLine(subject)
    case 'contradictory':
      return contradictoryLine(subject)
    case 'dormant':
      return dormantLine()
    case 'ambiguous':
      return null // ambiguity defaults to silence
  }
}
