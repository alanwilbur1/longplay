/**
 * lib/recommendations/pipeline.ts
 *
 * v2.1 recommendation pipeline — shared between the production
 * server action (lib/recommendations/index.ts) and the auth-gated
 * debug route (app/api/debug/recommendations/route.ts).
 *
 * NOT a 'use server' file. The server action wraps this and strips
 * to the public RecommendedRoom[] shape; the debug route returns
 * the full RecommendationPipelineDiagnostic so we can inspect every
 * stage of scoring + diversification.
 *
 * Schema reads only — no writes, no migrations required. Joins
 * rooms → cycles → albums in a second query so each room can carry
 * its current cycle's featured artist for the artist-match factor.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { explainFactors } from './explainer'
import {
  rankRooms,
  scenarioTagsFromAnswers,
  listenerEnergyFromAnswers,
  scoreAllCandidates,
  SCORE_VERSION,
} from './scorer'
import type {
  ExplanationFactor,
  RoomForRecommendation,
} from './types'

export interface RecommendationPipelineDiagnostic {
  score_version: typeof SCORE_VERSION
  user_id: string
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
   *  by score descending. Limited to top 25 in the response payload
   *  to keep things readable; full count available via candidates_after_filter. */
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
 * Fetches (Phase 6A.4 — Layer 2 cutover):
 *   1. user_profiles.preferences.calibrationAnswers
 *   2. listening_profile_snapshots.{top_genres, affinity_tags,
 *      top_artist_ids, recent_density}
 *      ← top_genres is already the canonical (Spotify ∪ enrichment)
 *        union — the Layer 2 substrate does the union upstream.
 *   3. listener_genres (rank > 15 long-tail)
 *      ← genres present in the user's data but not in top-15.
 *        Scores at the lower W_ENRICHED_GENRE weight (see scorer).
 *   4. listener_artists.display_name (top 20 by top_rank)
 *      ← top artist names. Replaces the legacy favorite_artists
 *        direct read.
 *   6. club_memberships                     ← joined room slugs
 *   7. rooms (visibility=public, weight desc, limit 50)
 *   8. cycles + albums                      ← currentAlbumArtist per room
 *
 * Removed in 6A.4:
 *   - artist_genre_enrichments direct read + canonical-vs-enriched
 *     set difference (now precomputed in Layer 2)
 *   - favorite_artists fallback (listener_artists is the new fallback;
 *     listener_artists is always populated alongside favorite_artists
 *     by the sync orchestrator, so any user with favorites has
 *     listener_artists)
 *
 * Then scores every candidate and applies MMR diversification.
 */
export async function runRecommendationPipeline(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
): Promise<RecommendationPipelineDiagnostic> {
  // ── 1. Calibration answers ──────────────────────────────────────────
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle()
  const preferences = (profile?.preferences ?? {}) as {
    calibrationAnswers?: Record<string, string[]>
  }
  const calibrationAnswers = preferences.calibrationAnswers ?? {}

  // ── 2. Snapshot (canonical genres + affinity tags + density) ───────
  // top_genres is already the canonical Spotify ∪ enrichment union
  // (Layer 2 owns the merge as of Phase 6A.4). The recommender no
  // longer re-derives the union at request time.
  const { data: snapshot } = await supabase
    .from('listening_profile_snapshots')
    .select('top_genres, affinity_tags, top_artist_ids, recent_density')
    .eq('user_id', userId)
    .maybeSingle()

  type Snapshot = {
    top_genres?: string[] | null
    affinity_tags?: string[] | null
    top_artist_ids?: string[] | null
    recent_density?: 'low' | 'medium' | 'high' | null
  }
  const snap = (snapshot ?? null) as Snapshot | null

  let canonicalGenres = Array.isArray(snap?.top_genres) ? snap!.top_genres! : []
  const affinityTags = Array.isArray(snap?.affinity_tags) ? snap!.affinity_tags! : []
  const recentDensity = snap?.recent_density ?? null

  // ── 3. Long-tail genres (Layer 2 — listener_genres beyond top 15) ──
  // These are genres present in the user's listening graph but that
  // didn't make the snapshot's top_genres cut. They score at
  // W_ENRICHED_GENRE strength (half of W_CANONICAL_GENRE) — the same
  // role the old "enriched-only" set played, but now the source
  // includes long-tail Spotify genres too, not just Last.fm.
  const { data: longTailRows } = await supabase
    .from('listener_genres')
    .select('genre')
    .eq('user_id', userId)
    .is('rank', null)
    .limit(50)
  const canonicalLower = new Set(canonicalGenres.map((g) => g.toLowerCase()))
  const enrichedGenres = ((longTailRows ?? []) as Array<{ genre: string }>)
    .map((r) => r.genre)
    .filter((g): g is string => !!g)
    .filter((g) => !canonicalLower.has(g.toLowerCase()))

  // ── 4. Fallback: snapshot missing, read Layer 2 directly ───────────
  // listener_artists.canonical_genres carries the union too. This
  // path fires when the snapshot recompute failed but Layer 2
  // succeeded — both run inside the same sync but as separate
  // best-effort steps.
  if (canonicalGenres.length === 0) {
    const { data: layer2Artists } = await supabase
      .from('listener_artists')
      .select('canonical_genres')
      .eq('user_id', userId)
      .order('top_rank', { ascending: true, nullsFirst: false })
      .limit(50)
    const seen = new Set<string>()
    for (const row of (layer2Artists ?? []) as Array<{
      canonical_genres: string[] | null
    }>) {
      for (const g of row.canonical_genres ?? []) if (g) seen.add(g)
    }
    canonicalGenres = Array.from(seen)
  }

  // ── 5. Top artist names from Layer 2 ───────────────────────────────
  // listener_artists.display_name is identical content to
  // favorite_artists.name (the Layer 2 recompute copies it through)
  // — but reading from Layer 2 keeps all artist-side reads on one
  // table, ready for Layer 4 (room_affinity_scores) which will JOIN
  // listener_artists.canonical_artist_key directly.
  const { data: topArtists } = await supabase
    .from('listener_artists')
    .select('display_name, top_rank')
    .eq('user_id', userId)
    .not('top_rank', 'is', null)
    .order('top_rank', { ascending: true })
    .limit(20)
  const topArtistNames = (
    (topArtists ?? []) as Array<{ display_name: string }>
  )
    .map((a) => a.display_name)
    .filter((n): n is string => !!n)

  // ── 6. Joined rooms (exclude) ──────────────────────────────────────
  const { data: memberships } = await supabase
    .from('club_memberships')
    .select('rooms(slug)')
    .eq('user_id', userId)
    .eq('status', 'active')
  const joinedRoomSlugs = ((memberships ?? []) as unknown as Array<{
    rooms?: { slug?: string } | { slug?: string }[]
  }>)
    .map((m) => {
      const r = m.rooms
      const slugFromObj = Array.isArray(r) ? r[0]?.slug : r?.slug
      return slugFromObj ?? null
    })
    .filter((s): s is string => !!s)

  // ── 7. Candidate rooms ─────────────────────────────────────────────
  const { data: rooms } = await supabase
    .from('rooms')
    .select(
      'id, slug, name, description, tagline, type, visibility, genres, moods, energy_level, cadence, featured, cover_art, recommendation_weight, member_count, current_cycle_id',
    )
    .eq('visibility', 'public')
    .order('recommendation_weight', { ascending: false })
    .limit(50)

  type RawRoom = Record<string, unknown> & {
    current_cycle_id?: string | null
  }
  const rawRooms = (rooms ?? []) as unknown as RawRoom[]

  // ── 8. Cycle → album join for currentAlbumArtist + album tags ──────
  // Two-step join: collect cycle IDs from rooms, then SELECT cycles
  // + albums in one nested query. Predictable and explicit.
  const cycleIds = rawRooms
    .map((r) => r.current_cycle_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  const cycleAlbumMap = new Map<
    string,
    { artist: string | null; emotional_tags: string[]; sonic_tags: string[] }
  >()
  if (cycleIds.length > 0) {
    // Two-step join. We use the unhinted nested-select form
    // (`albums(...)` without a `!fk_name` directive) because `cycles`
    // has exactly one FK to `albums` (cycles.album_id), so PostgREST
    // unambiguously resolves it without needing the constraint name.
    // The hinted form is brittle: if the Postgres constraint name
    // ever changed (e.g. a migration rename), the join would silently
    // return nulls and artist-match would never fire.
    const { data: cycleRows } = await supabase
      .from('cycles')
      .select('id, album_id, albums(artist, emotional_tags, sonic_tags)')
      .in('id', cycleIds)
    const cycles = (cycleRows ?? []) as unknown as Array<{
      id: string
      albums?:
        | { artist?: string | null; emotional_tags?: string[]; sonic_tags?: string[] }
        | { artist?: string | null; emotional_tags?: string[]; sonic_tags?: string[] }[]
        | null
    }>
    for (const c of cycles) {
      const a = Array.isArray(c.albums) ? c.albums[0] : c.albums
      if (!a) continue
      cycleAlbumMap.set(c.id, {
        artist: a.artist ?? null,
        emotional_tags: Array.isArray(a.emotional_tags) ? a.emotional_tags : [],
        sonic_tags: Array.isArray(a.sonic_tags) ? a.sonic_tags : [],
      })
    }
  }

  const candidates: RoomForRecommendation[] = rawRooms.map((row) => {
    const cycleId =
      typeof row.current_cycle_id === 'string' ? row.current_cycle_id : null
    const album = cycleId ? cycleAlbumMap.get(cycleId) : undefined
    return {
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      description: String(row.description ?? ''),
      tagline: (row.tagline as string | null) ?? null,
      type: String(row.type ?? ''),
      visibility: String(row.visibility ?? ''),
      genres: (row.genres as string[] | null) ?? [],
      moods: (row.moods as string[] | null) ?? [],
      energy_level:
        (row.energy_level as 'low' | 'medium' | 'high' | null) ?? null,
      cadence:
        (row.cadence as
          | 'weekly'
          | 'biweekly'
          | 'monthly'
          | 'seasonal'
          | 'ongoing'
          | null) ?? null,
      featured: Boolean(row.featured),
      cover_art: (row.cover_art as string | null) ?? null,
      recommendation_weight: Number(row.recommendation_weight ?? 50),
      member_count: Number(row.member_count ?? 0),
      currentAlbumArtist: album?.artist ?? null,
      currentAlbumEmotionalTags: album?.emotional_tags ?? [],
      currentAlbumSonicTags: album?.sonic_tags ?? [],
    }
  })

  // ── Score + rank ────────────────────────────────────────────────────
  const input = {
    calibrationAnswers,
    canonicalGenres,
    enrichedGenres,
    affinityTags,
    topArtistNames,
    recentDensity,
    joinedRoomSlugs,
    candidates,
  }

  const scenarioTags = scenarioTagsFromAnswers(calibrationAnswers)
  const listenerEnergy = listenerEnergyFromAnswers(calibrationAnswers)

  // Pre-sort + pre-MMR scoring snapshot for diagnostics.
  const allScored = scoreAllCandidates(input)
  const sortedScored = [...allScored].sort((a, b) => b.score - a.score)

  const ranked = rankRooms(input, limit)

  return {
    score_version: SCORE_VERSION,
    user_id: userId,
    inputs: {
      calibration_answers: calibrationAnswers,
      canonical_genres: canonicalGenres,
      enriched_genres: enrichedGenres,
      affinity_tags: affinityTags,
      top_artist_names: topArtistNames,
      recent_density: recentDensity,
      scenario_tags: scenarioTags,
      listener_energy: listenerEnergy,
      joined_room_slugs: joinedRoomSlugs,
    },
    candidates_seen: rawRooms.length,
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
