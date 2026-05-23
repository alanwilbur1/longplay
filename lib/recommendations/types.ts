/**
 * lib/recommendations/types.ts
 *
 * Provider-agnostic types for the room recommender.
 *
 * Phase 4.5 — heuristic still. No ML. No embeddings. The factor
 * shape is stable so a future AI layer could rewrite explanations
 * without rebuilding the scorer.
 *
 * v2.1 adds:
 *   - canonical / enriched genre split (Spotify vs Last.fm origin)
 *   - first-class affinity tag factor
 *   - artist-match factor via room → current cycle → album.artist
 *   - recency boost from snapshot.recent_density
 *   - diversity penalty applied at ranking, not in scoreRoom
 */

/** Bumped on every scoring-formula change. Surfaced in every
 *  recommendation result + the debug route so we can correlate
 *  outputs across deploys. */
export const SCORE_VERSION = 'v2.1' as const

export type EnergyLevel = 'low' | 'medium' | 'high'
export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'seasonal' | 'ongoing'

/** Minimal room shape the recommender reads.
 *
 *  v2.1: optional `currentAlbumArtist` + `currentAlbumEmotionalTags`
 *  + `currentAlbumSonicTags` enrich each candidate at fetch time.
 *  Optional because some rooms have no active cycle. */
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
  currentAlbumArtist?: string | null
  currentAlbumEmotionalTags?: string[]
  currentAlbumSonicTags?: string[]
}

export interface RecommendationInput {
  /** Listener's calibration answers, keyed by step ('calibration-1', etc.).
   *  Comes from user_profiles.preferences.calibrationAnswers. */
  calibrationAnswers: Record<string, string[]>

  /** v2.1: Canonical-confidence genres — sourced from
   *  listening_profile_snapshots.top_genres (Spotify-origin). Weighted
   *  at full strength (12/match). */
  canonicalGenres: string[]

  /** v2.1: Lower-confidence enriched genres — sourced from
   *  artist_genre_enrichments.canonical_genres (Last.fm-derived).
   *  Weighted at half strength (6/match), deduped against canonical
   *  so a genre present in both contributes only once at the
   *  canonical rate. */
  enrichedGenres: string[]

  /** v2.1: First-class affinity tags from snapshot.affinity_tags.
   *  Match against room.moods at 9/match — no longer routed through
   *  the synthetic 'snapshot' calibration step. */
  affinityTags: string[]

  /** v2.1: Listener's top artist names (lowercase compare). Match
   *  exactly against room.currentAlbumArtist at 12/match. */
  topArtistNames: string[]

  /** v2.1: From snapshot.recent_density. Gates the +4 recency boost
   *  when 'medium' or 'high' AND the room has any genre overlap. */
  recentDensity: 'low' | 'medium' | 'high' | null

  /** Slugs the listener has already joined — filtered out of results. */
  joinedRoomSlugs: string[]
  /** All public rooms to consider. */
  candidates: RoomForRecommendation[]
}

/** One transparent reason a room is suggested. The scorer attaches
 *  several of these to each recommendation; the explainer turns
 *  them into a single grounded sentence.
 *
 *  v2.1 adds: canonical-genre-match, enriched-genre-match,
 *  affinity-tag-match, artist-match, recency-boost.
 *  `genre-match` is kept in the union for backwards compatibility
 *  with older callers but is no longer emitted by the v2.1 scorer. */
export interface ExplanationFactor {
  kind:
    | 'genre-match'             // legacy — replaced by canonical/enriched
    | 'canonical-genre-match'   // v2.1
    | 'enriched-genre-match'    // v2.1
    | 'affinity-tag-match'      // v2.1
    | 'artist-match'            // v2.1
    | 'recency-boost'           // v2.1
    | 'mood-match'
    | 'context-match'           // calibration scenario hint (e.g. late-night)
    | 'energy-match'
    | 'featured'
    | 'first-room-friendly'
    | 'popular'
  weight: number          // how much it contributed to the score
  detail: string          // short human phrase, e.g. "ambient, post-rock"
}

export interface RecommendedRoom {
  room: RoomForRecommendation
  /** Final score AFTER diversity penalty. */
  score: number
  /** v2.1: score before the diversity penalty was applied. Equal to
   *  `score` for the #1 pick (no prior picks → no penalty). */
  score_pre_diversity: number
  /** v2.1: amount the diversity step deducted (≥ 0). 0 for #1. */
  diversity_penalty: number
  factors: ExplanationFactor[]
  /** Single sentence ready to render. */
  explanation: string
}
