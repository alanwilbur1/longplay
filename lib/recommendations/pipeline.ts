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
 * Fetches:
 *   1. user_profiles.preferences.calibrationAnswers
 *   2. listening_profile_snapshots.{top_genres, affinity_tags,
 *      top_artist_ids, recent_density}     ← canonical genres
 *   3. artist_genre_enrichments.canonical_genres (status=succeeded)
 *      ← enriched-only genres (anything in canonical is excluded)
 *   4. favorite_artists.{name, rank}        ← top artist names
 *   5. club_memberships                     ← joined room slugs
 *   6. rooms (visibility=public, weight desc, limit 50)
 *   7. cycles + albums                      ← currentAlbumArtist per room
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

  // ── 3. Enriched genres (Last.fm) — anything in canonical is removed
  //      so a genre present in both contributes only at canonical
  //      strength. The scorer also enforces this, but doing it at the
  //      input layer keeps the debug surface honest. ──────────────────
  const { data: enrichmentRows } = await supabase
    .from('artist_genre_enrichments')
    .select('canonical_genres')
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .limit(200)
  const enrichedSet = new Set<string>()
  for (const row of (enrichmentRows ?? []) as Array<{
    canonical_genres: string[] | null
  }>) {
    for (const g of row.canonical_genres ?? []) if (g) enrichedSet.add(g)
  }
  // Fallback: when no snapshot exists yet, use favorite_artists.genres
  // as canonical and treat enrichments as additive.
  if (canonicalGenres.length === 0) {
    const { data: favArtists } = await supabase
      .from('favorite_artists')
      .select('genres')
      .eq('user_id', userId)
      .limit(50)
    const seen = new Set<string>()
    for (const row of (favArtists ?? []) as Array<{ genres: string[] | null }>) {
      for (const g of row.genres ?? []) if (g) seen.add(g)
    }
    canonicalGenres = Array.from(seen)
  }
  const canonicalLower = new Set(canonicalGenres.map((g) => g.toLowerCase()))
  const enrichedGenres = Array.from(enrichedSet).filter(
    (g) => !canonicalLower.has(g.toLowerCase()),
  )

  // ── 4. Top artist names ────────────────────────────────────────────
  const { data: topArtists } = await supabase
    .from('favorite_artists')
    .select('name, rank')
    .eq('user_id', userId)
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(20)
  const topArtistNames = (
    (topArtists ?? []) as Array<{ name: string }>
  )
    .map((a) => a.name)
    .filter((n): n is string => !!n)

  // ── 5. Joined rooms (exclude) ──────────────────────────────────────
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

  // ── 6. Candidate rooms ─────────────────────────────────────────────
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

  // ── 7. Cycle → album join for currentAlbumArtist + album tags ──────
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
