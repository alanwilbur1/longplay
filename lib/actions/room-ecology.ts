'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type {
  AdjacencyBand,
  DominantArchetypeEntry,
  DominantGenreEntry,
  DominantTraitEntry,
  EnergyProfile,
  RoomDriftSummary,
} from '@/lib/ecology/computation'
import type { TraitKey } from '@/lib/identity/traits'

/**
 * lib/actions/room-ecology.ts — Phase 6A.11
 *
 * Frontend-facing reader for the room ecology + adjacency caches.
 * No auth gate on the reads — both tables are public-SELECT
 * (matches the rooms catalog posture; ecology is room-scoped, not
 * user-scoped).
 *
 * Two surfaces:
 *   readRoomEcology(roomSlug)       — latest snapshot + drift
 *   readRoomAdjacency(roomSlug, n)  — top N adjacent rooms
 */

export interface RoomEcologyEnvelope {
  state: 'unknown_room' | 'forming' | 'ready'
  room_id?: string
  room_slug?: string
  snapshot_at?: string
  algorithm_version?: string
  active_listener_count?: number
  dominant_archetypes?: DominantArchetypeEntry[]
  dominant_traits?: Partial<Record<TraitKey, DominantTraitEntry>>
  dominant_genres?: DominantGenreEntry[]
  energy_profile?: EnergyProfile
  drift_summary?: RoomDriftSummary | null
}

export async function readRoomEcology(
  roomSlug: string,
): Promise<RoomEcologyEnvelope> {
  if (!roomSlug || roomSlug.length > 100 || /[^a-zA-Z0-9-]/.test(roomSlug)) {
    return { state: 'unknown_room' }
  }
  const supabase = await createSupabaseServerClient()
  const { data: roomRow } = await supabase
    .from('rooms')
    .select('id, slug')
    .eq('slug', roomSlug)
    .maybeSingle()
  if (!roomRow) return { state: 'unknown_room' }
  const room = roomRow as { id: string; slug: string }

  const { data: latest } = await supabase
    .from('room_ecology_snapshots')
    .select(
      'snapshot_at, algorithm_version, active_listener_count, dominant_archetypes, dominant_traits, dominant_genres, energy_profile, drift_summary',
    )
    .eq('room_id', room.id)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latest) {
    return {
      state: 'forming',
      room_id: room.id,
      room_slug: room.slug,
    }
  }
  const row = latest as {
    snapshot_at: string
    algorithm_version: string
    active_listener_count: number
    dominant_archetypes: unknown
    dominant_traits: unknown
    dominant_genres: unknown
    energy_profile: unknown
    drift_summary: unknown
  }
  return {
    state: 'ready',
    room_id: room.id,
    room_slug: room.slug,
    snapshot_at: row.snapshot_at,
    algorithm_version: row.algorithm_version,
    active_listener_count: row.active_listener_count,
    dominant_archetypes:
      (row.dominant_archetypes as DominantArchetypeEntry[]) ?? [],
    dominant_traits:
      (row.dominant_traits as Partial<
        Record<TraitKey, DominantTraitEntry>
      >) ?? {},
    dominant_genres: (row.dominant_genres as DominantGenreEntry[]) ?? [],
    energy_profile: (row.energy_profile as EnergyProfile) ?? {
      declared: null,
      observed_recency: null,
      observed_exploratory: null,
      observed_nocturnal: null,
      observed_album_focus: null,
    },
    drift_summary: (row.drift_summary as RoomDriftSummary | null) ?? null,
  }
}

export interface AdjacentRoomEntry {
  room_id: string
  slug: string | null
  name: string | null
  score: number
  band: AdjacencyBand
  listener_overlap_count: number
  shared_archetypes: Array<{
    archetype_key: string
    archetype_label: string
    my_share: number
    their_share: number
  }>
  shared_genres: Array<{ genre: string; my_weight: number; their_weight: number }>
}

/**
 * Top-N adjacent rooms for a given room slug, sorted by score desc.
 * Renormalizes a/b labels to "me/them" so callers (the room detail
 * page) don't reason about canonical-pair ordering.
 */
export async function readRoomAdjacency(
  roomSlug: string,
  limit = 4,
): Promise<AdjacentRoomEntry[]> {
  if (!roomSlug || roomSlug.length > 100 || /[^a-zA-Z0-9-]/.test(roomSlug)) {
    return []
  }
  const cap = Math.max(1, Math.min(limit, 20))
  const supabase = await createSupabaseServerClient()
  const { data: roomRow } = await supabase
    .from('rooms')
    .select('id')
    .eq('slug', roomSlug)
    .maybeSingle()
  if (!roomRow) return []
  const myRoomId = (roomRow as { id: string }).id

  // Pull rows where I'm either user_id_a or user_id_b.
  // Two queries; merge in code. Bounded by N (limit) on each side.
  const [aSide, bSide] = await Promise.all([
    supabase
      .from('room_adjacency_scores')
      .select(
        'room_id_b, score, band, listener_overlap_count, shared_archetypes, shared_genres',
      )
      .eq('room_id_a', myRoomId)
      .order('score', { ascending: false })
      .limit(cap * 2), // overfetch — we re-sort after the merge
    supabase
      .from('room_adjacency_scores')
      .select(
        'room_id_a, score, band, listener_overlap_count, shared_archetypes, shared_genres',
      )
      .eq('room_id_b', myRoomId)
      .order('score', { ascending: false })
      .limit(cap * 2),
  ])

  type SharedArchetype = {
    archetype_key: string
    archetype_label: string
    a_share: number
    b_share: number
  }
  type SharedGenre = { genre: string; a_weight: number; b_weight: number }
  type ASide = {
    room_id_b: string
    score: number
    band: AdjacencyBand
    listener_overlap_count: number
    shared_archetypes: SharedArchetype[]
    shared_genres: SharedGenre[]
  }
  type BSide = {
    room_id_a: string
    score: number
    band: AdjacencyBand
    listener_overlap_count: number
    shared_archetypes: SharedArchetype[]
    shared_genres: SharedGenre[]
  }

  type Combined = {
    other_room_id: string
    score: number
    band: AdjacencyBand
    listener_overlap_count: number
    my_archetypes: SharedArchetype[]
    my_genres: SharedGenre[]
    swapped: boolean // false when I'm the canonical a-side
  }

  const combined: Combined[] = []
  for (const row of (aSide.data ?? []) as unknown as ASide[]) {
    combined.push({
      other_room_id: row.room_id_b,
      score: row.score,
      band: row.band,
      listener_overlap_count: row.listener_overlap_count,
      my_archetypes: row.shared_archetypes ?? [],
      my_genres: row.shared_genres ?? [],
      swapped: false,
    })
  }
  for (const row of (bSide.data ?? []) as unknown as BSide[]) {
    combined.push({
      other_room_id: row.room_id_a,
      score: row.score,
      band: row.band,
      listener_overlap_count: row.listener_overlap_count,
      my_archetypes: row.shared_archetypes ?? [],
      my_genres: row.shared_genres ?? [],
      swapped: true,
    })
  }

  combined.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.other_room_id.localeCompare(b.other_room_id)
  })
  const top = combined.slice(0, cap)
  if (top.length === 0) return []

  // Hydrate slug/name for the partner rooms.
  const partnerIds = top.map((t) => t.other_room_id)
  const { data: partnerRows } = await supabase
    .from('rooms')
    .select('id, slug, name')
    .in('id', partnerIds)
  const partnerById = new Map<string, { slug: string | null; name: string | null }>()
  for (const p of (partnerRows ?? []) as Array<{
    id: string
    slug: string | null
    name: string | null
  }>) {
    partnerById.set(p.id, { slug: p.slug, name: p.name })
  }

  return top.map((t) => {
    const partner = partnerById.get(t.other_room_id) ?? { slug: null, name: null }
    return {
      room_id: t.other_room_id,
      slug: partner.slug,
      name: partner.name,
      score: t.score,
      band: t.band,
      listener_overlap_count: t.listener_overlap_count,
      shared_archetypes: t.my_archetypes.map((s) => ({
        archetype_key: s.archetype_key,
        archetype_label: s.archetype_label,
        my_share: t.swapped ? s.b_share : s.a_share,
        their_share: t.swapped ? s.a_share : s.b_share,
      })),
      shared_genres: t.my_genres.map((s) => ({
        genre: s.genre,
        my_weight: t.swapped ? s.b_weight : s.a_weight,
        their_weight: t.swapped ? s.a_weight : s.b_weight,
      })),
    }
  })
}
