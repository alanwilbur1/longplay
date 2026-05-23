/**
 * lib/enrichment/types.ts
 *
 * Phase 4.5 — types for the external genre enrichment layer.
 *
 * Enrichment is a SECOND-STAGE pipeline. The first stage (Spotify
 * sync in lib/streaming/sync.ts) writes favorite_artists with
 * whatever genres Spotify returned. This stage queries secondary
 * providers (Last.fm first) for artists with empty/weak genres and
 * persists the result into `artist_genre_enrichments`.
 *
 * Architectural rule (encoded in the schema and respected by the
 * normalizer): we NEVER invent canonical genres. The normalized
 * `canonical_genres` array is always a strict subset of the
 * provider's actual tags after vocabulary mapping + filtering of
 * non-genre tags (decades, "seen live", "favorite", etc.).
 */

export type EnrichmentStatus =
  | 'queued'
  | 'in_progress'
  | 'succeeded'
  | 'failed'
  | 'skipped'

export type EnrichmentProvider = 'lastfm'

/** A raw tag exactly as the upstream provider returned it. Preserved
 *  in `raw_tags` so we can re-normalize later without re-fetching. */
export interface RawTag {
  name: string
  /** Provider-supplied popularity / weight (Last.fm: 0-100 scale). */
  count?: number
  url?: string
}

/** Provider result after normalization but before persistence. */
export interface ProviderEnrichmentResult {
  provider: EnrichmentProvider
  raw_tags: RawTag[]
  canonical_genres: string[]
  /** 0..1, derived from the top accepted tag's weight. */
  confidence: number
}

/** DB row shape for artist_genre_enrichments. */
export interface EnrichmentJob {
  id: string
  user_id: string
  source_id: string
  external_artist_id: string
  artist_name: string
  status: EnrichmentStatus
  provider: EnrichmentProvider | null
  raw_tags: RawTag[] | Record<string, unknown>
  canonical_genres: string[]
  confidence: number | null
  attempt_count: number
  last_attempted_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

/** Summary returned by runArtistGenreEnrichmentRound — surfaced in
 *  the streaming sync's audit strip. */
export interface EnrichmentRoundStats {
  queued: number
  run: number
  succeeded: number
  failed: number
  skipped_backoff: number
  /** Distinct canonical genres added across all succeeded jobs in
   *  this round. */
  canonical_genres_added: number
  /** Which provider(s) were used this round. Single-element array
   *  today (lastfm); kept as an array for the multi-provider future. */
  providers_used: EnrichmentProvider[]
  /** True when the runner observed a 429/HTTP-rate-limit from the
   *  provider and bailed early. */
  rate_limited: boolean
  /** Safe one-line error from the last failing job, or null. */
  last_error: string | null
}
