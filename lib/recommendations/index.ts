'use server'

/**
 * lib/recommendations — server entry.
 *
 * One server action: getRecommendedRooms(limit?).
 *
 * Delegates the actual pipeline to lib/recommendations/pipeline.ts
 * so the same fetch+score+diversify logic is reachable from the
 * auth-gated debug route at /api/debug/recommendations without
 * duplicating any code.
 *
 * Returns ranked rooms + grounded one-sentence explanations.
 * Scoring formula: see scorer.ts (v2.1).
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { runRecommendationPipeline } from './pipeline'
import type { RecommendedRoom } from './types'

export type { RecommendedRoom } from './types'

export async function getRecommendedRooms(limit = 3): Promise<RecommendedRoom[]> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const result = await runRecommendationPipeline(supabase, user.id, limit)

  // Strip the diagnostic; production surface is just the ranked picks.
  return result.ranked.map((r) => ({
    room: r.room,
    score: r.score,
    score_pre_diversity: r.score_pre_diversity,
    diversity_penalty: r.diversity_penalty,
    factors: r.factors,
    explanation: r.explanation,
  }))
}
