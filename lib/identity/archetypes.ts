/**
 * lib/identity/archetypes.ts — Phase 6A.6
 *
 * Archetype catalog + matcher. Pure trait-predicate logic — no DB,
 * no fetch, no ML, no LLM inference. An archetype is defined by:
 *
 *   - A set of REQUIRED traits (if any of these is null/unknown for
 *     the user, the archetype is ineligible — confidence = 0).
 *   - Per-trait predicates: an ideal range [min, max] in [0..1].
 *     The user's trait_score gets a contribution in [0..1] based on
 *     how well it fits the range.
 *
 * Composite confidence = mean of all predicate contributions across
 * the archetype's required traits. Range [0..1]. Top-N archetypes
 * by confidence are persisted to listener_archetype_snapshots.
 *
 * Architectural rules (Phase 6A.6 design constraints):
 *   - No personality / horoscope / faux-spiritual language. Labels
 *     are descriptive of LISTENING BEHAVIOR, not personality.
 *   - Every archetype must be grounded in measurable traits. If we
 *     can't compute the supporting trait, we can't claim the
 *     archetype.
 *   - Versioned via IDENTITY_ALGORITHM_VERSION (in traits.ts) —
 *     bump when adding archetypes or changing predicates.
 *
 * Catalog evolution: new archetypes can be appended without breaking
 * existing rows. When you remove or restructure an archetype, bump
 * the algorithm version; users will re-derive on next sync.
 */

import type { TraitKey } from './traits'

export interface TraitPredicate {
  /** Lower bound of the ideal range, inclusive. [0..1]. */
  min: number
  /** Upper bound of the ideal range, inclusive. [0..1]. */
  max: number
}

export interface ArchetypeDefinition {
  /** Stable kebab-case identifier. Never reused for a different concept. */
  key: string
  /** Display label. Updateable without changing the key. */
  label: string
  /** One-sentence behavior description. NOT marketing copy — what
   *  this listening pattern looks like in observable data. */
  description: string
  /** Trait predicates. ALL keys here must produce a non-null score
   *  for the user, or the archetype is ineligible. */
  predicates: Partial<Record<TraitKey, TraitPredicate>>
}

/**
 * Per-trait fitness in [0..1]:
 *   - If trait_score is within [min, max]: 1.0
 *   - Otherwise: linearly decays to 0 over a "soft margin" of 0.5
 *     outside the range. e.g. range [0.6, 0.8], score 0.3 →
 *     distance 0.3, margin 0.5, contribution = 1 - 0.3/0.5 = 0.4.
 *     Score 0.1 → distance 0.5 → contribution 0.
 *
 * The soft-margin shape (linear decay) makes confidence a smooth
 * function of trait score. A sharper step function would create
 * brittle assignments (one trait barely outside its band → archetype
 * disappears).
 */
const SOFT_MARGIN = 0.5

export function predicateFitness(
  traitScore: number,
  predicate: TraitPredicate,
): number {
  if (traitScore >= predicate.min && traitScore <= predicate.max) return 1.0
  const distance =
    traitScore < predicate.min
      ? predicate.min - traitScore
      : traitScore - predicate.max
  return Math.max(0, 1 - distance / SOFT_MARGIN)
}

export interface MatchedArchetype {
  key: string
  label: string
  /** [0..1] mean of per-predicate fitness. */
  confidence: number
  /** Per-trait breakdown. Drives supporting_traits JSONB on the
   *  archetype snapshot row — UI can show "your obscurity (0.78)
   *  contributed 1.00 to this match". */
  trait_contributions: Array<{
    trait_key: TraitKey
    trait_score: number
    contribution: number
  }>
  /** True when at least one required trait is null/unknown for the
   *  user (the archetype is ineligible). When false, confidence
   *  reflects the real fit; when true, confidence is 0. */
  ineligible: boolean
}

/**
 * Score one archetype against a user's trait scores.
 * Returns a MatchedArchetype with ineligible=true when ANY required
 * trait is missing (null/undefined).
 */
export function matchArchetype(
  archetype: ArchetypeDefinition,
  traitScores: Record<TraitKey, number | null>,
): MatchedArchetype {
  const required = Object.keys(archetype.predicates) as TraitKey[]
  const contributions: MatchedArchetype['trait_contributions'] = []
  let ineligible = false

  for (const key of required) {
    const predicate = archetype.predicates[key]!
    const score = traitScores[key]
    if (score === null || score === undefined) {
      ineligible = true
      contributions.push({
        trait_key: key,
        trait_score: 0,
        contribution: 0,
      })
      continue
    }
    contributions.push({
      trait_key: key,
      trait_score: score,
      contribution: round4(predicateFitness(score, predicate)),
    })
  }

  if (ineligible) {
    return {
      key: archetype.key,
      label: archetype.label,
      confidence: 0,
      trait_contributions: contributions,
      ineligible: true,
    }
  }

  const meanContribution =
    contributions.reduce((sum, c) => sum + c.contribution, 0) /
    Math.max(contributions.length, 1)
  return {
    key: archetype.key,
    label: archetype.label,
    confidence: round4(meanContribution),
    trait_contributions: contributions,
    ineligible: false,
  }
}

/**
 * Rank all archetypes for one user, return top N by confidence.
 * Eligible archetypes only — ineligible ones (missing required
 * traits) are filtered out, not ranked at zero. An empty result
 * is a valid outcome: a user with no listening data has no
 * derivable archetype, and we should not invent one.
 */
export function rankArchetypes(
  catalog: ReadonlyArray<ArchetypeDefinition>,
  traitScores: Record<TraitKey, number | null>,
  topN = 3,
  minConfidence = 0.4,
): MatchedArchetype[] {
  const matches = catalog.map((a) => matchArchetype(a, traitScores))
  const eligible = matches
    .filter((m) => !m.ineligible)
    .filter((m) => m.confidence >= minConfidence)
  eligible.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    // Deterministic tie-break: alphabetical by key.
    return a.key.localeCompare(b.key)
  })
  return eligible.slice(0, topN)
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

// ── Archetype catalog (identity_v1) ─────────────────────────────────
//
// Seven archetypes. Each describes a listening pattern, not a
// personality. Predicates are deliberately wide enough that most
// real users with sufficient data will match at least one with
// confidence ≥ 0.4. The soft-margin (0.5) means scores near a
// boundary still register a partial match.

export const ARCHETYPE_CATALOG: ArchetypeDefinition[] = [
  {
    key: 'deep-catalog-romantic',
    label: 'The Deep Catalog Romantic',
    description:
      'Saves whole albums; returns to a small set of artists over time. Not chasing the new; sits with the canon.',
    predicates: {
      album_focus_score: { min: 0.55, max: 1.0 },
      recency_bias_score: { min: 0.0, max: 0.45 },
      consistency_score: { min: 0.15, max: 1.0 },
    },
  },
  {
    key: 'nocturnal-explorer',
    label: 'The Nocturnal Explorer',
    description:
      'Listens after dark across many artists. The late hours are when the catalog opens up.',
    predicates: {
      nocturnal_score: { min: 0.5, max: 1.0 },
      exploratory_score: { min: 0.35, max: 1.0 },
      genre_breadth_score: { min: 0.3, max: 1.0 },
    },
  },
  {
    key: 'genre-wanderer',
    label: 'The Genre Wanderer',
    description:
      'Listens across many genres at comparable depth. No single style dominates the library.',
    predicates: {
      genre_breadth_score: { min: 0.6, max: 1.0 },
      consistency_score: { min: 0.0, max: 0.3 },
    },
  },
  {
    key: 'obsessive-curator',
    label: 'The Obsessive Curator',
    description:
      'Concentrates on a narrow genre with high depth. Knows the artists they care about thoroughly.',
    predicates: {
      consistency_score: { min: 0.45, max: 1.0 },
      album_focus_score: { min: 0.4, max: 1.0 },
      exploratory_score: { min: 0.0, max: 0.5 },
    },
  },
  {
    key: 'midnight-archivist',
    label: 'The Midnight Archivist',
    description:
      'Late-night listening biased toward less-popular artists and full albums. Long-tail at unsociable hours.',
    predicates: {
      nocturnal_score: { min: 0.5, max: 1.0 },
      obscurity_score: { min: 0.55, max: 1.0 },
      album_focus_score: { min: 0.45, max: 1.0 },
    },
  },
  {
    key: 'recency-driven-listener',
    label: 'The Recency-Driven Listener',
    description:
      'Listens predominantly to what landed recently. The catalog turns over fast; new releases drive the rotation.',
    predicates: {
      recency_bias_score: { min: 0.55, max: 1.0 },
      album_focus_score: { min: 0.0, max: 0.5 },
    },
  },
  {
    key: 'album-loyalist',
    label: 'The Album Loyalist',
    description:
      'Saves whole albums by a stable set of artists. Returns to known records rather than chasing breadth.',
    predicates: {
      album_focus_score: { min: 0.6, max: 1.0 },
      consistency_score: { min: 0.3, max: 1.0 },
      exploratory_score: { min: 0.0, max: 0.5 },
    },
  },
]
