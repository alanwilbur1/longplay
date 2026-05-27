import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  computeDrift,
  shouldAppendHistory,
  type IdentitySnapshotForDrift,
  type DriftSummary,
} from './drift'
import { IDENTITY_ALGORITHM_VERSION, type TraitKey } from './traits'

/**
 * lib/identity/history-recompute.ts — Phase 6A.9
 *
 * Append-only orchestrator. Called by syncProviderForUser after the
 * Layer 5 recompute lands. Inspects the user's most-recent history
 * row, compares to the current Layer 5 state, and either:
 *   - APPENDS a new history row (with drift_summary populated when
 *     a prior row exists), OR
 *   - SKIPS (no meaningful change AND under the time threshold).
 *
 * The decision rules live in lib/identity/drift.ts:shouldAppend.
 * This file is the I/O wrapper.
 *
 * Best-effort: a failure here doesn't fail the sync (Layer 1-5 are
 * already durable). Logs are structured for Vercel-side tracing.
 */

const TOP_GENRES_FOR_HISTORY = 5
const TOP_ROOMS_FOR_HISTORY = 5

export interface MaybeAppendResult {
  user_id: string
  appended: boolean
  /** Set when appended=true; identifies the new row. */
  history_id: string | null
  /** Set when appended=false AND a previous row existed: the drift
   *  that was computed but didn't clear thresholds. Useful for
   *  observability (operator can see "no-op syncs aren't blind"). */
  skipped_with_drift: DriftSummary | null
  duration_ms: number
}

/**
 * Read the user's current Layer 5 state, build a snapshot, decide
 * whether to append, and write if so.
 */
export async function maybeAppendIdentityHistory(
  userId: string,
): Promise<MaybeAppendResult> {
  const startedAt = Date.now()
  const admin = getSupabaseAdminClient()

  // ── Read current Layer 5 state ────────────────────────────────
  const [archetypesRes, traitsRes, genresRes, roomsRes, lastHistoryRes] =
    await Promise.all([
      admin
        .from('listener_archetype_snapshots')
        .select(
          'archetype_key, archetype_label, confidence_score, rank, supporting_rooms',
        )
        .eq('user_id', userId)
        .order('rank', { ascending: true }),
      admin
        .from('listener_identity_traits')
        .select('trait_key, trait_score, trait_band')
        .eq('user_id', userId),
      admin
        .from('listener_genres')
        .select('genre, weighted_score')
        .eq('user_id', userId)
        .order('weighted_score', { ascending: false })
        .limit(TOP_GENRES_FOR_HISTORY),
      // Top rooms: join room_affinity_scores → rooms for slug/name.
      admin
        .from('room_affinity_scores')
        .select('room_id, score, rooms!inner(slug, name)')
        .eq('user_id', userId)
        .order('score', { ascending: false })
        .limit(TOP_ROOMS_FOR_HISTORY),
      // Latest history row for diff target.
      admin
        .from('listener_identity_history')
        .select(
          'id, snapshot_at, primary_archetype_key, primary_confidence, archetypes, trait_snapshot, top_genres, top_rooms',
        )
        .eq('user_id', userId)
        .order('snapshot_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  type ArchetypeRow = {
    archetype_key: string
    archetype_label: string
    confidence_score: number
    rank: number
    supporting_rooms: unknown
  }
  type TraitRow = {
    trait_key: string
    trait_score: number | null
    trait_band: string | null
  }
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
  const previousRow = lastHistoryRes.data as unknown as PrevHistoryRow | null

  const now = new Date()
  const snapshotAtIso = now.toISOString()

  // ── Build the current snapshot envelope ───────────────────────
  const archetypes = archetypeRows.map((a) => ({
    archetype_key: a.archetype_key,
    archetype_label: a.archetype_label,
    confidence_score: a.confidence_score,
    rank: a.rank,
  }))
  const primary = archetypes[0] ?? null
  const traitSnapshot: Record<string, { score: number | null; band: string }> = {}
  for (const t of traitRows) {
    traitSnapshot[t.trait_key] = {
      score: t.trait_score,
      band: (t.trait_band as string) ?? 'unknown',
    }
  }
  const topGenres = genreRows.map((g) => ({
    genre: g.genre,
    weighted_score: round4(g.weighted_score),
  }))
  const topRooms = roomRows.map((r) => {
    const room = Array.isArray(r.rooms) ? r.rooms[0] : r.rooms
    return {
      room_id: r.room_id,
      slug: room?.slug ?? null,
      name: room?.name ?? null,
      score: round4(r.score),
    }
  })

  const current: IdentitySnapshotForDrift = {
    snapshot_at: snapshotAtIso,
    primary_archetype_key: primary?.archetype_key ?? null,
    primary_confidence: primary?.confidence_score ?? null,
    archetypes: archetypes,
    trait_snapshot: traitSnapshot as IdentitySnapshotForDrift['trait_snapshot'],
    top_genres: topGenres,
    top_rooms: topRooms,
  }

  // ── Compute drift vs. previous row (if any) ───────────────────
  let drift: DriftSummary | null = null
  if (previousRow) {
    const prev = previousRowToSnapshot(previousRow)
    drift = computeDrift(prev, current)
  }

  // ── Decision ─────────────────────────────────────────────────
  const append = shouldAppendHistory({
    hasPrevious: previousRow !== null,
    drift,
  })

  if (!append) {
    return {
      user_id: userId,
      appended: false,
      history_id: null,
      skipped_with_drift: drift,
      duration_ms: Date.now() - startedAt,
    }
  }

  // ── Write ────────────────────────────────────────────────────
  const { data: insertRes, error: insertErr } = await admin
    .from('listener_identity_history')
    .insert({
      user_id: userId,
      snapshot_at: snapshotAtIso,
      algorithm_version: IDENTITY_ALGORITHM_VERSION,
      primary_archetype_key: current.primary_archetype_key,
      primary_archetype_label: primary?.archetype_label ?? null,
      primary_confidence: current.primary_confidence,
      archetypes: current.archetypes,
      trait_snapshot: current.trait_snapshot,
      top_genres: current.top_genres,
      top_rooms: current.top_rooms,
      drift_summary: drift,
    })
    .select('id')
    .single()
  if (insertErr) {
    throw new Error(`[identity-history] insert failed: ${insertErr.message}`)
  }
  const newId = ((insertRes ?? {}) as { id?: string }).id ?? null

  return {
    user_id: userId,
    appended: true,
    history_id: newId,
    skipped_with_drift: null,
    duration_ms: Date.now() - startedAt,
  }
}

// ── Helpers ──────────────────────────────────────────────────────

interface PrevHistoryRow {
  id: string
  snapshot_at: string
  primary_archetype_key: string | null
  primary_confidence: number | null
  archetypes: unknown
  trait_snapshot: unknown
  top_genres: unknown
  top_rooms: unknown
}

function previousRowToSnapshot(row: PrevHistoryRow): IdentitySnapshotForDrift {
  return {
    snapshot_at: row.snapshot_at,
    primary_archetype_key: row.primary_archetype_key,
    primary_confidence: row.primary_confidence,
    archetypes: (row.archetypes as IdentitySnapshotForDrift['archetypes']) ?? [],
    trait_snapshot:
      (row.trait_snapshot as IdentitySnapshotForDrift['trait_snapshot']) ?? {},
    top_genres:
      (row.top_genres as IdentitySnapshotForDrift['top_genres']) ?? [],
    top_rooms: (row.top_rooms as IdentitySnapshotForDrift['top_rooms']) ?? [],
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

// Type widening helper — re-export the TraitKey type so call sites
// don't need a separate import to type their TRAIT_KEY constants.
export type { TraitKey }
