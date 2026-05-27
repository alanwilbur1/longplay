import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  canonicalPair,
  compatibilityBand,
  computeCompatibility,
  COMPATIBILITY_ALGORITHM_VERSION,
  type CompatibilityBand,
  type CompatibilityInput,
  type CompatibilityResult,
} from './compatibility'
import type { TraitBand, TraitKey } from './traits'

/**
 * lib/identity/compatibility-recompute.ts — Phase 6A.10
 *
 * DB-backed compatibility orchestrator. Reads both users' Layer 2 /
 * Layer 5 envelopes, calls the pure computeCompatibility helper,
 * upserts the result.
 *
 * Two reasons this lives behind a server-only barrier rather than
 * in the pure module:
 *   1. Service-role reads against the listener_* tables (Layer 5
 *      rows are owner-self-select; we need admin to fetch for both
 *      users in a single pass).
 *   2. The canonical pair ordering means each call writes ONE row,
 *      and either user reading later finds it.
 *
 * Idempotent. Re-running on the same pair produces byte-identical
 * envelope state — useful for "verify cache integrity" operator
 * sweeps later. Best-effort wrapped at call sites.
 */

export interface CompatibilityRecomputeResult {
  pair: { user_a: string; user_b: string }
  result: CompatibilityResult
  algorithm_version: typeof COMPATIBILITY_ALGORITHM_VERSION
  computed_at: string
  duration_ms: number
}

export async function recomputeCompatibility(
  userA: string,
  userB: string,
): Promise<CompatibilityRecomputeResult> {
  if (userA === userB) {
    throw new Error('[compatibility] cannot compute against self')
  }
  const startedAt = Date.now()
  const admin = getSupabaseAdminClient()

  const [inputA, inputB] = await Promise.all([
    readCompatibilityInput(admin, userA),
    readCompatibilityInput(admin, userB),
  ])

  const result = computeCompatibility(inputA, inputB)

  // Canonical ordering. The score / band / archetype_alignment are
  // symmetric, but shared_genres etc. carry a_*/b_* fields that
  // must reflect the canonical user_id_a side. Re-run computeCompat
  // with normalized order if needed — or, since the function is
  // symmetric, swap the labels.
  const canon = canonicalPair(userA, userB)
  const writeResult = canon.swapped ? swapResult(result) : result

  const computedAtIso = new Date().toISOString()
  const { error: upsertErr } = await admin
    .from('listener_compatibility_scores')
    .upsert(
      {
        user_id_a: canon.user_id_a,
        user_id_b: canon.user_id_b,
        score: writeResult.score,
        band: writeResult.band,
        shared_traits: writeResult.shared_traits,
        shared_genres: writeResult.shared_genres,
        shared_rooms: writeResult.shared_rooms,
        archetype_alignment: writeResult.archetype_alignment,
        divergence_points: writeResult.divergence_points,
        computed_at: computedAtIso,
        algorithm_version: COMPATIBILITY_ALGORITHM_VERSION,
      },
      { onConflict: 'user_id_a,user_id_b' },
    )
  if (upsertErr) {
    throw new Error(`[compatibility] upsert failed: ${upsertErr.message}`)
  }

  return {
    pair: { user_a: canon.user_id_a, user_b: canon.user_id_b },
    result: writeResult,
    algorithm_version: COMPATIBILITY_ALGORITHM_VERSION,
    computed_at: computedAtIso,
    duration_ms: Date.now() - startedAt,
  }
}

// ── Read the per-user envelope ───────────────────────────────────

async function readCompatibilityInput(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  userId: string,
): Promise<CompatibilityInput> {
  const TOP_GENRES = 15
  const TOP_ROOMS = 20 // computeCompat re-takes top-10 internally

  const [archetypesRes, traitsRes, genresRes, roomsRes] = await Promise.all([
    admin
      .from('listener_archetype_snapshots')
      .select('archetype_key, rank')
      .eq('user_id', userId)
      .order('rank', { ascending: true }),
    admin
      .from('listener_identity_traits')
      .select('trait_key, trait_band')
      .eq('user_id', userId),
    admin
      .from('listener_genres')
      .select('genre, weighted_score')
      .eq('user_id', userId)
      .order('weighted_score', { ascending: false })
      .limit(TOP_GENRES),
    admin
      .from('room_affinity_scores')
      .select('room_id, score, rooms!inner(slug, name)')
      .eq('user_id', userId)
      .order('score', { ascending: false })
      .limit(TOP_ROOMS),
  ])

  type ArchetypeRow = { archetype_key: string; rank: number }
  type TraitRow = { trait_key: string; trait_band: string | null }
  type GenreRow = { genre: string; weighted_score: number }
  type RoomRow = {
    room_id: string
    score: number
    rooms?:
      | { slug?: string; name?: string }
      | { slug?: string; name?: string }[]
      | null
  }

  const archetypeRows = (archetypesRes.data ?? []) as unknown as ArchetypeRow[]
  const traitRows = (traitsRes.data ?? []) as unknown as TraitRow[]
  const genreRows = (genresRes.data ?? []) as unknown as GenreRow[]
  const roomRows = (roomsRes.data ?? []) as unknown as RoomRow[]

  const primary = archetypeRows[0]?.archetype_key ?? null
  const alternates = archetypeRows.slice(1).map((a) => a.archetype_key)

  const traitBands: Partial<Record<TraitKey, TraitBand>> = {}
  for (const t of traitRows) {
    traitBands[t.trait_key as TraitKey] = (t.trait_band as TraitBand) ?? 'unknown'
  }

  const topGenres = genreRows.map((g) => ({
    genre: g.genre,
    weighted_score: g.weighted_score,
  }))

  const topRooms = roomRows.map((r) => {
    const room = Array.isArray(r.rooms) ? r.rooms[0] : r.rooms
    return {
      room_id: r.room_id,
      slug: room?.slug ?? null,
      name: room?.name ?? null,
      score: r.score,
    }
  })

  return {
    user_id: userId,
    primary_archetype_key: primary,
    alternate_archetype_keys: alternates,
    trait_bands: traitBands,
    top_genres: topGenres,
    top_rooms: topRooms,
  }
}

// ── Swap a/b labels in the result envelope (for canonical write) ─

function swapResult(r: CompatibilityResult): CompatibilityResult {
  // Score, band, components are symmetric. Only the a_*/b_* and
  // archetype_alignment.a_/.b_ fields need swapping.
  return {
    score: r.score,
    band: r.band as CompatibilityBand,
    components: r.components,
    shared_traits: r.shared_traits.map((s) => ({
      trait_key: s.trait_key,
      a_band: s.b_band,
      b_band: s.a_band,
      alignment: s.alignment,
    })),
    shared_genres: r.shared_genres.map((s) => ({
      genre: s.genre,
      a_weight: s.b_weight,
      b_weight: s.a_weight,
    })),
    shared_rooms: r.shared_rooms.map((s) => ({
      room_id: s.room_id,
      slug: s.slug,
      name: s.name,
      a_score: s.b_score,
      b_score: s.a_score,
    })),
    archetype_alignment: {
      a_primary: r.archetype_alignment.b_primary,
      b_primary: r.archetype_alignment.a_primary,
      same_primary: r.archetype_alignment.same_primary,
      cross_listed: r.archetype_alignment.cross_listed,
    },
    divergence_points: r.divergence_points.map((d) => ({
      trait_key: d.trait_key,
      a_band: d.b_band,
      b_band: d.a_band,
      gap: d.gap,
    })),
  }
}
