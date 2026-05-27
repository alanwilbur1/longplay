import {
  factorKindLabel,
  groupFactorsForDisplay,
} from '@/lib/recommendations/explanation'
import type { ExplanationFactor } from '@/lib/recommendations/types'

/**
 * RecommendationFactorChips — Phase 6A.8
 *
 * Static-render chip strip for the top factors driving a
 * recommendation card's score. Renders the top 3 factors by weight
 * (deterministically grouped to favor genre → trait → artist) as
 * small uppercase chips.
 *
 * Pure component — no hooks, no state. Safe to render inside RSC
 * (no 'use client'). Drops in below the one-sentence explainer
 * sentence the existing recommender already produces.
 */
export function RecommendationFactorChips({
  factors,
  max = 3,
}: {
  factors: ExplanationFactor[]
  max?: number
}) {
  const groups = groupFactorsForDisplay(factors)
  const flat = groups.flatMap((g) => g.factors).slice(0, max)
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
