import type {
  ArchetypeTransition,
  DriftSummary,
  TraitDriftEntry,
} from './drift'
import { TRAIT_DISPLAY } from './presentation'
import type { TraitKey } from './traits'

/**
 * lib/identity/drift-presentation.ts — Phase 6A.9
 *
 * Pure helpers that turn a DriftSummary into UI-ready display text.
 * No DB, no React, no LLM. Same drift input → same strings, every
 * render.
 *
 * Design rules:
 *   - Observational tone. "Exploratory listening increased." NOT
 *     "You're discovering new music!"
 *   - No exclamation points, no emojis, no second-person
 *     superlatives.
 *   - Threshold-aware copy — if a trait moved by 0.16 we say
 *     "increased"; we don't claim "transformed".
 *   - Each function returns a small set of structured strings; the
 *     rendering layer can decide how many to show without inventing
 *     extra copy.
 */

// ── Trait drift sentences ────────────────────────────────────────

/**
 * "Exploratory listening increased." / "Album focus eased."
 * Verb choice by direction; subject from TRAIT_DISPLAY.label.
 *
 * Magnitude qualifier:
 *   delta >= 0.30  → "rose noticeably"  / "eased noticeably"
 *   delta >= 0.20  → "rose"             / "eased"
 *   delta >= 0.15  → "edged up"         / "edged down"
 *
 * Anything below 0.15 doesn't reach computeDrift's threshold so we
 * never see those cases here.
 */
export function traitDriftSentence(entry: TraitDriftEntry): string {
  const label = TRAIT_DISPLAY[entry.trait_key as TraitKey]?.label
  if (!label) return ''
  const m = Math.abs(entry.delta)
  const rising = entry.delta > 0
  let verb: string
  if (m >= 0.3) verb = rising ? 'rose noticeably' : 'eased noticeably'
  else if (m >= 0.2) verb = rising ? 'rose' : 'eased'
  else verb = rising ? 'edged up' : 'edged down'
  return `${label} ${verb}.`
}

// ── Archetype transition sentence ────────────────────────────────

/**
 * "The Nocturnal Explorer → The Album Loyalist."
 * Both labels present → arrow form.
 * Only one side present → "Now: …" or "Last identified: …".
 */
export function archetypeTransitionSentence(
  t: ArchetypeTransition,
): string {
  const from = t.from_label
  const to = t.to_label
  if (from && to) return `${from} → ${to}`
  if (to && !from) return `Now: ${to}`
  if (from && !to) return `Last identified: ${from}`
  return ''
}

// ── One-line summary of an entire drift ──────────────────────────

/**
 * Builds 1-3 short observational lines from a DriftSummary. Returns
 * an empty array when nothing meaningful happened (UI can render
 * the timeline row without a drift block).
 *
 * Selection priority (most-informative first):
 *   1. Archetype transition (if present)
 *   2. Top 2 rising / falling traits by |delta|
 *   3. Emerging genres summary (if any)
 *
 * Capped at 3 lines so timeline rows stay scannable.
 */
export function driftSummaryLines(drift: DriftSummary): string[] {
  const lines: string[] = []

  if (drift.archetype_transition) {
    const s = archetypeTransitionSentence(drift.archetype_transition)
    if (s) lines.push(s)
  }

  // Top traits by |delta|. computeDrift already sorted these.
  const topTraits: TraitDriftEntry[] = []
  for (const t of drift.rising_traits) topTraits.push(t)
  for (const t of drift.falling_traits) topTraits.push(t)
  topTraits.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  for (const t of topTraits.slice(0, 2)) {
    if (lines.length >= 3) break
    const s = traitDriftSentence(t)
    if (s) lines.push(s)
  }

  // Emerging genres — only mention when 1-2 new ones appeared.
  // Avoid listing >2 so the timeline row stays compact.
  if (
    drift.emerging_genres.length > 0 &&
    lines.length < 3 &&
    !drift.archetype_transition // covered above
  ) {
    const names = drift.emerging_genres
      .slice(0, 2)
      .map((g) => g.genre)
      .join(', ')
    lines.push(`New in top genres: ${names}.`)
  }

  return lines
}

// ── Window-days framing ──────────────────────────────────────────

/**
 * Lifestyle copy for "the drift happened over N days". Used in the
 * row subhead. Returns 'recently' for very-short windows where day
 * counts feel misleading.
 *
 *   1-2 days   → "since yesterday" / "since 2 days ago"
 *   3-13 days  → "over the last N days"
 *   14-29 days → "over the last N weeks"
 *   30-89 days → "over the last month" / "N months"
 *   90+ days   → "over the last quarter" / "N months"
 */
export function windowDaysPhrase(days: number): string {
  if (!Number.isFinite(days) || days <= 0) return 'recently'
  if (days === 1) return 'since yesterday'
  if (days <= 2) return `since ${days} days ago`
  if (days < 14) return `over the last ${days} days`
  if (days < 30) {
    const weeks = Math.round(days / 7)
    return `over the last ${weeks} week${weeks === 1 ? '' : 's'}`
  }
  if (days < 90) {
    const months = Math.max(1, Math.round(days / 30))
    return `over the last ${months} month${months === 1 ? '' : 's'}`
  }
  const months = Math.round(days / 30)
  return `over the last ${months} months`
}
