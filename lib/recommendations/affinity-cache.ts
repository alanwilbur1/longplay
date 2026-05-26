import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

// Note: not marked with `import 'server-only'` so that
// scripts/test-affinity-cache.ts (which only consumes the pure
// helpers exported below) can run via tsx outside the Next bundler.
// getSupabaseAdminClient is itself server-only at runtime, so any
// accidental client import would fail there.
import { assembleRecommendationInputs } from './inputs'
import { scoreAllCandidates, SCORE_VERSION, type ScoredCandidate } from './scorer'
import type { ExplanationFactor, RoomForRecommendation } from './types'

/**
 * lib/recommendations/affinity-cache.ts — Phase 6A.5 (Layer 4)
 *
 * Recompute orchestrator + cache reader for persistent room affinity
 * artifacts. Replaces request-time runtime scoring with a single
 * indexed read against room_affinity_scores.
 *
 * Architecture:
 *   - recomputeRoomAffinities(userId) runs after the snapshot
 *     recompute in syncProviderForUser. It assembles the same input
 *     the pipeline would, scores ALL rooms (no joined-room filter),
 *     and upserts one row per (user_id, room_id) with score +
 *     factor_breakdown + score_version + source_snapshot_computed_at.
 *   - readCachedRoomAffinities(supabase, userId) returns a cache-
 *     hot view if every row matches SCORE_VERSION AND the cache's
 *     source snapshot matches the current snapshot. Otherwise
 *     returns null and the caller falls back to live scoring.
 *
 * Delete-then-insert per user gives clean regenerate semantics —
 * stale rows for rooms that no longer exist drop out naturally.
 */

export interface RecomputeRoomAffinitiesResult {
  user_id: string
  rooms_scored: number
  rows_written: number
  duration_ms: number
  source_snapshot_computed_at: string | null
  score_version: typeof SCORE_VERSION
}

/**
 * Regenerate all room affinity rows for one user.
 *
 * Best-effort by design — callers wrap in try/catch. A failure here
 * doesn't poison any upstream layer (Layer 1-3 are already durable).
 */
export async function recomputeRoomAffinities(
  userId: string,
): Promise<RecomputeRoomAffinitiesResult> {
  const startedAt = Date.now()
  const admin = getSupabaseAdminClient()

  // Score every room (excludeJoinedRooms=false → joinedRoomSlugs=[]
  // → scorer doesn't filter at recompute time; the serving path
  // applies the join-filter at request time).
  const { input, sourceSnapshotComputedAt } = await assembleRecommendationInputs(
    admin,
    userId,
    { excludeJoinedRooms: false },
  )

  const scored = scoreAllCandidates(input)

  const computedAt = new Date().toISOString()
  const rows = scored.map((s) => ({
    user_id: userId,
    room_id: s.room.id,
    score: roundForStorage(s.score),
    score_version: SCORE_VERSION,
    factor_breakdown: s.factors,
    computed_at: computedAt,
    source_snapshot_computed_at: sourceSnapshotComputedAt,
  }))

  // Delete-then-insert per user. Pure regenerate semantics. Service
  // role bypasses RLS; no client write grants exist on this table.
  await admin.from('room_affinity_scores').delete().eq('user_id', userId)

  let rowsWritten = 0
  if (rows.length > 0) {
    const CHUNK = 250
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const { error, count } = await admin
        .from('room_affinity_scores')
        .insert(slice, { count: 'exact' })
      if (error) {
        throw new Error(`[affinity-cache] insert failed: ${error.message}`)
      }
      rowsWritten += count ?? slice.length
    }
  }

  return {
    user_id: userId,
    rooms_scored: scored.length,
    rows_written: rowsWritten,
    duration_ms: Date.now() - startedAt,
    source_snapshot_computed_at: sourceSnapshotComputedAt,
    score_version: SCORE_VERSION,
  }
}

// ── Cache reader ─────────────────────────────────────────────────────

export interface CachedAffinityRow {
  room_id: string
  score: number
  score_version: string
  factor_breakdown: ExplanationFactor[]
  source_snapshot_computed_at: string | null
  computed_at: string
}

/**
 * Read cached affinity rows for one user. Returns null when the cache
 * is unusable (empty, version-stale, or snapshot-stale) — the serving
 * path falls back to live scoring in those cases.
 *
 * Stale detection:
 *   1. Zero rows → cold cache, fall back.
 *   2. ANY row's score_version != current SCORE_VERSION → version
 *      drift (scoring formula changed since the cache was written),
 *      fall back.
 *   3. ANY row's source_snapshot_computed_at != currentSnapshot
 *      computed_at → snapshot drift (Layer 3 advanced after the cache
 *      was written), fall back.
 *
 * The cron's hourly sync will repopulate the cache on the next pass.
 */
export async function readCachedRoomAffinities(
  supabase: SupabaseClient,
  userId: string,
  currentSnapshotComputedAt: string | null,
): Promise<CachedAffinityRow[] | null> {
  const { data, error } = await supabase
    .from('room_affinity_scores')
    .select(
      'room_id, score, score_version, factor_breakdown, source_snapshot_computed_at, computed_at',
    )
    .eq('user_id', userId)
  if (error || !data || data.length === 0) {
    return null
  }
  const rows = data as unknown as CachedAffinityRow[]

  // Version drift — any row with a different version invalidates the
  // entire cache. The next recompute writes uniform rows.
  if (rows.some((r) => r.score_version !== SCORE_VERSION)) {
    return null
  }

  // Snapshot drift — if the cache was built from an older snapshot,
  // the input.canonicalGenres / topArtistNames may have changed.
  // Only the values matter, not identity — we compare timestamps.
  // When currentSnapshotComputedAt is null (no snapshot exists),
  // accept the cache anyway: the cache is built from listener_*
  // which can be fresh even when the snapshot row hasn't landed yet.
  if (currentSnapshotComputedAt) {
    const drifted = rows.some(
      (r) =>
        r.source_snapshot_computed_at &&
        r.source_snapshot_computed_at !== currentSnapshotComputedAt,
    )
    if (drifted) return null
  }

  return rows
}

// ── Helpers ──────────────────────────────────────────────────────────

function roundForStorage(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

/**
 * Build a ScoredCandidate array from cached rows + the candidate
 * room list (which carries the current room metadata for MMR). Used
 * by the serving path when the cache is hot.
 *
 * Joins cached rows to candidates by room_id. Skips cached rows
 * whose room is no longer in the candidates set (room deleted / made
 * private / dropped from the top-50 weight cutoff).
 */
export function joinCachedScoresToRooms(
  cached: CachedAffinityRow[],
  candidates: RoomForRecommendation[],
): ScoredCandidate[] {
  const byId = new Map<string, RoomForRecommendation>(
    candidates.map((c) => [c.id, c]),
  )
  const out: ScoredCandidate[] = []
  for (const row of cached) {
    const room = byId.get(row.room_id)
    if (!room) continue
    out.push({
      room,
      score: row.score,
      factors: row.factor_breakdown ?? [],
    })
  }
  return out
}
