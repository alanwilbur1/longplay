'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { SCORE_VERSION } from '@/lib/recommendations/scorer'
import { affinityBand, type AffinityBand } from '@/lib/recommendations/explanation'
import type { ExplanationFactor } from '@/lib/recommendations/types'

/**
 * lib/actions/room-affinity.ts — Phase 6A.8
 *
 * Frontend-facing reader for the Layer 4 room affinity cache,
 * scoped to one (user × room) pair. Cookie-aware: resolves the
 * calling user from the session, then reads via RLS (owner-self-
 * select on room_affinity_scores).
 *
 * Stable discriminated-union envelope:
 *   - { state: 'unauthenticated' }
 *   - { state: 'unknown_room' }       — slug doesn't exist
 *   - { state: 'no_affinity' }        — user has no cached row for this room
 *                                       (sync hasn't happened, or cache was
 *                                       invalidated, or room is brand-new)
 *   - { state: 'stale' }              — cached row exists but score_version
 *                                       differs from current SCORE_VERSION;
 *                                       the recommender would fall back to
 *                                       live scoring at serve time, so this
 *                                       envelope is honest about the staleness
 *   - { state: 'ready', … }           — fresh cached row with factor_breakdown
 *
 * Components branch on envelope.state. UI for non-'ready' states is
 * intentionally minimal — "Why this room?" only renders meaningfully
 * for ready envelopes. The other states exist for the JSON debug
 * route and any future operator surfaces.
 */

export interface RoomAffinityReady {
  state: 'ready'
  room_id: string
  room_slug: string
  score: number
  band: AffinityBand
  score_version: string
  factor_breakdown: ExplanationFactor[]
  computed_at: string
  source_snapshot_computed_at: string | null
}

export type RoomAffinityEnvelope =
  | { state: 'unauthenticated' }
  | { state: 'unknown_room' }
  | { state: 'no_affinity'; room_id: string; room_slug: string }
  | {
      state: 'stale'
      room_id: string
      room_slug: string
      cached_version: string
      current_version: string
      computed_at: string
    }
  | RoomAffinityReady

/**
 * Read the calling user's affinity for one room (by slug).
 *
 * Two reads: rooms (resolve slug → uuid) + room_affinity_scores
 * (the cached row). Both go through the same cookie-aware client;
 * RLS handles authorization on each.
 */
export async function readRoomAffinityForUser(
  roomSlug: string,
): Promise<RoomAffinityEnvelope> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { state: 'unauthenticated' }

  // 1. Resolve slug → room_id. Public-read RLS on rooms makes this
  // a no-cost lookup. maybeSingle so the "unknown room" case is a
  // null rather than a thrown error.
  const { data: roomRow, error: roomErr } = await supabase
    .from('rooms')
    .select('id, slug')
    .eq('slug', roomSlug)
    .maybeSingle()
  if (roomErr || !roomRow) return { state: 'unknown_room' }
  const room = roomRow as { id: string; slug: string }

  // 2. Fetch the cached affinity row. owner-self-select RLS means we
  // only see our own; no extra user_id check needed beyond filtering
  // for consistency.
  const { data: affRow, error: affErr } = await supabase
    .from('room_affinity_scores')
    .select(
      'score, score_version, factor_breakdown, computed_at, source_snapshot_computed_at',
    )
    .eq('user_id', user.id)
    .eq('room_id', room.id)
    .maybeSingle()
  if (affErr || !affRow) {
    return { state: 'no_affinity', room_id: room.id, room_slug: room.slug }
  }
  const aff = affRow as {
    score: number
    score_version: string
    factor_breakdown: unknown
    computed_at: string
    source_snapshot_computed_at: string | null
  }

  // Version drift: cache has the row but scoring formula changed
  // since it was written. The recommender falls back to live scoring
  // at serve time in this case (see pipeline.ts); UI should not
  // pretend the cached factors are current.
  if (aff.score_version !== SCORE_VERSION) {
    return {
      state: 'stale',
      room_id: room.id,
      room_slug: room.slug,
      cached_version: aff.score_version,
      current_version: SCORE_VERSION,
      computed_at: aff.computed_at,
    }
  }

  return {
    state: 'ready',
    room_id: room.id,
    room_slug: room.slug,
    score: aff.score,
    band: affinityBand(aff.score),
    score_version: aff.score_version,
    factor_breakdown: (aff.factor_breakdown as ExplanationFactor[]) ?? [],
    computed_at: aff.computed_at,
    source_snapshot_computed_at: aff.source_snapshot_computed_at,
  }
}
