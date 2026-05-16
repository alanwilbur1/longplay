/**
 * lib/data/presence.ts — Phase 3B.1A
 *
 * Server-side data helper for the initial presence snapshot.
 * Used by the room page (server component) to pre-populate the
 * PresenceStrip before client-side polling takes over.
 *
 * Subsequent refreshes use getPresenceSnapshotAction (server action)
 * from lib/actions/presence.ts — no Supabase Realtime used.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface PresenceFace {
  memberId: string
  displayName: string
  avatarUrl: string | null
}

export interface PresenceSnapshot {
  presenceCount: number
  faces: PresenceFace[]
}

const EMPTY_SNAPSHOT: PresenceSnapshot = { presenceCount: 0, faces: [] }

export async function getRoomPresenceSnapshot(
  cycleId: string,
): Promise<PresenceSnapshot> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.rpc('get_room_presence_snapshot', {
    p_cycle_id: cycleId,
  })

  if (error || !data) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[presence] getRoomPresenceSnapshot failed:', error?.message)
    }
    return EMPTY_SNAPSHOT
  }

  const raw = data as {
    presence_count: number
    faces: Array<{ member_id: string; display_name: string; avatar_url: string | null }>
  }

  return {
    presenceCount: raw.presence_count ?? 0,
    faces: (raw.faces ?? []).map(f => ({
      memberId: f.member_id,
      displayName: f.display_name,
      avatarUrl: f.avatar_url ?? null,
    })),
  }
}
