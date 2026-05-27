import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  computeCycleStatusForTime,
  shouldRefreshCycleStatus,
  validateRitualCycleWindow,
} from './lifecycle'
import type {
  RitualCycleRow,
  RitualCycleStatus,
  RitualCycleWindow,
} from './types'

/**
 * lib/ritual/cycles.ts — Phase 6B.1
 *
 * Admin-side ritual cycle services: create, transition, archive.
 *
 * All writes go through the service role. Cycle creation is the only
 * path that lands a new ritual_cycles row; the transition sweep
 * never CREATEs, only UPDATEs cycle_status to align with the clock.
 *
 * Continuity invariant:
 *   - A cycle never moves backward in lifecycle.
 *   - The partial unique index uq_ritual_cycles_room_live prevents
 *     two cycles being live in the same room simultaneously.
 *   - Promoting an upcoming cycle to active requires the prior live
 *     cycle (if any) to already be archived. The transition sweep
 *     handles this ordering in two passes per room: archive eligible
 *     first, then promote upcoming.
 *
 * Durability invariant:
 *   - All cycle state is materialized + clock-derivable. The
 *     transition sweep is idempotent — running it twice in a row
 *     does the same work the second time as the first (which is
 *     nothing, when nothing's changed).
 */

// ── Create ─────────────────────────────────────────────────────────

export interface CreateRitualCycleInput {
  room_id: string
  artifact_album_id: string | null
  ritual_type?: string
  cycle_number: number
  window: RitualCycleWindow
  legacy_cycle_id?: string | null
}

/**
 * Create a new ritual cycle in 'upcoming' state. The cycle's actual
 * lifecycle status is left to the transition sweep — even if
 * starts_at is in the past, this function persists 'upcoming' and
 * the sweep moves it forward. Keeps the create path side-effect-free
 * and idempotent under retries.
 *
 * Returns the created row, or throws on validation / DB error.
 *
 * UPSERT semantics on (room_id, cycle_number) — re-creating the same
 * cycle number for the same room is treated as an update (allows
 * window adjustments before the cycle activates). The conflict-target
 * is the existing UNIQUE(room_id, cycle_number) constraint.
 */
export async function createRitualCycle(
  input: CreateRitualCycleInput,
): Promise<RitualCycleRow> {
  const reason = validateRitualCycleWindow(input.window)
  if (reason) {
    throw new Error(`[ritual/cycles] invalid window: ${reason}`)
  }
  if (input.cycle_number < 1) {
    throw new Error('[ritual/cycles] cycle_number must be >= 1')
  }

  const admin = getSupabaseAdminClient()
  const row = {
    room_id: input.room_id,
    artifact_album_id: input.artifact_album_id,
    legacy_cycle_id: input.legacy_cycle_id ?? null,
    ritual_type: input.ritual_type ?? 'album_ritual',
    cycle_number: input.cycle_number,
    starts_at: input.window.starts_at,
    lock_at: input.window.lock_at,
    reflection_opens_at: input.window.reflection_opens_at,
    reflection_closes_at: input.window.reflection_closes_at,
    cycle_status: 'upcoming' as RitualCycleStatus,
  }

  // Cast through unknown for the same reason called out in
  // lib/db/upsert-and-prune.ts — the generated Database type lags
  // behind the schema; the cast is local and trivially reviewable.
  const { data, error } = await (
    admin.from('ritual_cycles') as unknown as {
      upsert: (
        values: Record<string, unknown>,
        opts: { onConflict: string },
      ) => {
        select: () => {
          single: () => Promise<{
            data: RitualCycleRow | null
            error: { code?: string; message: string } | null
          }>
        }
      }
    }
  )
    .upsert(row, { onConflict: 'room_id,cycle_number' })
    .select()
    .single()

  if (error) {
    throw new Error(
      `[ritual/cycles] create failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  if (!data) throw new Error('[ritual/cycles] create returned no row')
  return data
}

// ── Transition sweep ───────────────────────────────────────────────

export interface TransitionSweepResult {
  scanned: number
  advanced: number
  archived: number
  errors: Array<{ cycle_id: string; message: string }>
  duration_ms: number
}

/**
 * Sweep every cycle in 'upcoming', 'active', or 'reflection' and
 * advance any whose persisted status is now stale relative to the
 * clock.
 *
 * Ordering safety: when promoting cycle B to live in room R, we
 * MUST archive cycle A first (if A is the currently-live cycle).
 * The implementation handles this by:
 *   1. Walking cycles ordered by (room_id, starts_at).
 *   2. For each cycle: compute the time-derived status.
 *   3. If different from persisted:
 *      a. If the new status is 'archived', UPDATE in place.
 *      b. If the new status is 'active' or 'reflection', UPDATE in
 *         place; the DB unique index will reject the promote if
 *         room R is already live with another cycle. The caller
 *         must invoke the sweep iteratively or pre-sort so archives
 *         happen first. We pre-sort below to make this safe.
 *
 * Idempotent. Safe to invoke from cron, on-demand, or per-request.
 *
 * Phase 6B.1 ships this as a single-shot sweep; future phases may
 * scope it (per-room, per-status). Out of scope here.
 */
export async function transitionRitualCycles(
  options: { now?: Date } = {},
): Promise<TransitionSweepResult> {
  const startedAt = Date.now()
  const now = options.now ?? new Date()
  const admin = getSupabaseAdminClient()
  const result: TransitionSweepResult = {
    scanned: 0,
    advanced: 0,
    archived: 0,
    errors: [],
    duration_ms: 0,
  }

  // Pull every cycle that COULD still need updating. archived cycles
  // with archived_at set are sticky and skipped (saves bandwidth).
  const { data, error } = await (
    admin.from('ritual_cycles') as unknown as {
      select: (
        cols: string,
      ) => {
        in: (
          col: string,
          vals: string[],
        ) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{
            data: RitualCycleRow[] | null
            error: { code?: string; message: string } | null
          }>
        }
      }
    }
  )
    .select(
      'id, room_id, artifact_album_id, legacy_cycle_id, ritual_type, cycle_number, starts_at, lock_at, reflection_opens_at, reflection_closes_at, archived_at, cycle_status, created_at, updated_at',
    )
    .in('cycle_status', ['upcoming', 'active', 'reflection'])
    .order('room_id', { ascending: true })

  if (error) {
    throw new Error(
      `[ritual/cycles] sweep select failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }

  const cycles: RitualCycleRow[] = data ?? []
  result.scanned = cycles.length

  // Two-pass: archive first, then promote. Safe under the
  // uq_ritual_cycles_room_live partial unique index.
  const toArchive: RitualCycleRow[] = []
  const toAdvance: Array<{ cycle: RitualCycleRow; targetStatus: RitualCycleStatus }> = []

  for (const cycle of cycles) {
    const needsRefresh = shouldRefreshCycleStatus(
      cycle.cycle_status,
      cycle.archived_at,
      cycle,
      now,
    )
    if (!needsRefresh) continue
    const derived = computeCycleStatusForTime(cycle, now)
    if (derived === 'archived') {
      toArchive.push(cycle)
    } else {
      toAdvance.push({ cycle, targetStatus: derived })
    }
  }

  // Pass 1: archives. These clear the partial unique index slot for
  // the room so the corresponding promote in pass 2 can land.
  for (const cycle of toArchive) {
    const { error: archiveErr } = await (
      admin.from('ritual_cycles') as unknown as {
        update: (vals: Record<string, unknown>) => {
          eq: (
            col: string,
            val: string,
          ) => Promise<{ error: { code?: string; message: string } | null }>
        }
      }
    )
      .update({
        cycle_status: 'archived',
        archived_at: cycle.archived_at ?? now.toISOString(),
      })
      .eq('id', cycle.id)
    if (archiveErr) {
      result.errors.push({
        cycle_id: cycle.id,
        message: `archive: ${archiveErr.message}`,
      })
      continue
    }
    result.archived += 1
  }

  // Pass 2: promotes (upcoming → active, active → reflection).
  for (const { cycle, targetStatus } of toAdvance) {
    const { error: advanceErr } = await (
      admin.from('ritual_cycles') as unknown as {
        update: (vals: Record<string, unknown>) => {
          eq: (
            col: string,
            val: string,
          ) => Promise<{ error: { code?: string; message: string } | null }>
        }
      }
    )
      .update({ cycle_status: targetStatus })
      .eq('id', cycle.id)
    if (advanceErr) {
      // 23505 = unique violation. The partial index rejected because
      // another cycle is already live in this room. Caller should
      // re-invoke the sweep after the conflicting cycle finishes
      // archiving (the typical case is the sweep races itself; the
      // SECOND invocation succeeds).
      result.errors.push({
        cycle_id: cycle.id,
        message: `advance to ${targetStatus}: ${advanceErr.message}`,
      })
      continue
    }
    result.advanced += 1
  }

  result.duration_ms = Date.now() - startedAt
  return result
}

// ── Explicit archive ───────────────────────────────────────────────

/**
 * Archive a specific cycle out-of-band. Sets archived_at + status,
 * blocked from further automatic re-promotion (sticky).
 *
 * Use for editorial intervention only — normal lifecycle archives
 * flow through transitionRitualCycles().
 */
export async function archiveRitualCycle(
  cycleId: string,
  options: { now?: Date } = {},
): Promise<void> {
  const now = options.now ?? new Date()
  const admin = getSupabaseAdminClient()
  const { error } = await (
    admin.from('ritual_cycles') as unknown as {
      update: (vals: Record<string, unknown>) => {
        eq: (
          col: string,
          val: string,
        ) => Promise<{ error: { code?: string; message: string } | null }>
      }
    }
  )
    .update({
      cycle_status: 'archived',
      archived_at: now.toISOString(),
    })
    .eq('id', cycleId)
  if (error) {
    throw new Error(
      `[ritual/cycles] archive ${cycleId} failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
}
