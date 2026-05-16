/**
 * lib/data/moments.ts — Phase 3A server-side data helpers (hardened).
 * All helpers require an authenticated Supabase session via cookies.
 * Returns typed, stable output — safe to pass to Server Components as props.
 * No supabase `as any` casts — client is createServerClient<Database>.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import type { Moment, MomentType } from '@/lib/actions/moments'

// ── Internal helpers ───────────────────────────────────────────────────────────

type MomentRow = Database['public']['Tables']['moments']['Row']

function mapRow(row: MomentRow): Moment {
  return {
    id: row.id,
    memberId: row.member_id,
    type: row.type as MomentType,
    visibility: row.visibility as Moment['visibility'],
    albumId: row.album_id,
    content: row.content,
    trackId: row.track_id ?? null,
    timestampMs: row.timestamp_ms ?? null,
    cycleId: row.cycle_id ?? null,
    promptId: row.prompt_id ?? null,
    parentMomentId: row.parent_moment_id ?? null,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    createdLocalTime: row.created_local_time ?? null,
  }
}

// ── getMyArchiveMoments ───────────────────────────────────────────────────────
// All non-deleted moments for the current user, newest first.

export async function getMyArchiveMoments(): Promise<Moment[]> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('moments')
    .select('*')
    .eq('member_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[lib/data/moments.ts] getMyArchiveMoments failed:', error.message)
    }
    return []
  }

  return (data as MomentRow[]).map(mapRow)
}

// ── getMomentsByAlbumForCurrentUser ───────────────────────────────────────────

export async function getMomentsByAlbumForCurrentUser(albumId: string): Promise<Moment[]> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('moments')
    .select('*')
    .eq('member_id', user.id)
    .eq('album_id', albumId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[lib/data/moments.ts] getMomentsByAlbumForCurrentUser failed:', error.message)
    }
    return []
  }

  return (data as MomentRow[]).map(mapRow)
}

// ── getMomentBranchChain ──────────────────────────────────────────────────────
// Returns the full revision chain for a moment, from root to most recent branch.

export async function getMomentBranchChain(momentId: string): Promise<Moment[]> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const chain: Moment[] = []
  let currentId: string | null = momentId

  while (currentId) {
    const { data, error } = await supabase
      .from('moments')
      .select('*')
      .eq('id', currentId)
      .eq('member_id', user.id)
      .single()

    if (error || !data) break

    const moment = mapRow(data as MomentRow)
    chain.unshift(moment)
    currentId = moment.parentMomentId
  }

  return chain
}

// ── getCycleDiscussionMoments ─────────────────────────────────────────────────
// Returns non-deleted moments for a cycle. Owner-only until Phase 3B.

export async function getCycleDiscussionMoments(cycleId: string): Promise<Moment[]> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('moments')
    .select('*')
    .eq('cycle_id', cycleId)
    .eq('member_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[lib/data/moments.ts] getCycleDiscussionMoments failed:', error.message)
    }
    return []
  }

  return (data as MomentRow[]).map(mapRow)
}

// ── searchMyMoments ───────────────────────────────────────────────────────────
// Full-text content search across the current user's moments.

export async function searchMyMoments(query: string): Promise<Moment[]> {
  if (!query.trim()) return []

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('moments')
    .select('*')
    .eq('member_id', user.id)
    .is('deleted_at', null)
    .ilike('content', `%${query.trim()}%`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[lib/data/moments.ts] searchMyMoments failed:', error.message)
    }
    return []
  }

  return (data as MomentRow[]).map(mapRow)
}
