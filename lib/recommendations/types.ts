/**
 * lib/recommendations/types.ts
 *
 * Provider-agnostic types for the room recommender. The scorer
 * consumes a RecommendationInput, returns a ranked list of
 * RecommendedRoom with an Explanation per entry.
 *
 * Phase 4.2: heuristic only. No ML. No AI. The Explanation array is
 * structured so a future AI layer can rewrite it into natural prose
 * without losing the underlying factors.
 */

export type EnergyLevel = 'low' | 'medium' | 'high'
export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'seasonal' | 'ongoing'

/** Minimal room shape the recommender reads. */
export interface RoomForRecommendation {
  id: string
  slug: string
  name: string
  description: string
  tagline: string | null
  type: string
  visibility: string
  genres: string[]
  moods: string[]
  energy_level: EnergyLevel | null
  cadence: Cadence | null
  featured: boolean
  cover_art: string | null
  recommendation_weight: number
  member_count: number
}

export interface RecommendationInput {
  /** Listener's calibration answers, keyed by step ('calibration-1', etc.).
   *  Comes from user_profiles.preferences.calibrationAnswers. */
  calibrationAnswers: Record<string, string[]>
  /** Genres derived from favorite_artists for this listener. */
  listenerGenres: string[]
  /** Slugs the listener has already joined — filtered out of results. */
  joinedRoomSlugs: string[]
  /** All public rooms to consider. */
  candidates: RoomForRecommendation[]
}

/** One transparent reason a room is suggested. The scorer attaches
 *  several of these to each recommendation; the explainer turns
 *  them into a single grounded sentence. */
export interface ExplanationFactor {
  kind:
    | 'genre-match'
    | 'mood-match'
    | 'context-match'      // calibration scenario hint (e.g. late-night)
    | 'energy-match'
    | 'featured'
    | 'first-room-friendly'
    | 'popular'
  weight: number          // how much it contributed to the score
  detail: string          // short human phrase, e.g. "ambient, post-rock"
}

export interface RecommendedRoom {
  room: RoomForRecommendation
  score: number
  factors: ExplanationFactor[]
  /** Single sentence ready to render. */
  explanation: string
}
