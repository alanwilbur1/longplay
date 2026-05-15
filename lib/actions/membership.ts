'use server'

/**
 * lib/actions/membership.ts
 *
 * Server actions for club membership (join / leave / read).
 * Uses the authenticated server client so auth.uid() is the acting user.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MembershipRow {
  roomSlug: string
  roomName: string
  status: 'active' | 'left'
  joinedAt: string
  role: string
}

// ── Resolve room UUID from slug ──────────────────────────────────────────────

async function getRoomId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  roomSlug: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('rooms')
    .select('id')
    .eq('slug', roomSlug)
    .single()
  return (data as { id: string } | null)?.id ?? null
}

// ── Join ─────────────────────────────────────────────────────────────────────

export async function joinRoom(
  roomSlug: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const roomId = await getRoomId(supabase, roomSlug)
  if (!roomId) return { success: false, error: `Room not found: ${roomSlug}` }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('club_memberships').upsert(
    {
      user_id: user.id,
      room_id: roomId,
      status: 'active',
      role: 'member',
      joined_at: new Date().toISOString(),
      left_at: null,
    },
    { onConflict: 'user_id,room_id' },
  )

  if (error) {
    console.error('[joinRoom] upsert error:', error.message, error)
    return { success: false, error: error.message }
  }

  revalidatePath('/rooms')
  revalidatePath(`/rooms/${roomSlug}`)
  revalidatePath('/profile')
  revalidatePath('/', 'layout')

  return { success: true }
}

// ── Leave ─────────────────────────────────────────────────────────────────────

export async function leaveRoom(
  roomSlug: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const roomId = await getRoomId(supabase, roomSlug)
  if (!roomId) return { success: false, error: `Room not found: ${roomSlug}` }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('club_memberships')
    .update({ status: 'left', left_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('room_id', roomId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/rooms')
  revalidatePath(`/rooms/${roomSlug}`)
  revalidatePath('/profile')

  return { success: true }
}

// ── isRoomMember ─────────────────────────────────────────────────────────────

export async function isRoomMember(roomSlug: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const roomId = await getRoomId(supabase, roomSlug)
  if (!roomId) return false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('club_memberships')
    .select('status')
    .eq('user_id', user.id)
    .eq('room_id', roomId)
    .single()

  return (data as { status: string } | null)?.status === 'active'
}

// ── getMyMemberships ──────────────────────────────────────────────────────────

export async function getMyMemberships(): Promise<MembershipRow[]> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('club_memberships')
    .select('status, joined_at, role, room:rooms!room_id(slug,name)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  if (error || !data) return []

  return (data as Record<string, unknown>[]).map(row => {
    const room = row.room as { slug: string; name: string } | null
    return {
      roomSlug: room?.slug ?? '',
      roomName: room?.name ?? '',
      status: row.status as 'active' | 'left',
      joinedAt: row.joined_at as string,
      role: (row.role as string) ?? 'member',
    }
  })
}
