import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { upsertAndPrune } from '@/lib/db/upsert-and-prune'
import {
  ARCHETYPE_CATALOG,
  rankArchetypes,
  type MatchedArchetype,
} from './archetypes'
import {
  IDENTITY_ALGORITHM_VERSION,
  TRAIT_KEYS,
  computeAlbumFocusScore,
  computeConsistencyScore,
  computeExploratoryScore,
  computeGenreBreadthScore,
  computeNocturnalScore,
  computeObscurityScore,
  computeRecencyBiasScore,
  type TraitKey,
  type TraitResult,
} from './traits'

// Note: not marked with `import 'server-only'` so scripts/test-identity.ts
// can import the pure trait/archetype helpers via tsx outside Next's
// bundler. getSupabaseAdminClient() is itself server-only at runtime,
// so any accidental client-bundle import would fail there.

/**
 * lib/identity/recompute.ts — Phase 6A.6
 *
 * DB-backed orchestrator for the listener identity layer. Reads
 * aggregates from Layer 1-4 tables, calls pure trait/archetype
 * helpers, writes listener_identity_traits + listener_archetype_
 * snapshots.
 *
 * Called from syncProviderForUser after the Layer 4 affinity cache
 * recompute. Best-effort: a failure here doesn't roll back any
 * upstream state.
 *
 * Delete-then-insert per user gives pure regenerate semantics — old
 * traits from removed archetypes don't linger; rank=1 is always the
 * current primary.
 */

const RECENT_WINDOW_DAYS = 30
const TOP_N_ARCHETYPES = 3
const MIN_ARCHETYPE_CONFIDENCE = 0.4
const SUPPORTING_ROOM_LIMIT = 3
const SUPPORTING_GENRE_LIMIT = 3
const SUPPORTING_TRAIT_LIMIT = 3

export interface RecomputeIdentityResult {
  user_id: string
  traits_written: number
  archetypes_written: number
  primary_archetype_key: string | null
  primary_confidence: number | null
  duration_ms: number
  algorithm_version: typeof IDENTITY_ALGORITHM_VERSION
}

export async function recomputeListenerIdentity(
  userId: string,
): Promise<RecomputeIdentityResult> {
  const startedAt = Date.now()
  const admin = getSupabaseAdminClient()
  const now = new Date()
  const recentSinceIso = new Date(
    now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  // ── Read aggregates in parallel ──────────────────────────────────
  const [
    rankedArtistsRes,        // for obscurity_score (popularity) + ranked count
    listenerArtistsAggRes,   // for recency_bias_score
    listenerGenresRes,       // for genre_breadth + consistency
    savedAlbumsCountRes,
    topTrackCountRes,
    recentEventsRes,         // for nocturnal + exploratory
    recentArtistDistinctRes, // for exploratory_score
    topRoomsRes,             // for supporting_rooms
  ] = await Promise.all([
    // Top-20 ranked favorite_artists with popularity for obscurity.
    // Layer 1 read — popularity isn't in Layer 2's listener_artists.
    admin
      .from('favorite_artists')
      .select('popularity')
      .eq('user_id', userId)
      .not('rank', 'is', null)
      .order('rank', { ascending: true })
      .limit(20),
    // Aggregate play counts across all listener_artists for the user.
    admin
      .from('listener_artists')
      .select('play_count, recent_play_count')
      .eq('user_id', userId),
    // All genres for breadth + consistency.
    admin
      .from('listener_genres')
      .select('genre, weighted_score')
      .eq('user_id', userId),
    admin
      .from('listener_albums')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', userId),
    admin
      .from('listener_tracks')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('top_rank', 'is', null),
    // Recent listening events for nocturnal — pull just the timestamp.
    admin
      .from('listening_events')
      .select('played_at')
      .eq('user_id', userId)
      .gte('played_at', recentSinceIso),
    // Distinct recent artists for exploratory. Aggregating via PostgREST
    // is awkward — fetch artist_name for recent events and dedupe app-side.
    admin
      .from('listening_events')
      .select('artist_name')
      .eq('user_id', userId)
      .gte('played_at', recentSinceIso)
      .not('artist_name', 'is', null),
    // Top room affinity rows for supporting_rooms. JOIN to rooms for
    // slug/name — the archetype snapshot persists the display info
    // directly so UI doesn't need a follow-up lookup.
    admin
      .from('room_affinity_scores')
      .select('room_id, score, rooms!inner(slug, name)')
      .eq('user_id', userId)
      .order('score', { ascending: false })
      .limit(SUPPORTING_ROOM_LIMIT * 2),
  ])

  type ArtistPopRow = { popularity: number | null }
  type ListenerArtistAggRow = { play_count: number; recent_play_count: number }
  type GenreRow = { genre: string; weighted_score: number }
  type EventRow = { played_at: string }
  type RecentArtistRow = { artist_name: string }
  type RoomAffinityRow = {
    room_id: string
    score: number
    rooms?:
      | { slug?: string; name?: string }
      | { slug?: string; name?: string }[]
      | null
  }

  const rankedArtists = (rankedArtistsRes.data ?? []) as unknown as ArtistPopRow[]
  const listenerArtistsAgg = (listenerArtistsAggRes.data ?? []) as unknown as ListenerArtistAggRow[]
  const listenerGenres = (listenerGenresRes.data ?? []) as unknown as GenreRow[]
  const savedAlbumCount = savedAlbumsCountRes.count ?? 0
  const topTrackCount = topTrackCountRes.count ?? 0
  const recentEvents = (recentEventsRes.data ?? []) as unknown as EventRow[]
  const recentArtistRows = (recentArtistDistinctRes.data ?? []) as unknown as RecentArtistRow[]
  const topRoomRows = (topRoomsRes.data ?? []) as unknown as RoomAffinityRow[]

  // ── Derive intermediate aggregates ──────────────────────────────
  const totalPlayCount = listenerArtistsAgg.reduce(
    (sum, r) => sum + (r.play_count ?? 0),
    0,
  )
  const recentPlayCount = listenerArtistsAgg.reduce(
    (sum, r) => sum + (r.recent_play_count ?? 0),
    0,
  )
  const totalRankedArtists = listenerArtistsAgg.length
  const distinctRecentArtists = new Set(
    recentArtistRows.map((r) => r.artist_name).filter(Boolean),
  ).size
  const distinctGenreCount = listenerGenres.length

  // ── Compute traits (pure functions) ──────────────────────────────
  const traitResults: TraitResult[] = [
    computeObscurityScore(rankedArtists),
    computeExploratoryScore({ distinctRecentArtists, totalRankedArtists }),
    computeAlbumFocusScore({ savedAlbumCount, topTrackCount }),
    computeNocturnalScore(recentEvents),
    computeRecencyBiasScore({ totalPlayCount, recentPlayCount }),
    computeGenreBreadthScore({ distinctGenreCount }),
    computeConsistencyScore(listenerGenres),
  ]

  // Index by trait_key for the archetype matcher.
  const traitScoresByKey: Record<TraitKey, number | null> = TRAIT_KEYS.reduce(
    (acc, k) => {
      acc[k] = null
      return acc
    },
    {} as Record<TraitKey, number | null>,
  )
  for (const t of traitResults) {
    traitScoresByKey[t.trait_key as TraitKey] = t.trait_score
  }

  // ── Rank archetypes ──────────────────────────────────────────────
  const ranked = rankArchetypes(
    ARCHETYPE_CATALOG,
    traitScoresByKey,
    TOP_N_ARCHETYPES,
    MIN_ARCHETYPE_CONFIDENCE,
  )

  // ── Build supporting_rooms / supporting_genres (shared across
  //    all ranked archetypes for now — the per-archetype "which rooms
  //    fit THIS archetype's flavor" is a future refinement) ───────
  const supportingRooms = topRoomRows.slice(0, SUPPORTING_ROOM_LIMIT).map((r) => {
    const room = Array.isArray(r.rooms) ? r.rooms[0] : r.rooms
    return {
      room_id: r.room_id,
      slug: room?.slug ?? null,
      name: room?.name ?? null,
      score: roundForJson(r.score),
    }
  })

  const supportingGenres = [...listenerGenres]
    .sort((a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0))
    .slice(0, SUPPORTING_GENRE_LIMIT)
    .map((g) => ({
      genre: g.genre,
      weighted_score: roundForJson(g.weighted_score),
    }))

  // ── Persist: UPSERT-and-prune per user (Phase 6A.14) ────────────
  // Previously: delete-then-insert. Wiped traits + archetypes briefly
  // every recompute, which the identity UI would render as "no
  // archetype". UPSERT keeps the tables continuously populated; the
  // prune step at the end drops trait rows or archetype rows that
  // dropped out of this recompute (e.g. archetype that no longer
  // clears the confidence threshold).
  //
  // Service role bypasses RLS. The two tables have no client write
  // grants. Persist below uses upsertAndPrune; the call is moved
  // AFTER the row payloads are built so the upsert is the only write.
  const computedAt = now.toISOString()

  // Traits — one row per trait_key, including 'unknown' traits so
  // operator can see which traits had insufficient data.
  const traitRows = traitResults.map((t) => ({
    user_id: userId,
    trait_key: t.trait_key,
    trait_score: t.trait_score,
    trait_band: t.trait_band,
    contributing_factors: t.contributing_factors,
    computed_at: computedAt,
    algorithm_version: IDENTITY_ALGORITHM_VERSION,
  }))

  // Archetypes — top-N eligible, ranked 1..N. Each row carries the
  // top contributing traits (the matcher's per-trait contributions
  // sorted by score) and shares the user-level supporting_rooms /
  // supporting_genres. Empty when no archetype reached MIN_CONFIDENCE.
  const archetypeRows = ranked.map((m: MatchedArchetype, i: number) => ({
    user_id: userId,
    archetype_key: m.key,
    archetype_label: m.label,
    confidence_score: m.confidence,
    rank: i + 1,
    supporting_traits: [...m.trait_contributions]
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, SUPPORTING_TRAIT_LIMIT),
    supporting_rooms: supportingRooms,
    supporting_genres: supportingGenres,
    computed_at: computedAt,
    algorithm_version: IDENTITY_ALGORITHM_VERSION,
  }))

  // Run both upsert-and-prunes in parallel — they target independent
  // tables. Each is atomic-safe on its own; the parallel scheduling
  // just trims wall-clock time. A failure in either throws and the
  // caller's existing try/catch handles it.
  const [traitsResult, archetypesResult] = await Promise.all([
    upsertAndPrune({
      admin,
      table: 'listener_identity_traits',
      userId,
      rows: traitRows,
      keyCol: 'trait_key',
      onConflict: 'user_id,trait_key',
    }),
    upsertAndPrune({
      admin,
      table: 'listener_archetype_snapshots',
      userId,
      rows: archetypeRows,
      keyCol: 'archetype_key',
      onConflict: 'user_id,archetype_key',
    }),
  ])
  const traitsWritten = traitsResult.upserted
  const archetypesWritten = archetypesResult.upserted

  return {
    user_id: userId,
    traits_written: traitsWritten,
    archetypes_written: archetypesWritten,
    primary_archetype_key: ranked[0]?.key ?? null,
    primary_confidence: ranked[0]?.confidence ?? null,
    duration_ms: Date.now() - startedAt,
    algorithm_version: IDENTITY_ALGORITHM_VERSION,
  }
}

function roundForJson(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

/**
 * Read helper for the future identity UI / debug surface. Returns
 * the user's current trait + archetype state in one shape. Honors
 * RLS via the supplied supabase client; pass a service-role admin
 * client only when querying on behalf of another user.
 */
export interface IdentitySnapshot {
  traits: Array<{
    trait_key: string
    trait_score: number | null
    trait_band: string | null
    contributing_factors: Record<string, unknown>
    computed_at: string
    algorithm_version: string
  }>
  archetypes: Array<{
    archetype_key: string
    archetype_label: string
    confidence_score: number
    rank: number
    supporting_traits: unknown
    supporting_rooms: unknown
    supporting_genres: unknown
    computed_at: string
    algorithm_version: string
  }>
}

export async function readListenerIdentity(
  supabase: SupabaseClient,
  userId: string,
): Promise<IdentitySnapshot> {
  const [traitsRes, archetypesRes] = await Promise.all([
    supabase
      .from('listener_identity_traits')
      .select(
        'trait_key, trait_score, trait_band, contributing_factors, computed_at, algorithm_version',
      )
      .eq('user_id', userId),
    supabase
      .from('listener_archetype_snapshots')
      .select(
        'archetype_key, archetype_label, confidence_score, rank, supporting_traits, supporting_rooms, supporting_genres, computed_at, algorithm_version',
      )
      .eq('user_id', userId)
      .order('rank', { ascending: true }),
  ])

  return {
    traits: (traitsRes.data ?? []) as IdentitySnapshot['traits'],
    archetypes: (archetypesRes.data ?? []) as IdentitySnapshot['archetypes'],
  }
}
