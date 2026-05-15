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
  return data?.id ?? null
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

  const { error } = await supabase.from('club_memberships').upsert(
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
  revalidatePath(`/room/${roomSlug}`)
  revalidatePath('/profile')

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

  const { error } = await supabase
    .from('club_memberships')
    .update({ status: 'left', left_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('room_id', roomId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/rooms')
  revalidatePath(`/rooms/${roomSlug}`)
  revalidatePath(`/room/${roomSlug}`)
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

  const { data } = await supabase
    .from('club_memberships')
    .select('status')
    .eq('user_id', user.id)
    .eq('room_id', roomId)
    .single()

  return data?.status === 'active'
}

// ── getMyMemberships ──────────────────────────────────────────────────────────

export async function getMyMemberships(): Promise<MembershipRow[]> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('club_memberships')
    .select('status, joined_at, role, room:rooms!room_id(slug,name)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  if (error || !data) return []

  return (data as unknown as Array<{
    status: 'active' | 'left'
    joined_at: string
    role: string
    room: { slug: string; name: string } | null
  }>).map(row => ({
    roomSlug: row.room?.slug ?? '',
    roomName: row.room?.name ?? '',
    status: row.status,
    joinedAt: row.joined_at,
    role: row.role ?? 'member',
  }))
}
