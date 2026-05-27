/**
 * lib/identity/traits.ts — Phase 6A.6
 *
 * Pure deterministic trait formulas. No DB, no fetch — these
 * functions take the raw aggregates that lib/identity/recompute.ts
 * produces and return TraitResult values. Easy to unit-test in
 * scripts/test-identity.ts.
 *
 * Architectural priorities:
 *   - Explainable: every score is derived from a small number of
 *     named, observable inputs. The contributing_factors JSONB is
 *     populated alongside the score so "why is this trait X?" is
 *     answerable without re-running anything.
 *   - Deterministic: same inputs → same outputs, bit-identical.
 *   - Honest about missing data: when underlying signal is absent
 *     (e.g. no listening_events yet), the trait returns score=null,
 *     band='unknown'. The archetype matcher treats null traits as
 *     non-contributing rather than zero-scored.
 *   - No ML, no embeddings, no LLM inference. Every score is plain
 *     arithmetic on observable data.
 *
 * Trait catalog (Phase 6A.6):
 *   obscurity_score      — invert mean popularity of top artists
 *   exploratory_score    — distinct recent artists / catalog size
 *   album_focus_score    — saved-album weight vs top-track weight
 *   nocturnal_score      — fraction of plays in 22:00-06:00 UTC
 *   recency_bias_score   — recent plays / total plays
 *   genre_breadth_score  — distinct genre count, capped + normalized
 *   consistency_score    — top genre's weight / sum of genre weights
 */

export const IDENTITY_ALGORITHM_VERSION = 'identity_v1' as const

export type TraitBand = 'low' | 'medium' | 'high' | 'unknown'

export interface TraitResult {
  trait_key: string
  /** [0..1] or null when underlying data is insufficient. */
  trait_score: number | null
  trait_band: TraitBand
  /** Structured explanation. Shape varies per trait; always carries
   *  enough to reconstruct the score offline. */
  contributing_factors: Record<string, unknown>
}

// ── Banding ─────────────────────────────────────────────────────────
//
// All traits use the same default cut points: <0.33 low, <0.66 medium,
// >=0.66 high. Bands are advisory — the archetype matcher reads
// trait_score directly (continuous), not the band. The band is there
// for downstream UI to show "Your obscurity is HIGH" without exposing
// the raw number.

function bandForScore(score: number | null): TraitBand {
  if (score === null) return 'unknown'
  if (score < 0.33) return 'low'
  if (score < 0.66) return 'medium'
  return 'high'
}

// ── Rounding to numeric(6,4) ────────────────────────────────────────
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

// ── obscurity_score ─────────────────────────────────────────────────
// Inverted mean Spotify popularity of the user's top-20 ranked artists.
//   popularity is 0..100 (0 = unknown / never streamed, 100 = global
//   superstar). High obscurity = listener gravitates to artists with
//   low public reach.
//
// Insufficient data: returns null when zero artists carry a non-null
// popularity. Spotify's hydration sometimes fails; we don't fake a
// score from incomplete data.

export function computeObscurityScore(
  artistsWithPopularity: ReadonlyArray<{ popularity: number | null }>,
): TraitResult {
  const observed = artistsWithPopularity.filter(
    (a) => typeof a.popularity === 'number' && a.popularity >= 0 && a.popularity <= 100,
  )
  if (observed.length === 0) {
    return {
      trait_key: 'obscurity_score',
      trait_score: null,
      trait_band: 'unknown',
      contributing_factors: {
        source: 'favorite_artists.popularity',
        n_artists_observed: 0,
        n_artists_total: artistsWithPopularity.length,
        note: 'No popularity data; hydration may have failed.',
      },
    }
  }
  const mean =
    observed.reduce((sum, a) => sum + (a.popularity ?? 0), 0) / observed.length
  const score = round4(1 - mean / 100)
  return {
    trait_key: 'obscurity_score',
    trait_score: score,
    trait_band: bandForScore(score),
    contributing_factors: {
      source: 'favorite_artists.popularity',
      n_artists_observed: observed.length,
      n_artists_total: artistsWithPopularity.length,
      mean_popularity: round4(mean),
      formula: '1 - mean(popularity) / 100',
    },
  }
}

// ── exploratory_score ──────────────────────────────────────────────
// Distinct artists in last 30 days of listening_events, divided by
// total ranked artists (the catalog size we know about). Capped at 1.
//
// High exploratory = user listens to many different artists recently.
// Low exploratory = user concentrates on a small recent rotation.
//
// Insufficient data: returns null when total ranked artists == 0
// (a user with no favorite_artists data at all).

export function computeExploratoryScore(params: {
  distinctRecentArtists: number
  totalRankedArtists: number
}): TraitResult {
  const { distinctRecentArtists, totalRankedArtists } = params
  if (totalRankedArtists <= 0) {
    return {
      trait_key: 'exploratory_score',
      trait_score: null,
      trait_band: 'unknown',
      contributing_factors: {
        source: 'listening_events ∩ listener_artists',
        distinct_recent_artists: distinctRecentArtists,
        total_ranked_artists: totalRankedArtists,
        note: 'No ranked artists to compare against.',
      },
    }
  }
  const raw = distinctRecentArtists / totalRankedArtists
  const score = round4(Math.min(raw, 1))
  return {
    trait_key: 'exploratory_score',
    trait_score: score,
    trait_band: bandForScore(score),
    contributing_factors: {
      source: 'listening_events ∩ listener_artists',
      distinct_recent_artists: distinctRecentArtists,
      total_ranked_artists: totalRankedArtists,
      formula: 'min(distinct_recent_artists / total_ranked_artists, 1)',
    },
  }
}

// ── album_focus_score ──────────────────────────────────────────────
// Ratio of saved albums to (saved albums + top-ranked tracks). High
// score = user saves whole albums; low score = user's library is
// track-centric (singles culture / playlist-driven).
//
// Insufficient data: returns null when both counts are 0.

export function computeAlbumFocusScore(params: {
  savedAlbumCount: number
  topTrackCount: number
}): TraitResult {
  const { savedAlbumCount, topTrackCount } = params
  const denom = savedAlbumCount + topTrackCount
  if (denom <= 0) {
    return {
      trait_key: 'album_focus_score',
      trait_score: null,
      trait_band: 'unknown',
      contributing_factors: {
        source: 'listener_albums + listener_tracks',
        saved_album_count: 0,
        top_track_count: 0,
      },
    }
  }
  const score = round4(savedAlbumCount / denom)
  return {
    trait_key: 'album_focus_score',
    trait_score: score,
    trait_band: bandForScore(score),
    contributing_factors: {
      source: 'listener_albums + listener_tracks',
      saved_album_count: savedAlbumCount,
      top_track_count: topTrackCount,
      formula: 'saved_album_count / (saved_album_count + top_track_count)',
    },
  }
}

// ── nocturnal_score ────────────────────────────────────────────────
// Fraction of listening_events whose played_at hour falls in the
// "night" window [22:00 .. 06:00) UTC. Deliberately UTC so the
// computation is deterministic without per-user timezone tracking;
// a future trait revision can re-band against user timezone.
//
// Insufficient data: null when no events.

export function computeNocturnalScore(
  events: ReadonlyArray<{ played_at: string }>,
): TraitResult {
  if (events.length === 0) {
    return {
      trait_key: 'nocturnal_score',
      trait_score: null,
      trait_band: 'unknown',
      contributing_factors: {
        source: 'listening_events.played_at (UTC)',
        n_events: 0,
      },
    }
  }
  let nightCount = 0
  let valid = 0
  for (const e of events) {
    const t = Date.parse(e.played_at)
    if (!Number.isFinite(t)) continue
    valid += 1
    const hourUtc = new Date(t).getUTCHours()
    if (hourUtc >= 22 || hourUtc < 6) nightCount += 1
  }
  if (valid === 0) {
    return {
      trait_key: 'nocturnal_score',
      trait_score: null,
      trait_band: 'unknown',
      contributing_factors: {
        source: 'listening_events.played_at (UTC)',
        n_events: events.length,
        note: 'No parseable timestamps.',
      },
    }
  }
  const score = round4(nightCount / valid)
  return {
    trait_key: 'nocturnal_score',
    trait_score: score,
    trait_band: bandForScore(score),
    contributing_factors: {
      source: 'listening_events.played_at (UTC)',
      window: '22:00..06:00 UTC',
      n_events: valid,
      n_night_events: nightCount,
      formula: 'count(hour ∈ [22, 6)) / count(events)',
    },
  }
}

// ── recency_bias_score ─────────────────────────────────────────────
// How concentrated is the listener's listening on recent (last-30-day)
// plays vs all-time? High = freshness-driven; low = catalog explorer
// with long-tail re-listens.
//
// Aggregated across listener_artists: sum(recent_play_count) /
// (sum(play_count) + sum(recent_play_count)). play_count is "all
// plays seen, including recent"; recent_play_count is the subset.
// Adding them double-counts on purpose to bias the denominator
// toward not-mostly-recent.

export function computeRecencyBiasScore(params: {
  totalPlayCount: number
  recentPlayCount: number
}): TraitResult {
  const { totalPlayCount, recentPlayCount } = params
  const denom = totalPlayCount + recentPlayCount
  if (denom <= 0) {
    return {
      trait_key: 'recency_bias_score',
      trait_score: null,
      trait_band: 'unknown',
      contributing_factors: {
        source: 'listener_artists aggregate',
        total_play_count: 0,
        recent_play_count: 0,
      },
    }
  }
  const score = round4(recentPlayCount / denom)
  return {
    trait_key: 'recency_bias_score',
    trait_score: score,
    trait_band: bandForScore(score),
    contributing_factors: {
      source: 'listener_artists aggregate',
      total_play_count: totalPlayCount,
      recent_play_count: recentPlayCount,
      formula: 'recent_play_count / (total_play_count + recent_play_count)',
    },
  }
}

// ── genre_breadth_score ────────────────────────────────────────────
// Distinct genre count, normalized: 0 genres → 0.0; 20+ genres → 1.0;
// linear in between. The 20-genre saturation is a reasonable cap —
// most "wide" listeners cluster around 15-25 distinct canonical
// genres in their listener_genres after enrichment.

const GENRE_BREADTH_SATURATION = 20

export function computeGenreBreadthScore(params: {
  distinctGenreCount: number
}): TraitResult {
  const { distinctGenreCount } = params
  if (distinctGenreCount <= 0) {
    return {
      trait_key: 'genre_breadth_score',
      trait_score: null,
      trait_band: 'unknown',
      contributing_factors: {
        source: 'listener_genres',
        distinct_genre_count: 0,
      },
    }
  }
  const score = round4(Math.min(distinctGenreCount / GENRE_BREADTH_SATURATION, 1))
  return {
    trait_key: 'genre_breadth_score',
    trait_score: score,
    trait_band: bandForScore(score),
    contributing_factors: {
      source: 'listener_genres',
      distinct_genre_count: distinctGenreCount,
      saturation_at: GENRE_BREADTH_SATURATION,
      formula: 'min(distinct_genre_count / 20, 1)',
    },
  }
}

// ── consistency_score ──────────────────────────────────────────────
// Top genre's weighted_score over the sum of all genre weighted_scores.
// High = listening is concentrated on one or two genres; low = listening
// is spread thin across many genres.
//
// Distinct from genre_breadth (which is just count); a user can have
// many genres in their library but listen heavily to only one (high
// consistency + high breadth).

export function computeConsistencyScore(
  genres: ReadonlyArray<{ genre: string; weighted_score: number }>,
): TraitResult {
  if (genres.length === 0) {
    return {
      trait_key: 'consistency_score',
      trait_score: null,
      trait_band: 'unknown',
      contributing_factors: {
        source: 'listener_genres',
        n_genres: 0,
      },
    }
  }
  const sorted = [...genres].sort((a, b) => b.weighted_score - a.weighted_score)
  const total = sorted.reduce((sum, g) => sum + (g.weighted_score ?? 0), 0)
  if (total <= 0) {
    return {
      trait_key: 'consistency_score',
      trait_score: null,
      trait_band: 'unknown',
      contributing_factors: {
        source: 'listener_genres',
        n_genres: genres.length,
        note: 'All weighted_scores are zero.',
      },
    }
  }
  const top = sorted[0]
  const score = round4(top.weighted_score / total)
  return {
    trait_key: 'consistency_score',
    trait_score: score,
    trait_band: bandForScore(score),
    contributing_factors: {
      source: 'listener_genres',
      n_genres: genres.length,
      top_genre: top.genre,
      top_genre_weight: round4(top.weighted_score),
      sum_weights: round4(total),
      formula: 'top_genre.weighted_score / sum(weighted_scores)',
    },
  }
}

// ── Catalog of trait keys (canonical list) ─────────────────────────
export const TRAIT_KEYS = [
  'obscurity_score',
  'exploratory_score',
  'album_focus_score',
  'nocturnal_score',
  'recency_bias_score',
  'genre_breadth_score',
  'consistency_score',
] as const

export type TraitKey = (typeof TRAIT_KEYS)[number]
