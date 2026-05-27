'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  canonicalPair,
  COMPATIBILITY_ALGORITHM_VERSION,
  type CompatibilityBand,
  type SharedGenreEntry,
  type SharedRoomEntry,
  type SharedTraitEntry,
  type DivergencePoint,
  type ArchetypeAlignment,
} from '@/lib/identity/compatibility'
import { recomputeCompatibility } from '@/lib/identity/compatibility-recompute'

/**
 * lib/actions/compatibility.ts — Phase 6A.10
 *
 * Frontend-facing compatibility reader. Cookie-aware: ALL calls
 * resolve the calling user from the session; the action accepts a
 * target user_id and returns the (caller, target) compatibility
 * envelope.
 *
 * The envelope is normalized to "me / them" — even though storage
 * uses canonical-pair ordering (lex-smaller in user_id_a), the
 * caller always sees their data on the .me_* side. This keeps the
 * UI naive of pair canonicalization.
 *
 * Recompute strategy: lazy. If the cache row is missing OR stale
 * (algorithm_version mismatch), recompute on read. Cache writes
 * happen via the service-role admin path inside
 * recomputeCompatibility. This is fine for a small user base; a
 * future phase can add a cron-driven neighborhood recompute.
 */

export type CompatibilityEnvelope =
  | { state: 'unauthenticated' }
  | { state: 'self'; message: string }
  | { state: 'unknown_target' }
  | {
      state: 'ready'
      target_user_id: string
      score: number
      band: CompatibilityBand
      /** Always from the caller's perspective. */
      me_primary_archetype: string | null
      them_primary_archetype: string | null
      same_primary_archetype: boolean
      archetype_cross_listed: boolean
      shared_traits: Array<{
        trait_key: SharedTraitEntry['trait_key']
        my_band: SharedTraitEntry['a_band']
        their_band: SharedTraitEntry['b_band']
        alignment: SharedTraitEntry['alignment']
      }>
      shared_genres: Array<{
        genre: string
        my_weight: number
        their_weight: number
      }>
      shared_rooms: Array<{
        room_id: string
        slug: string | null
        name: string | null
        my_score: number
        their_score: number
      }>
      divergence_points: Array<{
        trait_key: DivergencePoint['trait_key']
        my_band: DivergencePoint['a_band']
        their_band: DivergencePoint['b_band']
        gap: DivergencePoint['gap']
      }>
      computed_at: string
      algorithm_version: string
    }

/**
 * Compute (or read cached) compatibility between the caller and
 * the target user. Recomputes when the cache is missing or stale.
 */
export async function getCompatibilityWith(
  targetUserId: string,
): Promise<CompatibilityEnvelope> {
  if (typeof targetUserId !== 'string' || targetUserId.length === 0) {
    return { state: 'unknown_target' }
  }
  // Soft slug validation — UUIDs only.
  if (!/^[0-9a-f-]{32,36}$/i.test(targetUserId)) {
    return { state: 'unknown_target' }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { state: 'unauthenticated' }
  const me = user.id

  if (targetUserId === me) {
    return {
      state: 'self',
      message: 'Compatibility against yourself is undefined.',
    }
  }

  // Verify target exists. Reads user_profiles; public-id-only lookup,
  // RLS-allowed (handle is public).
  const { data: targetRow } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('id', targetUserId)
    .maybeSingle()
  if (!targetRow) return { state: 'unknown_target' }

  // Canonical pair for cache lookup.
  const canon = canonicalPair(me, targetUserId)

  const { data: cached } = await supabase
    .from('listener_compatibility_scores')
    .select(
      'score, band, shared_traits, shared_genres, shared_rooms, archetype_alignment, divergence_points, computed_at, algorithm_version',
    )
    .eq('user_id_a', canon.user_id_a)
    .eq('user_id_b', canon.user_id_b)
    .maybeSingle()

  // Cache hot: version matches. Render directly.
  if (cached && cached.algorithm_version === COMPATIBILITY_ALGORITHM_VERSION) {
    return projectFromCanonical(targetUserId, canon.swapped, cached as CanonicalCacheRow)
  }

  // Cache cold or stale: recompute. The orchestrator writes back so
  // subsequent reads are hot.
  const recomputed = await recomputeCompatibility(me, targetUserId)

  // recomputeCompatibility writes data in canonical-pair shape. From
  // here, render from the caller's perspective. We already have the
  // computed envelope (returned in canonical-a/b labels); apply the
  // same projection.
  return projectFromCanonical(
    targetUserId,
    canon.swapped,
    {
      score: recomputed.result.score,
      band: recomputed.result.band,
      shared_traits: recomputed.result.shared_traits,
      shared_genres: recomputed.result.shared_genres,
      shared_rooms: recomputed.result.shared_rooms,
      archetype_alignment: recomputed.result.archetype_alignment,
      divergence_points: recomputed.result.divergence_points,
      computed_at: recomputed.computed_at,
      algorithm_version: recomputed.algorithm_version,
    },
  )
}

interface CanonicalCacheRow {
  score: number
  band: string
  shared_traits: unknown
  shared_genres: unknown
  shared_rooms: unknown
  archetype_alignment: unknown
  divergence_points: unknown
  computed_at: string
  algorithm_version: string
}

/**
 * Project a canonical-pair cache row (a = lex-smaller user) into
 * the caller's "me / them" frame.
 *
 * If `swapped` is true, the canonical user_id_a is actually the
 * TARGET (their identity is in the _a fields). We re-map so the
 * envelope always shows the caller as "me".
 */
function projectFromCanonical(
  targetUserId: string,
  swapped: boolean,
  row: CanonicalCacheRow,
): CompatibilityEnvelope {
  const sharedTraits = (row.shared_traits as SharedTraitEntry[]) ?? []
  const sharedGenres = (row.shared_genres as SharedGenreEntry[]) ?? []
  const sharedRooms = (row.shared_rooms as SharedRoomEntry[]) ?? []
  const divergence = (row.divergence_points as DivergencePoint[]) ?? []
  const archetypeAlignment = (row.archetype_alignment ?? {}) as ArchetypeAlignment

  return {
    state: 'ready',
    target_user_id: targetUserId,
    score: row.score,
    band: row.band as CompatibilityBand,
    me_primary_archetype: swapped
      ? archetypeAlignment.b_primary
      : archetypeAlignment.a_primary,
    them_primary_archetype: swapped
      ? archetypeAlignment.a_primary
      : archetypeAlignment.b_primary,
    same_primary_archetype: archetypeAlignment.same_primary === true,
    archetype_cross_listed: archetypeAlignment.cross_listed === true,
    shared_traits: sharedTraits.map((s) => ({
      trait_key: s.trait_key,
      my_band: swapped ? s.b_band : s.a_band,
      their_band: swapped ? s.a_band : s.b_band,
      alignment: s.alignment,
    })),
    shared_genres: sharedGenres.map((s) => ({
      genre: s.genre,
      my_weight: swapped ? s.b_weight : s.a_weight,
      their_weight: swapped ? s.a_weight : s.b_weight,
    })),
    shared_rooms: sharedRooms.map((s) => ({
      room_id: s.room_id,
      slug: s.slug,
      name: s.name,
      my_score: swapped ? s.b_score : s.a_score,
      their_score: swapped ? s.a_score : s.b_score,
    })),
    divergence_points: divergence.map((d) => ({
      trait_key: d.trait_key,
      my_band: swapped ? d.b_band : d.a_band,
      their_band: swapped ? d.a_band : d.b_band,
      gap: d.gap,
    })),
    computed_at: row.computed_at,
    algorithm_version: row.algorithm_version,
  }
}

/**
 * Find peers the caller shares at least one joined room with.
 * Used by the /compatibility index page to provide a candidate
 * set without inventing follower/social graphs.
 *
 * Returns up to `limit` distinct user_ids, sorted alphabetically
 * for deterministic UI ordering. Display name resolution is the
 * caller's responsibility (user_profiles read).
 */
export async function listMySharedRoomPeers(
  limit = 20,
): Promise<{ user_id: string; shared_room_count: number }[]> {
  const cap = Math.max(1, Math.min(limit, 100))
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // 1. Get the caller's joined room_ids.
  const { data: myMemberships } = await supabase
    .from('club_memberships')
    .select('room_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
  const myRoomIds = ((myMemberships ?? []) as Array<{ room_id: string }>)
    .map((m) => m.room_id)
    .filter((id): id is string => !!id)
  if (myRoomIds.length === 0) return []

  // 2. Get other members of those rooms (exclude me).
  const { data: peers } = await supabase
    .from('club_memberships')
    .select('user_id, room_id')
    .in('room_id', myRoomIds)
    .eq('status', 'active')
    .neq('user_id', user.id)
  const peerRows = (peers ?? []) as Array<{ user_id: string; room_id: string }>

  // 3. Count shared rooms per peer.
  const counts = new Map<string, number>()
  for (const p of peerRows) {
    counts.set(p.user_id, (counts.get(p.user_id) ?? 0) + 1)
  }

  // 4. Sort by shared count desc, alphabetical user_id tie-break for
  //    determinism.
  return [...counts.entries()]
    .map(([user_id, shared_room_count]) => ({ user_id, shared_room_count }))
    .sort((a, b) => {
      if (b.shared_room_count !== a.shared_room_count) {
        return b.shared_room_count - a.shared_room_count
      }
      return a.user_id.localeCompare(b.user_id)
    })
    .slice(0, cap)
}
