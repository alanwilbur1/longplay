import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type {
  RitualCycleRow,
  RitualCycleSummary,
  RitualParticipantRow,
  ParticipationSnapshot,
} from './types'

/**
 * lib/ritual/queries.ts — Phase 6B.1
 *
 * Read-side helpers for the ritual cadence substrate. Optimized for:
 *
 *   - homepage / "this week" surfaces           getActiveRitualForRoom
 *   - room landing pages                        getRoomCycleSummary
 *   - upcoming-cycle previews                   getUpcomingRitualForRoom
 *   - room history strips                       getArchivedRitualsForRoom
 *   - per-user participation snapshots          getParticipationStateForUser
 *   - room-level reflection density             getReflectionCountsForCycle
 *
 * All reads use the admin client (service role). Where the same data
 * is needed from a browser/server-action read path, the existing RLS
 * policies on ritual_cycles (public) and ritual_participants /
 * ritual_reflections (owner-self) handle it; these helpers exist to
 * give server-side computed views without paying RLS query cost.
 *
 * NOTE: ritual_presence_events is NOT exposed by any read here.
 * That table is server-internal; future continuity-scoring services
 * will consume it directly, not through this query layer.
 */

const CYCLE_COLS =
  'id, room_id, artifact_album_id, legacy_cycle_id, ritual_type, cycle_number, starts_at, lock_at, reflection_opens_at, reflection_closes_at, archived_at, cycle_status, created_at, updated_at'

// ── Cycle reads ────────────────────────────────────────────────────

/**
 * Returns the cycle currently live in a room (`active` or
 * `reflection`), or null when the room is between cycles.
 *
 * Backed by uq_ritual_cycles_room_live partial unique index —
 * guaranteed to return at most one row.
 */
export async function getActiveRitualForRoom(
  roomId: string,
): Promise<RitualCycleRow | null> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await (
    admin.from('ritual_cycles') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          in: (col: string, vals: string[]) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => {
                maybeSingle: () => Promise<{
                  data: RitualCycleRow | null
                  error: { code?: string; message: string } | null
                }>
              }
            }
          }
        }
      }
    }
  )
    .select(CYCLE_COLS)
    .eq('room_id', roomId)
    .in('cycle_status', ['active', 'reflection'])
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    throw new Error(
      `[ritual/queries] getActiveRitualForRoom failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  return data
}

/**
 * Returns the next upcoming cycle for a room, or null when none is
 * scheduled.
 */
export async function getUpcomingRitualForRoom(
  roomId: string,
): Promise<RitualCycleRow | null> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await (
    admin.from('ritual_cycles') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => {
                maybeSingle: () => Promise<{
                  data: RitualCycleRow | null
                  error: { code?: string; message: string } | null
                }>
              }
            }
          }
        }
      }
    }
  )
    .select(CYCLE_COLS)
    .eq('room_id', roomId)
    .eq('cycle_status', 'upcoming')
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    throw new Error(
      `[ritual/queries] getUpcomingRitualForRoom failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  return data
}

/**
 * Archived cycles for a room, most-recent first. Bounded by limit.
 * Drives the "past cycles" strip on room landing pages.
 */
export async function getArchivedRitualsForRoom(
  roomId: string,
  limit = 12,
): Promise<RitualCycleRow[]> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await (
    admin.from('ritual_cycles') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{
                data: RitualCycleRow[] | null
                error: { code?: string; message: string } | null
              }>
            }
          }
        }
      }
    }
  )
    .select(CYCLE_COLS)
    .eq('room_id', roomId)
    .eq('cycle_status', 'archived')
    .order('starts_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)))
  if (error) {
    throw new Error(
      `[ritual/queries] getArchivedRitualsForRoom failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  return data ?? []
}

// ── Participation reads ────────────────────────────────────────────

/**
 * Snapshot of one listener's participation in one cycle. Returns
 * null when the listener never joined.
 */
export async function getParticipationStateForUser(
  cycleId: string,
  userId: string,
): Promise<ParticipationSnapshot | null> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await (
    admin.from('ritual_participants') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: RitualParticipantRow | null
              error: { code?: string; message: string } | null
            }>
          }
        }
      }
    }
  )
    .select(
      'ritual_cycle_id, user_id, participation_state, joined_at, completed_at, reflected_at, completion_percent',
    )
    .eq('ritual_cycle_id', cycleId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    throw new Error(
      `[ritual/queries] getParticipationStateForUser failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  if (!data) return null
  return {
    cycle_id: data.ritual_cycle_id,
    user_id: data.user_id,
    state: data.participation_state,
    joined_at: data.joined_at,
    completed_at: data.completed_at,
    reflected_at: data.reflected_at,
    completion_percent: data.completion_percent,
  }
}

// ── Reflection reads ───────────────────────────────────────────────

export interface ReflectionCounts {
  published: number
  draft: number
}

/**
 * Counts of reflections per state for one cycle. Skips soft-deleted
 * rows. Drives the room landing page's reflection-density indicator.
 *
 * Two queries (one per state) rather than a GROUP BY because the
 * partial indexes on (cycle_id) WHERE state = '…' make each lookup
 * trivially cheap.
 */
export async function getReflectionCountsForCycle(
  cycleId: string,
): Promise<ReflectionCounts> {
  const admin = getSupabaseAdminClient()

  type CountResult = {
    count: number | null
    error: { code?: string; message: string } | null
  }
  type Builder = {
    select: (
      cols: string,
      opts: { count: 'exact'; head: true },
    ) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          is: (col: string, val: null) => Promise<CountResult>
        }
      }
    }
  }
  async function countForState(state: 'published' | 'draft'): Promise<number> {
    const { count, error } = await (
      admin.from('ritual_reflections') as unknown as Builder
    )
      .select('id', { count: 'exact', head: true })
      .eq('ritual_cycle_id', cycleId)
      .eq('reflection_state', state)
      .is('deleted_at', null)
    if (error) {
      throw new Error(
        `[ritual/queries] count ${state} failed: code=${error.code ?? 'n/a'} message=${error.message}`,
      )
    }
    return count ?? 0
  }
  const [published, draft] = await Promise.all([
    countForState('published'),
    countForState('draft'),
  ])
  return { published, draft }
}

// ── Composed summary ───────────────────────────────────────────────

/**
 * One-shot read used by room landing pages: cycle + participant
 * counts + reflection counts. Single function so the caller doesn't
 * need to assemble the parts.
 */
export async function getRoomCycleSummary(
  cycleId: string,
): Promise<RitualCycleSummary | null> {
  const admin = getSupabaseAdminClient()

  const { data: cycle, error: cycleErr } = await (
    admin.from('ritual_cycles') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: RitualCycleRow | null
            error: { code?: string; message: string } | null
          }>
        }
      }
    }
  )
    .select(CYCLE_COLS)
    .eq('id', cycleId)
    .maybeSingle()
  if (cycleErr) {
    throw new Error(
      `[ritual/queries] summary cycle load failed: code=${cycleErr.code ?? 'n/a'} message=${cycleErr.message}`,
    )
  }
  if (!cycle) return null

  // Participant counts per state.
  type CountFn = () => Promise<number>
  const states = ['joined', 'listening', 'completed', 'reflected', 'withdrawn'] as const
  type Builder = {
    select: (
      cols: string,
      opts: { count: 'exact'; head: true },
    ) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => Promise<{
          count: number | null
          error: { code?: string; message: string } | null
        }>
      }
    }
  }
  const countOps: Array<[(typeof states)[number], CountFn]> = states.map((state) => [
    state,
    async () => {
      const { count, error } = await (
        admin.from('ritual_participants') as unknown as Builder
      )
        .select('user_id', { count: 'exact', head: true })
        .eq('ritual_cycle_id', cycleId)
        .eq('participation_state', state)
      if (error) {
        throw new Error(
          `[ritual/queries] participant count ${state} failed: code=${error.code ?? 'n/a'} message=${error.message}`,
        )
      }
      return count ?? 0
    },
  ])
  const counts = await Promise.all(countOps.map(([, fn]) => fn()))
  const participant_counts = {
    joined: counts[0],
    listening: counts[1],
    completed: counts[2],
    reflected: counts[3],
    withdrawn: counts[4],
  }

  const reflection_counts = await getReflectionCountsForCycle(cycleId)
  return { cycle, participant_counts, reflection_counts }
}
