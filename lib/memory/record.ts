'use server'

/**
 * lib/memory/record.ts — Phase 3F
 *
 * Server actions that write to participation_events. All writes are
 * fire-and-forget from the caller's perspective: a failure to record
 * memory must never block the user-facing action that triggered it.
 *
 * Three write paths in this module:
 *   1. recordRoomEntry(cycleId, albumId?)   — fired by active-room mount
 *   2. recordMomentCreated(...)             — called from createMoment
 *   3. recordCycleJoin(cycleId)             — called from joinRoom
 *
 * Deduplication: listen_start has a 10-minute window — if the user has
 * a listen_start for the same cycle within the last 10 minutes we skip
 * the insert. This makes the path safe to call from any mount effect
 * (refreshes, HMR, route revisits within a session) without inflating
 * the count.
 *
 * Why a server-side dedup AND a client-side localStorage gate (in the
 * mount effect): the client gate is the cheap path; the server gate is
 * the truthful one. Clearing localStorage shouldn't let a user re-pad
 * their own return count.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface RecordResult {
  ok: boolean
  recorded: boolean
}

// ── recordRoomEntry ────────────────────────────────────────────────────────
// listen_start event. Dedup'd to one per (user, cycle) per 10 minutes.

const LISTEN_START_DEDUP_MS = 10 * 60 * 1000

export async function recordRoomEntry(
  cycleId: string,
  albumId: string | null = null,
): Promise<RecordResult> {
  if (!cycleId) return { ok: true, recorded: false }
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: true, recorded: false }

    // Dedup: skip if an event of the same type for this cycle was
    // recorded for this user inside the dedup window.
    const since = new Date(Date.now() - LISTEN_START_DEDUP_MS).toISOString()
    const { data: recent } = await supabase
      .from('participation_events')
      .select('id')
      .eq('member_id', user.id)
      .eq('event_type', 'listen_start')
      .eq('cycle_id', cycleId)
      .gte('created_at', since)
      .limit(1)

    if (recent && recent.length > 0) return { ok: true, recorded: false }

    const { error } = await supabase
      .from('participation_events')
      .insert({
        member_id: user.id,
        event_type: 'listen_start',
        cycle_id: cycleId,
        album_id: albumId,
      })

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[memory/record] listen_start insert failed:', error.message)
      }
      return { ok: false, recorded: false }
    }
    return { ok: true, recorded: true }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[memory/record] recordRoomEntry exception:', err)
    }
    return { ok: false, recorded: false }
  }
}

// ── recordMomentCreated ────────────────────────────────────────────────────
// Called inline from createMoment after a successful INSERT. Never
// blocks the moment write — the caller wraps this in try/catch and
// returns success on the moment regardless.
//
// Not dedup'd: every moment_create is a real distinct action and
// produces exactly one event.

export interface MomentCreatedInput {
  momentId: string
  cycleId: string | null
  albumId: string
  momentType: string
}

export async function recordMomentCreated(
  input: MomentCreatedInput,
): Promise<RecordResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: true, recorded: false }

    const { error } = await supabase
      .from('participation_events')
      .insert({
        member_id: user.id,
        event_type: 'moment_create',
        moment_id: input.momentId,
        cycle_id: input.cycleId,
        album_id: input.albumId,
        metadata: { moment_type: input.momentType },
      })

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[memory/record] moment_create insert failed:', error.message)
      }
      return { ok: false, recorded: false }
    }
    return { ok: true, recorded: true }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[memory/record] recordMomentCreated exception:', err)
    }
    return { ok: false, recorded: false }
  }
}

// ── recordCycleJoin ────────────────────────────────────────────────────────
// Fired from joinRoom after a successful upsert. Dedup'd to once per
// (user, cycle) — the unique constraint on (event_type, member_id,
// cycle_id) isn't enforced at the schema level so we check first.

export async function recordCycleJoin(
  cycleId: string,
): Promise<RecordResult> {
  if (!cycleId) return { ok: true, recorded: false }
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: true, recorded: false }

    const { data: existing } = await supabase
      .from('participation_events')
      .select('id')
      .eq('member_id', user.id)
      .eq('event_type', 'cycle_join')
      .eq('cycle_id', cycleId)
      .limit(1)

    if (existing && existing.length > 0) return { ok: true, recorded: false }

    const { error } = await supabase
      .from('participation_events')
      .insert({
        member_id: user.id,
        event_type: 'cycle_join',
        cycle_id: cycleId,
      })

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[memory/record] cycle_join insert failed:', error.message)
      }
      return { ok: false, recorded: false }
    }
    return { ok: true, recorded: true }
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[memory/record] recordCycleJoin exception:', err)
    }
    return { ok: false, recorded: false }
  }
}
