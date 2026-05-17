'use server'

/**
 * lib/actions/presence.ts — Phase 3B.1A
 *
 * Server actions for the room_presence heartbeat lifecycle.
 * No revalidatePath calls — presence is ephemeral, not cached.
 *
 * All actions require an authenticated user; unauthenticated
 * calls return success silently (no error surfaced to client).
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import type { PresenceSnapshot } from '@/lib/data/presence'

export type PresenceVisibility = 'counted' | 'identified'
export type ListeningState = 'active' | 'paused' | 'idle'

type PresenceRow = Database['public']['Tables']['room_presence']['Row']

export interface UpsertPresenceInput {
  cycleId: string
  visibilityTier?: PresenceVisibility | null
  listeningState?: ListeningState
  currentTrack?: number | null
  progressSeconds?: number | null
}

export interface ActionResult {
  success: boolean
  error?: string
}

// ── upsertPresence ────────────────────────────────────────────
//
// Inserts or updates the caller's presence row for a cycle.
// Default visibility = null (invisible).
// Probabilistic cleanup (~5 % of calls) handles stale rows when
// pg_cron is not available.

export async function upsertPresence(
  input: UpsertPresenceInput,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: true } // silent no-op for unauthenticated

  const visibilityTier = input.visibilityTier ?? null

  // Validate: track requires identified visibility
  if (input.currentTrack != null && visibilityTier !== 'identified') {
    return { success: false, error: 'current_track requires identified visibility' }
  }

  const { error } = await supabase
    .from('room_presence')
    .upsert(
      {
        member_id: user.id,
        cycle_id: input.cycleId,
        visibility_tier: visibilityTier,
        listening_state: input.listeningState ?? 'active',
        current_track: input.currentTrack ?? null,
        progress_seconds: input.progressSeconds ?? null,
        last_heartbeat: new Date().toISOString(),
      } satisfies Partial<PresenceRow>,
      { onConflict: 'member_id,cycle_id' },
    )

  if (error) {
    console.error('[upsertPresence] error:', error.message)
    return { success: false, error: error.message }
  }

  // Probabilistic cleanup (~5 % of heartbeats) when pg_cron unavailable
  if (Math.random() < 0.05) {
    supabase.rpc('cleanup_room_presence').catch(() => {})
  }

  return { success: true }
}

// ── removePresence ────────────────────────────────────────────
//
// Removes the caller's presence row for a cycle.
// Called on component unmount (best-effort).

export async function removePresence(cycleId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: true }

  const { error } = await supabase
    .from('room_presence')
    .delete()
    .eq('member_id', user.id)
    .eq('cycle_id', cycleId)

  if (error) {
    console.error('[removePresence] error:', error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ── getPresenceSnapshotAction ─────────────────────────────────
//
// Server action wrapper used by PresenceStrip for client-side
// polling (30 s interval). Not cached — always fresh.

export async function getPresenceSnapshotAction(
  cycleId: string,
): Promise<PresenceSnapshot> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('get_room_presence_snapshot', {
    p_cycle_id: cycleId,
  })

  if (error || !data) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[presence] snapshot RPC failed:', error?.message)
    }
    return { presenceCount: 0, faces: [] }
  }

  const raw = data as { presence_count: number; faces: PresenceFaceRaw[] }
  return {
    presenceCount: raw.presence_count ?? 0,
    faces: (raw.faces ?? []).map(f => ({
      memberId: f.member_id,
      displayName: f.display_name,
      avatarUrl: f.avatar_url ?? null,
    })),
  }
}

interface PresenceFaceRaw {
  member_id: string
  display_name: string
  avatar_url: string | null
}
