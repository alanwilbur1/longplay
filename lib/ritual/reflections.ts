import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  canWriteReflection,
  nextReflectionState,
  type ReflectionTransition,
} from './lifecycle'
import { advanceParticipation } from './participation'
import { recordPresenceEvent } from './presence'
import type {
  RitualCycleRow,
  RitualReflectionRow,
  RitualReflectionState,
} from './types'

/**
 * lib/ritual/reflections.ts — Phase 6B.1
 *
 * Reflection authoring services. Listeners write through server
 * actions which call these; the admin client is the writer so we
 * can enforce gating (cycle status, body length, transitions)
 * uniformly instead of leaning on RLS to return cryptic 403s.
 *
 * Visibility gating happens in the DB via RLS
 * (ritual_reflections_peer_select). The service layer additionally
 * enforces:
 *   - body length bounds (matching the DB CHECK)
 *   - state transition legality (matching nextReflectionState)
 *   - cycle-status write window (matching canWriteReflection)
 *
 * Soft-delete only — reflections set deleted_at + reflection_state
 * = 'archived'; never hard-deleted. This preserves cycle continuity
 * memory (e.g. "this cycle had 23 reflections" stays true).
 */

const MAX_BODY = 8000

// ── Helpers ────────────────────────────────────────────────────────

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
      `[ritual/reflections] load cycle failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  return data
}

async function loadReflection(id: string): Promise<RitualReflectionRow | null> {
  const admin = getSupabaseAdminClient()
  const { data, error } = await (
    admin.from('ritual_reflections') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: RitualReflectionRow | null
            error: { code?: string; message: string } | null
          }>
        }
      }
    }
  )
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    throw new Error(
      `[ritual/reflections] load failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  return data
}

// ── Submit (insert) ────────────────────────────────────────────────

export interface SubmitReflectionInput {
  ritual_cycle_id: string
  user_id: string
  body: string
  /** Default 'draft'. Pass 'published' to immediately publish; the
   *  service will reject if the cycle isn't in 'reflection' state. */
  as_state?: 'draft' | 'published'
}

export async function submitReflection(
  input: SubmitReflectionInput,
): Promise<RitualReflectionRow> {
  const body = input.body.trim()
  if (body.length === 0) {
    throw new Error('[ritual/reflections] body cannot be empty')
  }
  if (body.length > MAX_BODY) {
    throw new Error(`[ritual/reflections] body exceeds ${MAX_BODY} chars`)
  }
  const asState: RitualReflectionState = input.as_state ?? 'draft'
  const cycle = await loadCycle(input.ritual_cycle_id)
  if (!cycle) {
    throw new Error(`[ritual/reflections] cycle not found: ${input.ritual_cycle_id}`)
  }
  const gate = canWriteReflection(cycle.cycle_status, asState)
  if (!gate.ok) {
    throw new Error(`[ritual/reflections] ${gate.reason}`)
  }

  const admin = getSupabaseAdminClient()
  const { data, error } = await (
    admin.from('ritual_reflections') as unknown as {
      insert: (vals: Record<string, unknown>) => {
        select: () => {
          single: () => Promise<{
            data: RitualReflectionRow | null
            error: { code?: string; message: string } | null
          }>
        }
      }
    }
  )
    .insert({
      ritual_cycle_id: input.ritual_cycle_id,
      user_id: input.user_id,
      body,
      reflection_state: asState,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `[ritual/reflections] insert failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  if (!data) throw new Error('[ritual/reflections] insert returned no row')

  // If the listener published immediately, advance their
  // participation state to 'reflected'. Best-effort — the
  // reflection itself already landed.
  if (asState === 'published') {
    try {
      await advanceParticipation({
        ritual_cycle_id: input.ritual_cycle_id,
        user_id: input.user_id,
        transition: 'reflect',
      })
    } catch (err) {
      console.warn('[ritual/reflections] participation advance failed', {
        cycle_id: input.ritual_cycle_id,
        user_id: input.user_id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  await recordPresenceEvent({
    ritual_cycle_id: input.ritual_cycle_id,
    user_id: input.user_id,
    event_type: 'reflection_submitted',
    metadata: {
      reflection_id: data.id,
      char_count: body.length,
      as_state: asState,
    },
  })

  return data
}

// ── Update (edit / publish / archive) ──────────────────────────────

export interface UpdateReflectionInput {
  reflection_id: string
  /** Updated body. Omit to keep existing. */
  body?: string
  /** State transition to apply. Omit to leave state alone. */
  transition?: ReflectionTransition
}

export async function updateReflection(
  input: UpdateReflectionInput,
): Promise<RitualReflectionRow> {
  const existing = await loadReflection(input.reflection_id)
  if (!existing) {
    throw new Error(`[ritual/reflections] not found: ${input.reflection_id}`)
  }
  if (existing.deleted_at) {
    throw new Error('[ritual/reflections] reflection is soft-deleted; un-archive first')
  }

  const cycle = await loadCycle(existing.ritual_cycle_id)
  if (!cycle) {
    throw new Error(
      `[ritual/reflections] cycle not found for reflection: ${existing.ritual_cycle_id}`,
    )
  }

  const patch: Record<string, unknown> = {}
  let newState: RitualReflectionState = existing.reflection_state

  if (input.transition) {
    const target = nextReflectionState(existing.reflection_state, input.transition)
    if (target === null) {
      throw new Error(
        `[ritual/reflections] illegal transition: ${existing.reflection_state} + ${input.transition}`,
      )
    }
    newState = target
    patch.reflection_state = target
    if (target === 'archived') {
      patch.deleted_at = new Date().toISOString()
    }
    if (existing.reflection_state === 'archived' && target !== 'archived') {
      // un-archive: clear deleted_at
      patch.deleted_at = null
    }
  }

  if (input.body !== undefined) {
    const body = input.body.trim()
    if (body.length === 0) {
      throw new Error('[ritual/reflections] body cannot be empty')
    }
    if (body.length > MAX_BODY) {
      throw new Error(`[ritual/reflections] body exceeds ${MAX_BODY} chars`)
    }
    patch.body = body
  }

  // Cycle-status gate on the resulting state.
  const gate = canWriteReflection(cycle.cycle_status, newState)
  if (!gate.ok) {
    throw new Error(`[ritual/reflections] ${gate.reason}`)
  }

  if (Object.keys(patch).length === 0) {
    return existing
  }

  const admin = getSupabaseAdminClient()
  const { data, error } = await (
    admin.from('ritual_reflections') as unknown as {
      update: (vals: Record<string, unknown>) => {
        eq: (col: string, val: string) => {
          select: () => {
            single: () => Promise<{
              data: RitualReflectionRow | null
              error: { code?: string; message: string } | null
            }>
          }
        }
      }
    }
  )
    .update(patch)
    .eq('id', input.reflection_id)
    .select()
    .single()

  if (error) {
    throw new Error(
      `[ritual/reflections] update failed: code=${error.code ?? 'n/a'} message=${error.message}`,
    )
  }
  if (!data) throw new Error('[ritual/reflections] update returned no row')

  // Promotion to published advances participation; demotion does not.
  if (
    existing.reflection_state !== 'published' &&
    newState === 'published'
  ) {
    try {
      await advanceParticipation({
        ritual_cycle_id: existing.ritual_cycle_id,
        user_id: existing.user_id,
        transition: 'reflect',
      })
    } catch (err) {
      console.warn('[ritual/reflections] participation advance failed', {
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  await recordPresenceEvent({
    ritual_cycle_id: existing.ritual_cycle_id,
    user_id: existing.user_id,
    event_type: 'reflection_updated',
    metadata: {
      reflection_id: existing.id,
      from_state: existing.reflection_state,
      to_state: newState,
    },
  })

  return data
}
