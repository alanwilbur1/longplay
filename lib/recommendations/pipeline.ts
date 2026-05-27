/**
 * lib/recommendations/pipeline.ts
 *
 * v2.1 recommendation pipeline — shared between the production
 * server action (lib/recommendations/index.ts) and the auth-gated
 * debug route (app/api/debug/recommendations/route.ts).
 *
 * Phase 6A.5: serving path reads from the Layer 4 room_affinity_scores
 * cache when available, falls back to live scoring when the cache is
 * cold or stale. The diagnostic shape is unchanged — `cache_source`
 * marks which path produced this response.
 *
 * Input assembly is shared with lib/recommendations/affinity-cache.ts
 * via lib/recommendations/inputs.ts so both paths agree on the
 * RecommendationInput shape exactly.
 *
 * NOT a 'use server' file. The server action wraps this and strips
 * to the public RecommendedRoom[] shape; the debug route returns
 * the full RecommendationPipelineDiagnostic.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { explainFactors } from './explainer'
import {
  rankByMMR,
  scenarioTagsFromAnswers,
  listenerEnergyFromAnswers,
  scoreAllCandidates,
  SCORE_VERSION,
  type ScoredCandidate,
} from './scorer'
import { assembleRecommendationInputs } from './inputs'
import {
  joinCachedScoresToRooms,
  readCachedRoomAffinities,
} from './affinity-cache'
import type {
  ExplanationFactor,
  RoomForRecommendation,
} from './types'

export interface RecommendationPipelineDiagnostic {
  score_version: typeof SCORE_VERSION
  user_id: string
  /** Phase 6A.5: which path served this response.
   *  - 'layer4'    Layer 4 cache was hot; scores pulled from
   *                room_affinity_scores. MMR + filtering applied
   *                at request time.
   *  - 'live'      Cache was cold/stale; full live scoring ran.
   *                Matches pre-6A.5 behavior exactly. */
  cache_source: 'layer4' | 'live'
  inputs: {
    calibration_answers: Record<string, string[]>
    canonical_genres: string[]
    enriched_genres: string[]
    affinity_tags: string[]
    top_artist_names: string[]
    recent_density: 'low' | 'medium' | 'high' | null
    scenario_tags: string[]
    listener_energy: 'low' | 'medium' | 'high' | null
    joined_room_slugs: string[]
  }
  /** Rooms returned by the candidate SELECT before any filtering. */
  candidates_seen: number
  /** Rooms after joined-room exclusion + public-visibility filter. */
  candidates_after_filter: number
  /** Every candidate's pre-diversity score + factors (for QA). Sorted
   *  by score descending. Limited to top 25 in the response payload. */
  scored: Array<{
    room: { id: string; slug: string; name: string }
    score: number
    factors: ExplanationFactor[]
  }>
  /** Final ranked picks after MMR diversification. */
  ranked: Array<{
    room: RoomForRecommendation
    score: number
    score_pre_diversity: number
    diversity_penalty: number
    factors: ExplanationFactor[]
    explanation: string
  }>
}

/** What the public server action returns — strip of the diagnostic. */
export interface PipelineRanked {
  room: RoomForRecommendation
  score: number
  score_pre_diversity: number
  diversity_penalty: number
  factors: ExplanationFactor[]
  explanation: string
}

/**
 * Run the v2.1 pipeline for one user, end-to-end.
 *
 * Reads (Phase 6A.5):
 *   1. RecommendationInput (calibration, snapshot, long-tail genres,
 *      top artists, joined rooms, candidates+cycles) via the shared
 *      lib/recommendations/inputs.ts assembler.
 *   2. room_affinity_scores (Layer 4 cache) — if version + snapshot
 *      match, scores come from the cache and MMR runs over cached
 *      values. Otherwise the live scoreAllCandidates path runs.
 *
 * Live-scoring fallback fires when:
 *   - User has no cached rows (new user, never synced)
 *   - Any cached row has a different score_version (formula change)
 *   - Any cached row's source_snapshot_computed_at differs from the
 *     current snapshot.computed_at (snapshot moved after cache write)
 *   - One or more current candidates have no cached row (room added
 *     since the cache was built; falling back is safer than serving
 *     stale top-N missing that room)
 *
 * Score outputs and diagnostic shape are identical between the two
 * paths — cache_source is the only field that distinguishes them.
 */
export async function runRecommendationPipeline(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
): Promise<RecommendationPipelineDiagnostic> {
  // Step 1: shared input assembly. excludeJoinedRooms=true so the
  // scorer / MMR get the live joined-room filter regardless of which
  // path serves.
  const { input, sourceSnapshotComputedAt } = await assembleRecommendationInputs(
    supabase,
    userId,
    { excludeJoinedRooms: true },
  )

  const scenarioTags = scenarioTagsFromAnswers(input.calibrationAnswers)
  const listenerEnergy = listenerEnergyFromAnswers(input.calibrationAnswers)

  // Step 2: Layer 4 cache read. Returns null when the cache is cold
  // or stale. See affinity-cache.ts:readCachedRoomAffinities for the
  // staleness rules.
  const cached = await readCachedRoomAffinities(
    supabase,
    userId,
    sourceSnapshotComputedAt,
  )

  // Visibility filter is shared by both paths (cache and live).
  // joinedRoomSlugs / visibility filtering happens here at request
  // time even on the cache-hot path, because the cache scores ALL
  // rooms (membership-agnostic) per Phase 6A.5 design.
  const joinedSet = new Set(input.joinedRoomSlugs)
  const filteredCandidates = input.candidates
    .filter((r) => !joinedSet.has(r.slug))
    .filter((r) => r.visibility === 'public')

  let cacheSource: 'layer4' | 'live'
  let allScored: ScoredCandidate[]

  if (cached) {
    // Cache-hot path. Match cached scores to current candidates by
    // room_id. If any current candidate is missing from the cache
    // (room added since recompute / weight ranking shifted), fall
    // back — better to live-score than to serve an incomplete top-N.
    const cachedScored = joinCachedScoresToRooms(cached, filteredCandidates)
    const allCandidatesCached =
      cachedScored.length === filteredCandidates.length
    if (allCandidatesCached) {
      cacheSource = 'layer4'
      allScored = cachedScored
    } else {
      cacheSource = 'live'
      allScored = scoreAllCandidates(input)
    }
  } else {
    cacheSource = 'live'
    allScored = scoreAllCandidates(input)
  }

  // Pre-MMR scored view for the diagnostic (top 25 by raw score).
  const sortedScored = [...allScored].sort((a, b) => b.score - a.score)

  // MMR diversification. rankByMMR is shape-compatible with either
  // path's allScored — extracted in Phase 6A.5 so cached scores
  // flow through the same diversification as live ones.
  const ranked = rankByMMR(allScored, limit)

  return {
    score_version: SCORE_VERSION,
    user_id: userId,
    cache_source: cacheSource,
    inputs: {
      calibration_answers: input.calibrationAnswers,
      canonical_genres: input.canonicalGenres,
      enriched_genres: input.enrichedGenres,
      affinity_tags: input.affinityTags,
      top_artist_names: input.topArtistNames,
      recent_density: input.recentDensity,
      scenario_tags: scenarioTags,
      listener_energy: listenerEnergy,
      joined_room_slugs: input.joinedRoomSlugs,
    },
    candidates_seen: input.candidates.length,
    candidates_after_filter: allScored.length,
    scored: sortedScored.slice(0, 25).map((s) => ({
      room: { id: s.room.id, slug: s.room.slug, name: s.room.name },
      score: s.score,
      factors: s.factors,
    })),
    ranked: ranked.map((r) => ({
      room: r.room,
      score: r.score,
      score_pre_diversity: r.score_pre_diversity,
      diversity_penalty: r.diversity_penalty,
      factors: r.factors,
      explanation: explainFactors(r.factors),
    })),
  }
}

