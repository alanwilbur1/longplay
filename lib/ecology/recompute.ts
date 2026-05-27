import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  ACTIVE_LISTENER_AFFINITY_FLOOR,
  ECOLOGY_ALGORITHM_VERSION,
  canonicalRoomPair,
  computeRoomAdjacency,
  computeRoomDrift,
  computeRoomEcology,
  shouldAppendRoomEcology,
  type DominantArchetypeEntry,
  type DominantGenreEntry,
  type DominantTraitEntry,
  type ListenerEcologyInput,
  type RoomEcologyResult,
} from './computation'
import type { TraitBand, TraitKey } from '@/lib/identity/traits'

/**
 * lib/ecology/recompute.ts — Phase 6A.11
 *
 * DB-backed orchestrator for room ecology + adjacency. Runs daily
 * via /api/cron/recompute-ecology. Idempotent. Best-effort wrapped
 * at the cron level.
 *
 * Flow:
 *   1. Load all rooms (visibility = 'public').
 *   2. Load room_affinity_scores for the affinity floor — gives us
 *      a per-room list of active listener IDs.
 *   3. Hydrate listener envelopes from listener_archetype_snapshots,
 *      listener_identity_traits, listener_genres — one fetch each,
 *      sliced per-room in memory.
 *   4. For each room: computeRoomEcology + compare to prior history
 *      row + maybe append.
 *   5. For each room pair: computeRoomAdjacency, upsert canonical
 *      row when band != 'disjoint'.
 *
 * Cost: O(rooms × listeners) reads, O(rooms²) adjacency pairs.
 * At expected scale (≤50 rooms, ≤500 active listeners per room)
 * this is sub-second per full sweep.
 */

export interface EcologyRecomputeResult {
  rooms_scanned: number
  ecology_snapshots_appended: number
  adjacency_pairs_written: number
  adjacency_pairs_skipped_disjoint: number
  duration_ms: number
  algorithm_version: typeof ECOLOGY_ALGORITHM_VERSION
}

export async function recomputeRoomEcology(): Promise<EcologyRecomputeResult> {
  const startedAt = Date.now()
  const admin = getSupabaseAdminClient()

  // ── 1. Load public rooms ─────────────────────────────────────
  const { data: roomRows, error: roomErr } = await admin
    .from('rooms')
    .select('id, slug, energy_level')
    .eq('visibility', 'public')
  if (roomErr) {
    throw new Error(`[ecology] rooms read failed: ${roomErr.message}`)
  }
  type RoomRow = {
    id: string
    slug: string
    energy_level: 'low' | 'medium' | 'high' | null
  }
  const rooms = ((roomRows ?? []) as unknown as RoomRow[]) ?? []
  if (rooms.length === 0) {
    return {
      rooms_scanned: 0,
      ecology_snapshots_appended: 0,
      adjacency_pairs_written: 0,
      adjacency_pairs_skipped_disjoint: 0,
      duration_ms: Date.now() - startedAt,
      algorithm_version: ECOLOGY_ALGORITHM_VERSION,
    }
  }
  const roomIds = rooms.map((r) => r.id)

  // ── 2. Affinity rows above the floor ─────────────────────────
  const { data: affinityRows } = await admin
    .from('room_affinity_scores')
    .select('user_id, room_id, score')
    .in('room_id', roomIds)
    .gte('score', ACTIVE_LISTENER_AFFINITY_FLOOR)
  type AffinityRow = { user_id: string; room_id: string; score: number }
  const allAffinity = (affinityRows ?? []) as unknown as AffinityRow[]

  // Map: room_id → [{user_id, score}]
  const affinityByRoom = new Map<string, { user_id: string; score: number }[]>()
  // Map: room_id → Set<user_id>  (for adjacency overlap)
  const listenerIdsByRoom = new Map<string, string[]>()
  const activeUserIds = new Set<string>()
  for (const a of allAffinity) {
    if (!affinityByRoom.has(a.room_id)) affinityByRoom.set(a.room_id, [])
    affinityByRoom
      .get(a.room_id)!
      .push({ user_id: a.user_id, score: a.score })
    if (!listenerIdsByRoom.has(a.room_id)) listenerIdsByRoom.set(a.room_id, [])
    listenerIdsByRoom.get(a.room_id)!.push(a.user_id)
    activeUserIds.add(a.user_id)
  }

  // ── 3. Bulk-hydrate listener envelopes ────────────────────────
  // (One read per table, sliced per-room in memory. Avoids N×M
  // per-room queries.)
  const userIdList = Array.from(activeUserIds)
  if (userIdList.length === 0) {
    // No active listeners anywhere. Still emit empty ecology
    // snapshots if rooms have no prior history — keeps the table's
    // append history continuous for new rooms.
    return await finishWithEmptyEcology(admin, rooms, startedAt)
  }

  const [archetypesRes, traitsRes, genresRes] = await Promise.all([
    admin
      .from('listener_archetype_snapshots')
      .select('user_id, archetype_key, archetype_label, rank')
      .in('user_id', userIdList)
      .eq('rank', 1), // primary only
    admin
      .from('listener_identity_traits')
      .select('user_id, trait_key, trait_band')
      .in('user_id', userIdList),
    admin
      .from('listener_genres')
      .select('user_id, genre, weighted_score')
      .in('user_id', userIdList),
  ])
  type ArchetypeRow = {
    user_id: string
    archetype_key: string
    archetype_label: string
    rank: number
  }
  type TraitRow = {
    user_id: string
    trait_key: string
    trait_band: string | null
  }
  type GenreRow = { user_id: string; genre: string; weighted_score: number }

  const primaryByUser = new Map<
    string,
    { key: string; label: string }
  >()
  for (const r of (archetypesRes.data ?? []) as unknown as ArchetypeRow[]) {
    primaryByUser.set(r.user_id, { key: r.archetype_key, label: r.archetype_label })
  }
  const bandsByUser = new Map<string, Partial<Record<TraitKey, TraitBand>>>()
  for (const r of (traitsRes.data ?? []) as unknown as TraitRow[]) {
    if (!bandsByUser.has(r.user_id)) bandsByUser.set(r.user_id, {})
    bandsByUser.get(r.user_id)![r.trait_key as TraitKey] =
      (r.trait_band as TraitBand) ?? 'unknown'
  }
  const genresByUser = new Map<
    string,
    Array<{ genre: string; weighted_score: number }>
  >()
  for (const r of (genresRes.data ?? []) as unknown as GenreRow[]) {
    if (!genresByUser.has(r.user_id)) genresByUser.set(r.user_id, [])
    genresByUser.get(r.user_id)!.push({
      genre: r.genre,
      weighted_score: r.weighted_score,
    })
  }

  // ── 4. Per-room ecology computation + maybe append ─────────────
  const ecologyByRoom = new Map<string, RoomEcologyResult>()
  const adjacencyInputsByRoom = new Map<
    string,
    {
      room_id: string
      active_listener_ids: string[]
      dominant_archetypes: DominantArchetypeEntry[]
      dominant_genres: DominantGenreEntry[]
    }
  >()

  // Pre-fetch the latest history row per room for drift comparison.
  // Pass: we use a single query and bucket per-room. Cheap.
  const { data: lastHistoryRows } = await admin
    .from('room_ecology_snapshots')
    .select(
      'room_id, snapshot_at, dominant_archetypes, dominant_traits, dominant_genres',
    )
    .in('room_id', roomIds)
    .order('snapshot_at', { ascending: false })
  type HistoryRow = {
    room_id: string
    snapshot_at: string
    dominant_archetypes: unknown
    dominant_traits: unknown
    dominant_genres: unknown
  }
  const latestHistoryByRoom = new Map<string, HistoryRow>()
  for (const row of (lastHistoryRows ?? []) as unknown as HistoryRow[]) {
    if (!latestHistoryByRoom.has(row.room_id)) {
      latestHistoryByRoom.set(row.room_id, row)
    }
  }

  let ecologyAppended = 0
  const computedAt = new Date().toISOString()

  for (const room of rooms) {
    const listenerRows = affinityByRoom.get(room.id) ?? []
    const listeners: ListenerEcologyInput[] = listenerRows.map((row) => {
      const primary = primaryByUser.get(row.user_id) ?? null
      return {
        user_id: row.user_id,
        affinity_score: row.score,
        primary_archetype_key: primary?.key ?? null,
        primary_archetype_label: primary?.label ?? null,
        trait_bands: bandsByUser.get(row.user_id) ?? {},
        top_genres: genresByUser.get(row.user_id) ?? [],
      }
    })

    const ecology = computeRoomEcology(
      { room_id: room.id, declared_energy_level: room.energy_level },
      listeners,
    )
    ecologyByRoom.set(room.id, ecology)
    adjacencyInputsByRoom.set(room.id, {
      room_id: room.id,
      active_listener_ids: listenerRows.map((l) => l.user_id),
      dominant_archetypes: ecology.dominant_archetypes,
      dominant_genres: ecology.dominant_genres,
    })

    // Drift comparison + maybe-append.
    const prev = latestHistoryByRoom.get(room.id)
    let drift = null
    if (prev) {
      drift = computeRoomDrift(
        {
          snapshot_at: prev.snapshot_at,
          dominant_archetypes:
            (prev.dominant_archetypes as DominantArchetypeEntry[]) ?? [],
          dominant_traits:
            (prev.dominant_traits as Partial<
              Record<TraitKey, DominantTraitEntry>
            >) ?? {},
          dominant_genres:
            (prev.dominant_genres as DominantGenreEntry[]) ?? [],
        },
        {
          snapshot_at: computedAt,
          dominant_archetypes: ecology.dominant_archetypes,
          dominant_traits: ecology.dominant_traits,
          dominant_genres: ecology.dominant_genres,
        },
      )
    }

    const append = shouldAppendRoomEcology({
      hasPrevious: !!prev,
      drift,
    })
    if (!append) continue

    const { error: insertErr } = await admin
      .from('room_ecology_snapshots')
      .insert({
        room_id: room.id,
        snapshot_at: computedAt,
        algorithm_version: ECOLOGY_ALGORITHM_VERSION,
        active_listener_count: ecology.active_listener_count,
        dominant_archetypes: ecology.dominant_archetypes,
        dominant_traits: ecology.dominant_traits,
        dominant_genres: ecology.dominant_genres,
        energy_profile: ecology.energy_profile,
        drift_summary: drift,
      })
    if (insertErr) {
      throw new Error(
        `[ecology] snapshot insert failed for ${room.id}: ${insertErr.message}`,
      )
    }
    ecologyAppended += 1
  }

  // ── 5. Pairwise adjacency ─────────────────────────────────────
  let adjacencyWritten = 0
  let adjacencySkipped = 0

  // Iterate unique pairs (i < j).
  for (let i = 0; i < rooms.length; i++) {
    const aId = rooms[i].id
    const aInput = adjacencyInputsByRoom.get(aId)
    if (!aInput) continue
    for (let j = i + 1; j < rooms.length; j++) {
      const bId = rooms[j].id
      const bInput = adjacencyInputsByRoom.get(bId)
      if (!bInput) continue
      const result = computeRoomAdjacency(aInput, bInput)
      if (result.band === 'disjoint') {
        adjacencySkipped += 1
        continue
      }
      const canon = canonicalRoomPair(aId, bId)
      // computeRoomAdjacency is symmetric — score/band don't change
      // on swap. The shared_archetypes/shared_genres _a/_b fields
      // need re-labeling if canon.swapped.
      const writeShared = canon.swapped
        ? {
            shared_archetypes: result.shared_archetypes.map((s) => ({
              archetype_key: s.archetype_key,
              archetype_label: s.archetype_label,
              a_share: s.b_share,
              b_share: s.a_share,
            })),
            shared_genres: result.shared_genres.map((s) => ({
              genre: s.genre,
              a_weight: s.b_weight,
              b_weight: s.a_weight,
            })),
          }
        : {
            shared_archetypes: result.shared_archetypes,
            shared_genres: result.shared_genres,
          }
      const { error: upsertErr } = await admin
        .from('room_adjacency_scores')
        .upsert(
          {
            room_id_a: canon.room_id_a,
            room_id_b: canon.room_id_b,
            score: result.score,
            band: result.band,
            listener_overlap_count: result.listener_overlap_count,
            shared_archetypes: writeShared.shared_archetypes,
            shared_genres: writeShared.shared_genres,
            computed_at: computedAt,
            algorithm_version: ECOLOGY_ALGORITHM_VERSION,
          },
          { onConflict: 'room_id_a,room_id_b' },
        )
      if (upsertErr) {
        throw new Error(`[ecology] adjacency upsert failed: ${upsertErr.message}`)
      }
      adjacencyWritten += 1
    }
  }

  return {
    rooms_scanned: rooms.length,
    ecology_snapshots_appended: ecologyAppended,
    adjacency_pairs_written: adjacencyWritten,
    adjacency_pairs_skipped_disjoint: adjacencySkipped,
    duration_ms: Date.now() - startedAt,
    algorithm_version: ECOLOGY_ALGORITHM_VERSION,
  }
}

/**
 * Edge case: zero active listeners anywhere. We still iterate
 * rooms and produce ecology snapshots — empty distributions —
 * so a brand-new platform with no synced users isn't blank in
 * the audit history.
 */
async function finishWithEmptyEcology(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  rooms: Array<{
    id: string
    slug: string
    energy_level: 'low' | 'medium' | 'high' | null
  }>,
  startedAt: number,
): Promise<EcologyRecomputeResult> {
  const computedAt = new Date().toISOString()
  let appended = 0
  for (const room of rooms) {
    const { count } = await admin
      .from('room_ecology_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', room.id)
    if ((count ?? 0) > 0) continue
    const ecology = computeRoomEcology(
      { room_id: room.id, declared_energy_level: room.energy_level },
      [],
    )
    await admin.from('room_ecology_snapshots').insert({
      room_id: room.id,
      snapshot_at: computedAt,
      algorithm_version: ECOLOGY_ALGORITHM_VERSION,
      active_listener_count: 0,
      dominant_archetypes: ecology.dominant_archetypes,
      dominant_traits: ecology.dominant_traits,
      dominant_genres: ecology.dominant_genres,
      energy_profile: ecology.energy_profile,
      drift_summary: null,
    })
    appended += 1
  }
  return {
    rooms_scanned: rooms.length,
    ecology_snapshots_appended: appended,
    adjacency_pairs_written: 0,
    adjacency_pairs_skipped_disjoint: 0,
    duration_ms: Date.now() - startedAt,
    algorithm_version: ECOLOGY_ALGORITHM_VERSION,
  }
}
