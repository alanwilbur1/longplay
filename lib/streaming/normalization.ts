/**
 * lib/streaming/normalization.ts — Phase 6A.3
 *
 * Pure functions for Layer 2 (canonical listening graph). No DB,
 * no fetch — easy to unit-test in scripts/test-listener-graph.ts.
 *
 * The DB-backed orchestrator in listener-graph.ts composes these.
 *
 * Design rules (architectural priorities from Phase 6A.1):
 *   - Regeneratable: every value here is a pure function of Layer 1
 *     row state at recompute time. Re-running on identical input
 *     produces byte-identical output.
 *   - Deterministic: no randomness, no current time except where
 *     explicitly passed in (`now` is always a parameter).
 *   - Provider-agnostic: keys carry the provider as a prefix; the
 *     formulas don't care which provider supplied them.
 *   - Explainable: every score is a documented arithmetic combination
 *     of a small number of named inputs. No ML, no embeddings.
 */

// ── Canonical keys ──────────────────────────────────────────────────
//
// Format: '<source_id>:<external_id>'.
//
// Why a string instead of a UUID: we want the key to encode the
// source provenance without an extra join, and we want the per-row
// shape to remain stable when (later) we add a cross-provider
// `canonical_id` UUID for genuinely-merged entities. A
// 'spotify:0WrCpvr' key today and a 'apple_music:1234567890' key
// tomorrow can both point at the same future canonical_id without
// either key changing.

const SOURCE_ID_RE = /^[a-z][a-z0-9_]*$/
const KEY_SEP = ':'

function assertSourceId(sourceId: string): void {
  if (!SOURCE_ID_RE.test(sourceId)) {
    throw new Error(
      `[normalization] invalid source_id "${sourceId}" — must match ${SOURCE_ID_RE}`,
    )
  }
}

function assertExternalId(externalId: string, kind: string): void {
  if (typeof externalId !== 'string' || externalId.length === 0) {
    throw new Error(`[normalization] external ${kind} id is empty`)
  }
  if (externalId.includes(KEY_SEP)) {
    // ':' is the separator. An external id containing it would create
    // an ambiguous key. None of the providers we wrap (Spotify, Apple
    // Music) use ':' in their ids — if they ever do, hash the id
    // before passing in.
    throw new Error(
      `[normalization] external ${kind} id contains '${KEY_SEP}' — ambiguous key`,
    )
  }
}

export function canonicalArtistKey(sourceId: string, externalArtistId: string): string {
  assertSourceId(sourceId)
  assertExternalId(externalArtistId, 'artist')
  return `${sourceId}${KEY_SEP}${externalArtistId}`
}

export function canonicalAlbumKey(sourceId: string, externalAlbumId: string): string {
  assertSourceId(sourceId)
  assertExternalId(externalAlbumId, 'album')
  return `${sourceId}${KEY_SEP}${externalAlbumId}`
}

export function canonicalTrackKey(sourceId: string, externalTrackId: string): string {
  assertSourceId(sourceId)
  assertExternalId(externalTrackId, 'track')
  return `${sourceId}${KEY_SEP}${externalTrackId}`
}

// ── Genre union ─────────────────────────────────────────────────────
//
// The Layer 2 single source of truth for "what genres does this
// artist signal for this user". Currently the recommendation pipeline
// computes this at hot-path (lib/recommendations/pipeline.ts unions
// favorite_artists.genres with artist_genre_enrichments.canonical_
// genres on every request). This function precomputes the same union
// per artist; the listener_artists.canonical_genres column persists
// it.
//
// Normalization rules:
//   1. lowercase + trim + collapse whitespace
//   2. dedupe (first encounter wins for ordering)
//   3. preserve insertion order: Spotify genres first, enrichment
//      genres next (Spotify is canonical when present)
//   4. cap at 15 (matches normalizeGenreTags upstream)
//
// Note: does NOT apply the Last.fm tag alias map — those aliases run
// inside the enrichment provider BEFORE the canonical_genres column
// is written. By the time we read enrichment.canonical_genres they're
// already in LongPlay canonical form.

const MAX_GENRES = 15

export function mergeArtistGenres(
  spotifyGenres: readonly string[] | null | undefined,
  enrichmentGenres: readonly string[] | null | undefined,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const consume = (input: readonly string[] | null | undefined) => {
    if (!input) return
    for (const raw of input) {
      if (out.length >= MAX_GENRES) return
      if (typeof raw !== 'string') continue
      const g = raw.toLowerCase().trim().replace(/\s+/g, ' ')
      if (!g) continue
      if (seen.has(g)) continue
      seen.add(g)
      out.push(g)
    }
  }
  consume(spotifyGenres)
  consume(enrichmentGenres)
  return out
}

// ── Affinity scoring ────────────────────────────────────────────────
//
// All formulas chosen to match (and slightly generalize) the existing
// recomputeListeningProfileSnapshot code so that when the recommender
// migrates to read Layer 2 in 6A.4, the rankings barely shift.
//
// Each score is in [0, 1] except affinity_score which can exceed 1 as
// the sum of weighted components.

/**
 * Rank-based weight. Same curve as the existing snapshot code:
 *   rank 1  → 1/log2(3)  ≈ 0.6309
 *   rank 5  → 1/log2(7)  ≈ 0.3562
 *   rank 20 → 1/log2(22) ≈ 0.2243
 *   rank 50 → 1/log2(52) ≈ 0.1754
 *   null (unranked) → 0.3 (flat — they signal taste but not strength)
 */
export function computeRankWeight(rank: number | null | undefined): number {
  if (rank === null || rank === undefined) return 0.3
  if (!Number.isFinite(rank) || rank <= 0) return 0.3
  return 1 / Math.log2(rank + 2)
}

/**
 * Recency band on most-recent play. Deterministic step function so
 * the operator can read a number and know exactly which bucket the
 * artist/track is in.
 *
 *   played within 7 days  → 1.0
 *   played within 30 days → 0.5
 *   played within 90 days → 0.2
 *   older / never         → 0
 */
export function computeRecencyScore(
  lastPlayedAt: string | Date | null | undefined,
  now: Date | number = Date.now(),
): number {
  if (!lastPlayedAt) return 0
  const last =
    lastPlayedAt instanceof Date
      ? lastPlayedAt.getTime()
      : Date.parse(lastPlayedAt as string)
  if (!Number.isFinite(last)) return 0
  const nowMs = typeof now === 'number' ? now : now.getTime()
  const ageMs = nowMs - last
  if (ageMs < 0) return 1.0 // future-dated event — treat as fresh
  const DAY = 24 * 60 * 60 * 1000
  if (ageMs <= 7 * DAY) return 1.0
  if (ageMs <= 30 * DAY) return 0.5
  if (ageMs <= 90 * DAY) return 0.2
  return 0
}

/**
 * Composite artist affinity.
 *
 *   affinity_score = rankWeight                              [0..0.63]
 *                  + 0.5 * recencyScore                      [0..0.5]
 *                  + 0.1 * log10(1 + recent_play_count)      [0..~0.2]
 *                  + 0.05 * log10(1 + (play_count - recent)) [0..~0.15]
 *
 * Components are deliberately additive (not multiplicative) so missing
 * data — a user with no listening_events — degrades gracefully to
 * "rank_weight only" rather than zero.
 *
 * recent_play_count is double-counted intentionally: a track played
 * 10 times last week counts for both `play_count` and
 * `recent_play_count` factors, and that's the correct signal — recent
 * heavy play deserves more weight than evenly-distributed plays over
 * a year. The 0.1 vs 0.05 split encodes that.
 */
export function computeArtistAffinity(params: {
  rankWeight: number
  recencyScore: number
  playCount: number
  recentPlayCount: number
}): number {
  const { rankWeight, recencyScore, playCount, recentPlayCount } = params
  const olderPlays = Math.max(playCount - recentPlayCount, 0)
  const recentComponent = 0.1 * Math.log10(1 + Math.max(recentPlayCount, 0))
  const totalComponent = 0.05 * Math.log10(1 + olderPlays)
  return round4(rankWeight + 0.5 * recencyScore + recentComponent + totalComponent)
}

/**
 * Same shape as computeArtistAffinity but with rank vs play weighting
 * tuned for tracks. Tracks don't have a "saved" signal in our schema
 * (only favorite_tracks rank), so the recency component carries more
 * weight relative to rank.
 */
export function computeTrackAffinity(params: {
  rankWeight: number
  recencyScore: number
  playCount: number
}): number {
  const { rankWeight, recencyScore, playCount } = params
  const playComponent = 0.1 * Math.log10(1 + Math.max(playCount, 0))
  return round4(rankWeight + 0.5 * recencyScore + playComponent)
}

/**
 * Per-row weight contributed by an album. Albums don't have play
 * events at the same granularity tracks do, so this is just the
 * rank-weight curve (saved albums sit in the favorite_albums list,
 * which already ranks them by save order).
 */
export function computeAlbumRankWeight(rank: number | null | undefined): number {
  return computeRankWeight(rank)
}

// ── Round to 4 decimals (numeric(8,4) on disk) ──────────────────────
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
export { round4 as roundForStorage }
