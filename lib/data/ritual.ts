import 'server-only'

import {
  getActiveRitualForRoom,
  getArchivedRitualsForRoom,
  getParticipationStateForUser,
  getReflectionCountsForCycle,
  getUpcomingRitualForRoom,
} from '@/lib/ritual/queries'
import type {
  ParticipationSnapshot,
  RitualCycleRow,
} from '@/lib/ritual/types'

/**
 * lib/data/ritual.ts — Phase 6B.2
 *
 * Composer reads for the room-detail and "This Week" surfaces.
 * Bundles three queries (active + upcoming + archived) plus the
 * caller's participation snapshot and reflection counts into one
 * shaped result the UI can render without further loading states.
 *
 * Tolerant of:
 *   - rooms with no ritual_cycles yet (returns empty context)
 *   - unauthenticated callers (participation snapshot = null)
 *   - DB lookup failures on any sub-query (logs + returns the
 *     successfully-loaded slices)
 *
 * Server-only. Consumers are server components and server actions.
 */

export interface RoomRitualContext {
  active: RitualCycleRow | null
  upcoming: RitualCycleRow | null
  /** Most-recent archived cycles for this room. Empty when the room
   *  has no past ritual yet. Bounded to the limit passed in. */
  archived: RitualCycleRow[]
  /** Participation snapshot for the caller in the ACTIVE cycle.
   *  null when:
   *    - no active cycle exists
   *    - caller is unauthenticated
   *    - caller has not joined the active cycle */
  participation: ParticipationSnapshot | null
  /** Per-state reflection counts for the ACTIVE cycle. Zero values
   *  when no active cycle exists. */
  reflection_counts: { published: number; draft: number }
}

const EMPTY: RoomRitualContext = {
  active: null,
  upcoming: null,
  archived: [],
  participation: null,
  reflection_counts: { published: 0, draft: 0 },
}

export async function getRoomRitualContext(
  roomId: string,
  options: { userId?: string | null; archivedLimit?: number } = {},
): Promise<RoomRitualContext> {
  const userId = options.userId ?? null
  const archivedLimit = options.archivedLimit ?? 6

  // Load active + upcoming + archived in parallel. Each branch
  // is independently caught so a failure on one doesn't blank
  // the others.
  const [activeRes, upcomingRes, archivedRes] = await Promise.allSettled([
    getActiveRitualForRoom(roomId),
    getUpcomingRitualForRoom(roomId),
    getArchivedRitualsForRoom(roomId, archivedLimit),
  ])
  const active = activeRes.status === 'fulfilled' ? activeRes.value : null
  const upcoming = upcomingRes.status === 'fulfilled' ? upcomingRes.value : null
  const archived = archivedRes.status === 'fulfilled' ? archivedRes.value : []
  if (activeRes.status === 'rejected') {
    console.warn('[data/ritual] active load failed', {
      roomId,
      reason: String(activeRes.reason),
    })
  }
  if (upcomingRes.status === 'rejected') {
    console.warn('[data/ritual] upcoming load failed', {
      roomId,
      reason: String(upcomingRes.reason),
    })
  }
  if (archivedRes.status === 'rejected') {
    console.warn('[data/ritual] archived load failed', {
      roomId,
      reason: String(archivedRes.reason),
    })
  }

  if (!active) {
    // Room has no live cycle. Return the rest of the context — the
    // UI may still want to render upcoming / archived strips.
    return {
      ...EMPTY,
      upcoming,
      archived,
    }
  }

  // Participation + reflection counts only when there IS an active
  // cycle. Both run against the ACTIVE cycle id specifically.
  const [participationRes, reflectionRes] = await Promise.allSettled([
    userId
      ? getParticipationStateForUser(active.id, userId)
      : Promise.resolve(null),
    getReflectionCountsForCycle(active.id),
  ])
  const participation =
    participationRes.status === 'fulfilled' ? participationRes.value : null
  const reflection_counts =
    reflectionRes.status === 'fulfilled'
      ? reflectionRes.value
      : { published: 0, draft: 0 }
  if (participationRes.status === 'rejected') {
    console.warn('[data/ritual] participation load failed', {
      roomId,
      cycle_id: active.id,
      user_id: userId,
      reason: String(participationRes.reason),
    })
  }
  if (reflectionRes.status === 'rejected') {
    console.warn('[data/ritual] reflection counts load failed', {
      roomId,
      cycle_id: active.id,
      reason: String(reflectionRes.reason),
    })
  }

  return {
    active,
    upcoming,
    archived,
    participation,
    reflection_counts,
  }
}

/**
 * Page-side helper: does the room currently have an active or
 * reflection-window cycle? Used by /rooms/[slug]/page.tsx to suppress
 * the legacy "Current Album Cycle" + "Listening Prompts" sections in
 * RoomDetailScreen when the ritual hero is going to surface the same
 * content in a more orchestrated composition. Returns false on any
 * lookup failure (defensive — never falsely hides editorial content).
 */
export async function getRoomHasActiveRitual(roomSlug: string): Promise<boolean> {
  const admin = getSupabaseAdminClient()
  type SlugBuilder = {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{
          data: { id: string } | null
          error: { message: string } | null
        }>
      }
    }
  }
  const { data: roomRow, error: roomErr } = await (
    admin.from('rooms') as unknown as SlugBuilder
  )
    .select('id')
    .eq('slug', roomSlug)
    .maybeSingle()
  if (roomErr || !roomRow) return false
  try {
    const active = await getActiveRitualForRoom(roomRow.id)
    return active !== null
  } catch {
    return false
  }
}

// ── Reflection list reader for the active cycle ────────────────────

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type {
  RitualParticipantRow,
  RitualParticipantState,
  RitualReflectionRow,
} from '@/lib/ritual/types'
import {
  deriveCycleObservations,
  participationCounts,
  type ParticipationCounts,
} from '@/lib/ritual/observations'

export interface VisibleReflection {
  id: string
  user_id: string
  body: string
  reflection_state: 'published' | 'draft' | 'archived'
  created_at: string
  is_own: boolean
}

/**
 * Load the reflections visible to `userId` for a given cycle.
 *
 * Visibility rules — these MIRROR the RLS policy on
 * ritual_reflections (which is the actual enforcement; this query
 * just shapes the result):
 *
 *   - Own drafts and own published rows: ALWAYS visible.
 *   - Peers' published rows: visible only when cycle_status is
 *     'reflection' or 'archived'.
 *   - Archived rows (soft-deleted): never returned.
 *
 * Uses the admin client for the read so server components don't
 * need to re-resolve auth, but it filters in the WHERE clause
 * exactly as RLS would — no broader read than the listener would
 * see through the Data API.
 */
export async function getVisibleReflectionsForCycle(input: {
  cycleId: string
  cycleStatus: 'upcoming' | 'active' | 'reflection' | 'archived'
  userId: string | null
  limit?: number
}): Promise<VisibleReflection[]> {
  const admin = getSupabaseAdminClient()
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200))
  const peersVisible =
    input.cycleStatus === 'reflection' || input.cycleStatus === 'archived'

  type Builder = {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        is: (col: string, val: null) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{
              data: RitualReflectionRow[] | null
              error: { code?: string; message: string } | null
            }>
          }
        }
      }
    }
  }

  // Single query, post-filter in JS. The DB index on
  // (ritual_cycle_id, created_at DESC) handles the dominant filter;
  // the in-memory pruning is cheap relative to the round-trip.
  const { data, error } = await (
    admin.from('ritual_reflections') as unknown as Builder
  )
    .select(
      'id, ritual_cycle_id, user_id, body, reflection_state, created_at, updated_at, deleted_at',
    )
    .eq('ritual_cycle_id', input.cycleId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('[data/ritual] visible reflections load failed', {
      cycle_id: input.cycleId,
      code: error.code,
      message: error.message,
    })
    return []
  }
  const rows = (data ?? []) as RitualReflectionRow[]

  const out: VisibleReflection[] = []
  for (const r of rows) {
    const is_own = input.userId !== null && r.user_id === input.userId
    if (!is_own) {
      // Peer row. Apply RLS-equivalent gate.
      if (r.reflection_state !== 'published') continue
      if (!peersVisible) continue
    }
    // Own row of any non-archived state passes through.
    if (!is_own && r.reflection_state === 'archived') continue
    out.push({
      id: r.id,
      user_id: r.user_id,
      body: r.body,
      reflection_state: r.reflection_state,
      created_at: r.created_at,
      is_own,
    })
  }
  return out
}

// ── Cycle ecology — counts + observational lines ──────────────────

export interface CycleEcology {
  /** Per-state participant counts for the cycle. */
  counts: ParticipationCounts
  /** Number of non-deleted, published reflections for the cycle. */
  published_reflections: number
  /** Ordered list of editorial observation sentences. Length 0 means
   *  the cycle is empty (no participation) — the UI should suppress
   *  the entire ecology section in that case. */
  observations: string[]
}

const EMPTY_ECOLOGY: CycleEcology = {
  counts: {
    joined: 0,
    listening: 0,
    completed: 0,
    reflected: 0,
    withdrawn: 0,
  },
  published_reflections: 0,
  observations: [],
}

/**
 * Loads the data required to render "This Week in the Room" and
 * runs the pure observation derivation in lib/ritual/observations.ts.
 *
 * Two server-side reads:
 *   1. ritual_participants  (state + joined/completed/reflected timestamps)
 *   2. ritual_reflections   (created_at of published, non-deleted rows)
 *
 * Pure derivation pass on the result. Returns an empty shape on any
 * read failure — defensive: the panel should NEVER render fake
 * observations when the data layer hiccups.
 */
export async function getCycleEcology(input: {
  cycleId: string
  cycleNumber: number
}): Promise<CycleEcology> {
  const admin = getSupabaseAdminClient()

  type ParticipantBuilder = {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{
        data: RitualParticipantRow[] | null
        error: { message: string } | null
      }>
    }
  }
  type ReflectionBuilder = {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          is: (col: string, val: null) => Promise<{
            data: { created_at: string }[] | null
            error: { message: string } | null
          }>
        }
      }
    }
  }

  const [participantsRes, reflectionsRes] = await Promise.allSettled([
    (admin.from('ritual_participants') as unknown as ParticipantBuilder)
      .select(
        'ritual_cycle_id, user_id, joined_at, completed_at, reflected_at, last_activity_at, participation_state, completion_percent, created_at, updated_at',
      )
      .eq('ritual_cycle_id', input.cycleId),
    (admin.from('ritual_reflections') as unknown as ReflectionBuilder)
      .select('created_at')
      .eq('ritual_cycle_id', input.cycleId)
      .eq('reflection_state', 'published')
      .is('deleted_at', null),
  ])

  if (participantsRes.status === 'rejected') {
    console.warn('[data/ritual] cycle ecology participants load failed', {
      cycle_id: input.cycleId,
      reason: String(participantsRes.reason),
    })
    return EMPTY_ECOLOGY
  }
  if (reflectionsRes.status === 'rejected') {
    console.warn('[data/ritual] cycle ecology reflections load failed', {
      cycle_id: input.cycleId,
      reason: String(reflectionsRes.reason),
    })
    return EMPTY_ECOLOGY
  }

  const participants = (participantsRes.value.data ?? []) as RitualParticipantRow[]
  const publishedReflections =
    (reflectionsRes.value.data ?? []) as { created_at: string }[]

  // Project participants down to the shape the pure derivation
  // expects. Strips columns we don't need to reason over.
  const projected = participants.map((p) => ({
    joined_at: p.joined_at,
    completed_at: p.completed_at,
    reflected_at: p.reflected_at,
    state: p.participation_state as RitualParticipantState,
  }))

  const observations = deriveCycleObservations({
    cycle_number: input.cycleNumber,
    participants: projected,
    publishedReflections,
  })
  return {
    counts: participationCounts(projected),
    published_reflections: publishedReflections.length,
    observations,
  }
}
