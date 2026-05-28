'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  advanceParticipation,
  joinRitual,
} from '@/lib/ritual/participation'
import {
  submitReflection,
  updateReflection,
} from '@/lib/ritual/reflections'
import type {
  RitualParticipantRow,
  RitualReflectionRow,
} from '@/lib/ritual/types'
import type { ReflectionTransition } from '@/lib/ritual/lifecycle'

/**
 * lib/actions/ritual.ts — Phase 6B.2
 *
 * Server actions for the listener-facing ritual surface. Each action:
 *   1. Resolves auth via the user-scoped Supabase server client.
 *   2. Delegates to the lib/ritual/* service layer, which uses the
 *      admin client so the writes carry the same validation + audit
 *      regardless of which route invoked them.
 *   3. Returns a shaped result with `ok`, optional `data`, optional
 *      `error` — UI consumes the discriminated union without
 *      throwing.
 *
 * All actions are safe to call repeatedly. The underlying services
 * are idempotent at the operation level (joinRitual returns the
 * existing row if any; reflection submit creates one row per call
 * but the form should debounce). Failures never poison participation
 * state — the state machine rejects illegal transitions explicitly.
 */

export type RitualActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

function notAuthed(): RitualActionResult<never> {
  return {
    ok: false,
    error: { code: 'not_authenticated', message: 'Please sign in to participate.' },
  }
}

function unexpected(err: unknown): RitualActionResult<never> {
  const message = err instanceof Error ? err.message : String(err)
  return {
    ok: false,
    error: { code: 'unexpected', message: message.slice(0, 200) },
  }
}

// ── Join ──────────────────────────────────────────────────────────

export async function joinRitualAction(
  ritualCycleId: string,
): Promise<RitualActionResult<{ participant: RitualParticipantRow; was_idempotent: boolean }>> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notAuthed()

  try {
    const result = await joinRitual({
      ritual_cycle_id: ritualCycleId,
      user_id: user.id,
      via: 'manual',
    })
    // Soft revalidate; the room screen reads ritual context server-side.
    try {
      revalidatePath('/rooms', 'layout')
    } catch {
      // revalidatePath may throw outside a request scope in tests;
      // that's fine — the data writes already landed.
    }
    return { ok: true, data: result }
  } catch (err) {
    return unexpected(err)
  }
}

// ── Mark completed ────────────────────────────────────────────────

/**
 * Listener self-reports completion. completion_percent is optional;
 * future phases may compute it server-side from Layer 1 events
 * (listening_events join). For now, the listener is the source of
 * truth on whether they "completed" the ritual artifact.
 */
export async function markRitualCompletedAction(
  ritualCycleId: string,
  completionPercent?: number,
): Promise<RitualActionResult<RitualParticipantRow>> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notAuthed()

  // Two transitions in sequence: ensure they started listening, then
  // mark complete. The state machine handles idempotency — calling
  // start_listening on an already-completed participant is a no-op.
  try {
    try {
      await advanceParticipation({
        ritual_cycle_id: ritualCycleId,
        user_id: user.id,
        transition: 'start_listening',
      })
    } catch {
      // If the participant doesn't exist (never joined), the first
      // advance fails and the next call would too. Auto-join here
      // to keep the UI flow simple (a listener marking 'completed'
      // implicitly joined).
      await joinRitual({
        ritual_cycle_id: ritualCycleId,
        user_id: user.id,
        via: 'manual',
      })
    }
    const result = await advanceParticipation({
      ritual_cycle_id: ritualCycleId,
      user_id: user.id,
      transition: 'complete',
      completion_percent: completionPercent ?? null,
    })
    try {
      revalidatePath('/rooms', 'layout')
    } catch {}
    return { ok: true, data: result }
  } catch (err) {
    return unexpected(err)
  }
}

// ── Withdraw ──────────────────────────────────────────────────────

export async function withdrawFromRitualAction(
  ritualCycleId: string,
): Promise<RitualActionResult<RitualParticipantRow>> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notAuthed()
  try {
    const result = await advanceParticipation({
      ritual_cycle_id: ritualCycleId,
      user_id: user.id,
      transition: 'withdraw',
    })
    try {
      revalidatePath('/rooms', 'layout')
    } catch {}
    return { ok: true, data: result }
  } catch (err) {
    return unexpected(err)
  }
}

// ── Submit reflection ─────────────────────────────────────────────

export async function submitReflectionAction(input: {
  ritualCycleId: string
  body: string
  asState?: 'draft' | 'published'
}): Promise<RitualActionResult<RitualReflectionRow>> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notAuthed()
  try {
    const result = await submitReflection({
      ritual_cycle_id: input.ritualCycleId,
      user_id: user.id,
      body: input.body,
      as_state: input.asState,
    })
    try {
      revalidatePath('/rooms', 'layout')
    } catch {}
    return { ok: true, data: result }
  } catch (err) {
    return unexpected(err)
  }
}

// ── Update reflection ─────────────────────────────────────────────

export async function updateReflectionAction(input: {
  reflectionId: string
  body?: string
  transition?: ReflectionTransition
}): Promise<RitualActionResult<RitualReflectionRow>> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notAuthed()

  // Ownership pre-check via the user-scoped client. RLS on
  // ritual_reflections enforces auth.uid() = user_id for SELECT, so
  // a thief passing someone else's reflectionId here sees no row
  // and we return 'forbidden' BEFORE any admin-client write fires.
  const { data: owned, error: ownErr } = await supabase
    .from('ritual_reflections')
    .select('id, user_id')
    .eq('id', input.reflectionId)
    .maybeSingle()
  if (ownErr) {
    return {
      ok: false,
      error: { code: 'lookup_failed', message: ownErr.message },
    }
  }
  if (!owned || (owned as { user_id: string }).user_id !== user.id) {
    return {
      ok: false,
      error: {
        code: 'forbidden',
        message: 'You can only edit your own reflection.',
      },
    }
  }

  try {
    const result = await updateReflection({
      reflection_id: input.reflectionId,
      body: input.body,
      transition: input.transition,
    })
    try {
      revalidatePath('/rooms', 'layout')
    } catch {}
    return { ok: true, data: result }
  } catch (err) {
    return unexpected(err)
  }
}
