import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type { KnownRitualPresenceEventType } from './types'

/**
 * lib/ritual/presence.ts — Phase 6B.1
 *
 * Append-only continuity memory for ritual cycles. The other ritual
 * services (cycles, participation, reflections) call
 * recordPresenceEvent() at every meaningful state change. The events
 * become the source of truth for any future continuity-scoring,
 * room-ecology, or cadence-analytics layer.
 *
 * Server-only (Template A migration). Browser never reads or writes
 * here directly. Failures are best-effort logged — a presence event
 * write that fails MUST NOT block the primary ritual operation it
 * accompanies (joining, completing, reflecting).
 */

export interface RecordPresenceEventInput {
  ritual_cycle_id: string
  user_id: string
  event_type: KnownRitualPresenceEventType | string
  metadata?: Record<string, unknown>
}

/**
 * Append one event. Best-effort — returns whether the write landed,
 * never throws. Failures are warned to the platform log only.
 *
 * Caller pattern:
 *
 *     await primaryRitualOp(...)               // must succeed
 *     await recordPresenceEvent({...})         // best-effort
 *
 * Do NOT wrap the presence call in the same try that catches the
 * primary op — a presence failure should never look like a primary
 * failure to the caller.
 */
export async function recordPresenceEvent(
  input: RecordPresenceEventInput,
): Promise<{ ok: boolean }> {
  const admin = getSupabaseAdminClient()
  const row = {
    ritual_cycle_id: input.ritual_cycle_id,
    user_id: input.user_id,
    event_type: input.event_type,
    metadata: input.metadata ?? {},
  }
  const { error } = await (
    admin.from('ritual_presence_events') as unknown as {
      insert: (values: Record<string, unknown>) => Promise<{
        error: { code?: string; message: string } | null
      }>
    }
  ).insert(row)

  if (error) {
    console.warn('[ritual/presence] event insert failed', {
      cycle_id: input.ritual_cycle_id,
      user_id: input.user_id,
      event_type: input.event_type,
      code: error.code,
      message: error.message,
    })
    return { ok: false }
  }
  return { ok: true }
}
