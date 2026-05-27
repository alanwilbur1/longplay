import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecommendationInput, RoomForRecommendation } from './types'

/**
 * lib/recommendations/inputs.ts — Phase 6A.5
 *
 * Shared assembly of RecommendationInput from Supabase. Used by:
 *   - lib/recommendations/pipeline.ts at request time (cookie-aware
 *     supabase client; excludeJoinedRooms=true)
 *   - lib/recommendations/affinity-cache.ts at recompute time
 *     (service-role admin client; excludeJoinedRooms=false — the
 *     cache holds scores for ALL rooms, joined-filtering happens
 *     at serve time)
 *
 * Both call sites speak the same SupabaseClient interface (queries
 * are public-read RLS or admin-bypassed), so the assembly is shared.
 *
 * Returns RecommendationInput + the snapshot's computed_at (so the
 * cache can stamp source_snapshot_computed_at and detect drift at
 * serve time).
 */

export interface AssembleInputsOptions {
  /** When true, reads club_memberships and populates joinedRoomSlugs
   *  so the scorer can filter joined rooms inline (live serving
   *  path). When false, joinedRoomSlugs is [] — the caller is
   *  expected to filter joined rooms after scoring (cache recompute
   *  path: we score ALL rooms so the cache is membership-agnostic). */
  excludeJoinedRooms: boolean
}

export interface AssembledInputs {
  input: RecommendationInput
  sourceSnapshotComputedAt: string | null
}

export async function assembleRecommendationInputs(
  supabase: SupabaseClient,
  userId: string,
  options: AssembleInputsOptions,
): Promise<AssembledInputs> {
  // ── 1. Calibration answers ─────────────────────────────────────────
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
  // Reads listening_profile_snapshots which now carries the Layer-2-
  // unioned top_genres (post-Phase 6A.4 cutover). Also pull
  // computed_at so the cache can stamp source_snapshot_computed_at.
  const { data: snapshot } = await supabase
    .from('listening_profile_snapshots')
    .select('top_genres, affinity_tags, top_artist_ids, recent_density, computed_at')
    .eq('user_id', userId)
    .maybeSingle()

  type Snapshot = {
    top_genres?: string[] | null
    affinity_tags?: string[] | null
    top_artist_ids?: string[] | null
    recent_density?: 'low' | 'medium' | 'high' | null
    computed_at?: string | null
  }
  const snap = (snapshot ?? null) as Snapshot | null

  let canonicalGenres = Array.isArray(snap?.top_genres) ? snap!.top_genres! : []
  const affinityTags = Array.isArray(snap?.affinity_tags) ? snap!.affinity_tags! : []
  const recentDensity = snap?.recent_density ?? null
  const sourceSnapshotComputedAt = snap?.computed_at ?? null

  // ── 3. Long-tail genres (Layer 2 listener_genres rank IS NULL) ─────
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

  // ── 4. Snapshot-empty fallback: pull canonical_genres directly
  //      from listener_artists (Layer 2). Same as pipeline.ts fallback. ─
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

  // ── 5. Top artist names (Layer 2 listener_artists) ─────────────────
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

  // ── 6. Joined rooms — only when the caller wants live filtering ────
  let joinedRoomSlugs: string[] = []
  if (options.excludeJoinedRooms) {
    const { data: memberships } = await supabase
      .from('club_memberships')
      .select('rooms(slug)')
      .eq('user_id', userId)
      .eq('status', 'active')
    joinedRoomSlugs = ((memberships ?? []) as unknown as Array<{
      rooms?: { slug?: string } | { slug?: string }[]
    }>)
      .map((m) => {
        const r = m.rooms
        const slugFromObj = Array.isArray(r) ? r[0]?.slug : r?.slug
        return slugFromObj ?? null
      })
      .filter((s): s is string => !!s)
  }

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
  const cycleIds = rawRooms
    .map((r) => r.current_cycle_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  const cycleAlbumMap = new Map<
    string,
    { artist: string | null; emotional_tags: string[]; sonic_tags: string[] }
  >()
  if (cycleIds.length > 0) {
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

  return {
    input: {
      calibrationAnswers,
      canonicalGenres,
      enrichedGenres,
      affinityTags,
      topArtistNames,
      recentDensity,
      joinedRoomSlugs,
      candidates,
    },
    sourceSnapshotComputedAt,
  }
}
