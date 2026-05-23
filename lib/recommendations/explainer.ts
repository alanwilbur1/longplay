/**
 * lib/recommendations/explainer.ts
 *
 * Turns the scorer's structured factors into a single grounded
 * sentence. Examples (per Phase 4.2 spec):
 *
 *   "Fits your late-night listening pattern and preference for
 *    reflective albums."
 *   "Recommended because you chose quiet/solitary listening moments."
 *   "A good first room because it is active, public, and album-focused."
 *
 * Rules:
 *   - No fake poetry. No vague emotional claims. No fake certainty.
 *   - Cite the actual factor that scored highest.
 *   - When two factors tie, combine them with "and".
 */

import type { ExplanationFactor } from './types'

export function explainFactors(factors: ExplanationFactor[]): string {
  if (factors.length === 0) {
    return 'Recommended for first-time listeners.'
  }

  // Sort by descending contribution, then take the most informative.
  const sorted = [...factors].sort((a, b) => b.weight - a.weight)

  const top = sorted[0]
  const second = sorted[1]

  // Most-informative factor drives the lead clause.
  let lead = leadClause(top)

  // If a second factor is meaningfully strong (≥40% of top), append.
  if (second && second.weight >= top.weight * 0.4 && second.kind !== top.kind) {
    lead += ` ${connector(top.kind, second.kind)} ${tailClause(second)}.`
    return lead
  }
  return lead + '.'
}

function leadClause(f: ExplanationFactor): string {
  switch (f.kind) {
    case 'genre-match':
      return `Matches what you already listen to (${f.detail})`
    case 'canonical-genre-match':
      return `Matches what you already listen to (${f.detail})`
    case 'enriched-genre-match':
      return `Aligns with related genres in your library (${f.detail})`
    case 'affinity-tag-match':
      return `Fits the listening affinities we've noticed (${f.detail})`
    case 'artist-match':
      return `Features ${f.detail}, who is in your top artists`
    case 'recency-boost':
      return `Close to what you've been playing lately`
    case 'mood-match':
      return `Fits the listening moods you described (${f.detail})`
    case 'context-match':
      return `Aligned with when you reach for music — ${f.detail}`
    case 'energy-match':
      return `Energy level matches your calibration (${f.detail})`
    case 'featured':
      return 'Currently featured by the curators'
    case 'first-room-friendly':
      return 'A good first room — public, album-focused, and active'
    case 'popular':
      return `Active community (${f.detail})`
  }
}

function tailClause(f: ExplanationFactor): string {
  switch (f.kind) {
    case 'genre-match':
      return `overlaps with your top genres (${f.detail})`
    case 'canonical-genre-match':
      return `overlaps with your top genres (${f.detail})`
    case 'enriched-genre-match':
      return `overlaps with related genres from your library (${f.detail})`
    case 'affinity-tag-match':
      return `your affinities (${f.detail}) are central here`
    case 'artist-match':
      return `${f.detail} is featured in the current cycle`
    case 'recency-boost':
      return `it's close to what you've been playing lately`
    case 'mood-match':
      return `the moods you chose (${f.detail}) are central here`
    case 'context-match':
      return `aligns with when you listen (${f.detail})`
    case 'energy-match':
      return `the energy matches (${f.detail})`
    case 'featured':
      return 'currently featured'
    case 'first-room-friendly':
      return 'and it is public + album-focused'
    case 'popular':
      return `${f.detail} are already inside`
  }
}

function connector(_a: ExplanationFactor['kind'], _b: ExplanationFactor['kind']): string {
  return 'and'
}
