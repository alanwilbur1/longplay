import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  canJoinCycle,
  nextParticipationState,
  type ParticipationTransition,
} from './lifecycle'
import { recordPresenceEvent } from './presence'
import type {
  RitualCycleRow,
  RitualParticipantRow,
  RitualParticipantState,
} from './types'

/**
 * lib/ritual/participation.ts — Phase 6B.1
 *
 * Per-cycle participation services. Each operation:
 *   1. Loads the target cycle to read cycle_status (gating decisions).
 *   2. Reads the existing participant row (if any).
 *   3. Applies the pure state-machine transition.
 *   4. UPSERTs the new participant state.
 *   5. Appends a presence event (best-effort).
 *
 * All writes go through the admin client; the table has no browser
 * write grants. Server actions wrap these for the listener-facing
 * surface.
 *
 * Durability:
 *   - UPSERT-on-conflict on (ritual_cycle_id, user_id), never
 *     delete-then-insert. Joining the same cycle twice is idempotent.
 *   - State transitions are monotonic per the pure state machine
 *     in lifecycle.ts; an illegal transition returns an explicit
 *     error and leaves DB state untouched.
 */

// ── Internal helpers ───────────────────────────────────────────────

async function loadCycle(cycleId: string): Promise<RitualCycleRow | null> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await (
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
    .select(
      'id, room_id, artifact_album_id, legacy_cycle_id, ritual_type, cycle_number, starts_at, lock_at, reflection_opens_at, reflection_closes_at, archived_at, cycle_status, created_at, updated_at',
    )
    .eq('id', cycleId)
    .maybeSingle()
  if (error) {
    throw new Error(
      `[ritual/participation] load cycle failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  return data
}

async function loadParticipant(
  cycleId: string,
  userId: string,
): Promise<RitualParticipantRow | null> {
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
    .select('*')
    .eq('ritual_cycle_id', cycleId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    throw new Error(
      `[ritual/participation] load participant failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  return data
}

async function upsertParticipant(
  row: Partial<RitualParticipantRow> & {
    ritual_cycle_id: string
    user_id: string
  },
): Promise<RitualParticipantRow> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await (
    admin.from('ritual_participants') as unknown as {
      upsert: (
        values: Record<string, unknown>,
        opts: { onConflict: string },
      ) => {
        select: () => {
          single: () => Promise<{
            data: RitualParticipantRow | null
            error: { code?: string; message: string } | null
          }>
        }
      }
    }
  )
    .upsert(row, { onConflict: 'ritual_cycle_id,user_id' })
    .select()
    .single()
  if (error) {
    throw new Error(
      `[ritual/participation] upsert failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  if (!data) throw new Error('[ritual/participation] upsert returned no row')
  return data
}

// ── Public API ─────────────────────────────────────────────────────

export interface JoinRitualInput {
  ritual_cycle_id: string
  user_id: string
  via?: 'manual' | 'auto-place'
}

export interface JoinRitualResult {
  participant: RitualParticipantRow
  was_idempotent: boolean
}

/**
 * Listener opts into a cycle. Idempotent — joining twice returns the
 * existing row unchanged. Refuses to join past lock_at (cycle is in
 * reflection or archived).
 */
export async function joinRitual(
  input: JoinRitualInput,
): Promise<JoinRitualResult> {
  const cycle = await loadCycle(input.ritual_cycle_id)
  if (!cycle) {
    throw new Error(`[ritual/participation] cycle not found: ${input.ritual_cycle_id}`)
  }
  if (!canJoinCycle(cycle.cycle_status)) {
    throw new Error(
      `[ritual/participation] cannot join cycle in status ${cycle.cycle_status} — window closed`,
    )
  }
  const existing = await loadParticipant(input.ritual_cycle_id, input.user_id)
  if (existing) {
    return { participant: existing, was_idempotent: true }
  }
  const now = new Date().toISOString()
  const participant = await upsertParticipant({
    ritual_cycle_id: input.ritual_cycle_id,
    user_id: input.user_id,
    joined_at: now,
    last_activity_at: now,
    participation_state: 'joined',
    completion_percent: null,
  })
  // Best-effort presence event. Never blocks.
  await recordPresenceEvent({
    ritual_cycle_id: input.ritual_cycle_id,
    user_id: input.user_id,
    event_type: 'joined',
    metadata: { via: input.via ?? 'manual' },
  })
  return { participant, was_idempotent: false }
}

export interface AdvanceParticipationInput {
  ritual_cycle_id: string
  user_id: string
  transition: ParticipationTransition
  completion_percent?: number | null
}

/**
 * Apply a state transition to an existing participant row.
 *
 * Returns the updated participant. Throws on:
 *   - participant not found
 *   - illegal state transition (e.g. withdrawn → anything)
 *
 * Caller is responsible for mapping transition semantics:
 *   - start_listening    fires on first listen_start signal
 *   - complete           fires when listening_completed
 *   - reflect            fires when a published reflection lands
 *                         (see lib/ritual/reflections.ts)
 *   - withdraw           fires on explicit opt-out
 */
export async function advanceParticipation(
  input: AdvanceParticipationInput,
): Promise<RitualParticipantRow> {
  const existing = await loadParticipant(
    input.ritual_cycle_id,
    input.user_id,
  )
  if (!existing) {
    throw new Error(
      `[ritual/participation] participant not found: cycle=${input.ritual_cycle_id} user=${input.user_id} (call joinRitual first)`,
    )
  }
  const target = nextParticipationState(
    existing.participation_state,
    input.transition,
  )
  if (target === null) {
    throw new Error(
      `[ritual/participation] illegal transition: ${existing.participation_state} + ${input.transition}`,
    )
  }
  const now = new Date().toISOString()
  const patch: Partial<RitualParticipantRow> & {
    ritual_cycle_id: string
    user_id: string
  } = {
    ritual_cycle_id: input.ritual_cycle_id,
    user_id: input.user_id,
    participation_state: target,
    last_activity_at: now,
  }
  if (target === 'completed' && !existing.completed_at) {
    patch.completed_at = now
  }
  if (target === 'reflected' && !existing.reflected_at) {
    patch.reflected_at = now
  }
  if (input.completion_percent !== undefined) {
    patch.completion_percent = input.completion_percent
  }
  const updated = await upsertParticipant(patch)
  // Best-effort presence event.
  const eventType = transitionToEventType(input.transition)
  if (eventType) {
    await recordPresenceEvent({
      ritual_cycle_id: input.ritual_cycle_id,
      user_id: input.user_id,
      event_type: eventType,
      metadata:
        input.completion_percent !== undefined
          ? { completion_percent: input.completion_percent }
          : {},
    })
  }
  return updated
}

function transitionToEventType(t: ParticipationTransition): string | null {
  switch (t) {
    case 'start_listening':
      return 'listening_started'
    case 'complete':
      return 'listening_completed'
    case 'reflect':
      // The reflection service already records its own
      // 'reflection_submitted'/'reflection_updated' event with
      // richer metadata. Skipping here avoids a duplicate.
      return null
    case 'withdraw':
      return 'withdrew'
    default:
      return null
  }
}
