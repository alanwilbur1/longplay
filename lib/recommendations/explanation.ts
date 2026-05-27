import type { ExplanationFactor } from './types'

/**
 * lib/recommendations/explanation.ts — Phase 6A.8
 *
 * Pure helpers that turn the scorer's structured ExplanationFactor[]
 * into UI-ready display metadata. No DB, no fetch, no LLM. The
 * existing lib/recommendations/explainer.ts produces a one-sentence
 * summary; this module produces the richer per-factor breakdown
 * components render alongside that sentence.
 *
 * Design rules (Phase 6A.8 constraints):
 *   - All copy is static. Same factor kind + detail → same label
 *     and same group, every render.
 *   - Tone is observational, not promotional. Labels describe
 *     "what overlaps", not "why you'll love it".
 *   - No raw percentages in the qualitative band — they imply
 *     precision the heuristic doesn't have.
 *   - Confidence bands use the same four-tier vocabulary as Layer 5
 *     (lib/identity/presentation.ts:confidenceLabel) for consistency
 *     across the identity + recommendation surfaces.
 */

/**
 * Qualitative band over the [0..N] room affinity score. The score
 * comes from scoreAllCandidates (Layer 4 cache or live) and is the
 * sum of weighted ExplanationFactor contributions — typical range
 * ~0..60 with featured / first-room-friendly factors. Bands are
 * tuned to that empirical distribution.
 */
export type AffinityBand = 'strong' | 'moderate' | 'emerging' | 'tentative'

export function affinityBand(score: number): AffinityBand {
  if (!Number.isFinite(score)) return 'tentative'
  if (score >= 30) return 'strong'
  if (score >= 18) return 'moderate'
  if (score >= 8) return 'emerging'
  return 'tentative'
}

/** Display label for the band. Pairs with confidenceLabel from Layer 5. */
export function affinityBandLabel(band: AffinityBand): string {
  switch (band) {
    case 'strong':
      return 'Strong match'
    case 'moderate':
      return 'Clear match'
    case 'emerging':
      return 'Emerging match'
    case 'tentative':
      return 'Soft match'
  }
}

/**
 * Grouping for the factor breakdown. Different kinds describe
 * different DIMENSIONS of resonance; UI can group them visually
 * (genres together, traits together, etc.) rather than as a flat
 * list. Keeps the surface scannable.
 */
export type FactorGroup =
  | 'genre' // canonical-genre-match, enriched-genre-match, genre-match (legacy)
  | 'trait' // affinity-tag-match, recency-boost, mood-match, energy-match, context-match
  | 'artist' // artist-match
  | 'editorial' // featured, first-room-friendly
  | 'community' // popular

export function factorGroup(kind: ExplanationFactor['kind']): FactorGroup {
  switch (kind) {
    case 'genre-match':
    case 'canonical-genre-match':
    case 'enriched-genre-match':
      return 'genre'
    case 'affinity-tag-match':
    case 'recency-boost':
    case 'mood-match':
    case 'energy-match':
    case 'context-match':
      return 'trait'
    case 'artist-match':
      return 'artist'
    case 'featured':
    case 'first-room-friendly':
      return 'editorial'
    case 'popular':
      return 'community'
  }
}

/**
 * Short label per kind — used as the row title in the factor list.
 * Same vocabulary as the existing scorer factor kinds; this layer is
 * just the display projection.
 */
export function factorKindLabel(kind: ExplanationFactor['kind']): string {
  switch (kind) {
    case 'genre-match':
    case 'canonical-genre-match':
      return 'Genre overlap'
    case 'enriched-genre-match':
      return 'Adjacent genres'
    case 'affinity-tag-match':
      return 'Listening affinities'
    case 'artist-match':
      return 'Artist overlap'
    case 'recency-boost':
      return 'Recent listening'
    case 'mood-match':
      return 'Mood alignment'
    case 'context-match':
      return 'Listening context'
    case 'energy-match':
      return 'Energy level'
    case 'featured':
      return 'Curator featured'
    case 'first-room-friendly':
      return 'Good first room'
    case 'popular':
      return 'Active community'
  }
}

/**
 * Top-N factors for display, sorted by weight desc with deterministic
 * tie-break (kind asc). Filters out zero-weight entries.
 */
export function topFactorsForDisplay(
  factors: ExplanationFactor[],
  max = 3,
): ExplanationFactor[] {
  const filtered = factors.filter((f) => f.weight > 0)
  const sorted = [...filtered].sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight
    return a.kind.localeCompare(b.kind)
  })
  return sorted.slice(0, max)
}

/**
 * Same factors, grouped by FactorGroup, preserving sort order within
 * each group. Drops empty groups. Useful for renderers that want
 * "Genres: …, Traits: …, Artists: …" laid out section-by-section
 * rather than a flat list.
 */
export interface FactorGroupBlock {
  group: FactorGroup
  factors: ExplanationFactor[]
}

export function groupFactorsForDisplay(
  factors: ExplanationFactor[],
): FactorGroupBlock[] {
  const filtered = factors.filter((f) => f.weight > 0)
  const buckets = new Map<FactorGroup, ExplanationFactor[]>()
  // Deterministic group ordering: genre → trait → artist → editorial → community.
  // This is the order most-informative-to-least-informative for the listener.
  const order: FactorGroup[] = [
    'genre',
    'trait',
    'artist',
    'editorial',
    'community',
  ]
  for (const f of filtered) {
    const g = factorGroup(f.kind)
    if (!buckets.has(g)) buckets.set(g, [])
    buckets.get(g)!.push(f)
  }
  // Sort within each group by weight desc + kind asc (matches
  // topFactorsForDisplay's tie-break).
  for (const arr of buckets.values()) {
    arr.sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight
      return a.kind.localeCompare(b.kind)
    })
  }
  const out: FactorGroupBlock[] = []
  for (const g of order) {
    const arr = buckets.get(g)
    if (arr && arr.length > 0) out.push({ group: g, factors: arr })
  }
  return out
}

export function factorGroupLabel(group: FactorGroup): string {
  switch (group) {
    case 'genre':
      return 'Genres'
    case 'trait':
      return 'Listening traits'
    case 'artist':
      return 'Artists'
    case 'editorial':
      return 'Editorial'
    case 'community':
      return 'Community'
  }
}
