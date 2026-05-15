/**
 * lib/data/moments.ts
 *
 * Server-side data helpers for the Moment system (Phase 3A).
 * All helpers require an authenticated Supabase session via cookies.
 * Returns typed, stable output — safe to pass to Server Components as props.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Moment, MomentType } from '@/lib/actions/moments'

// ── Internal row mapper ────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): Moment {
  return {
    id: row.id as string,
    memberId: row.member_id as string,
    type: row.type as MomentType,
    visibility: row.visibility as Moment['visibility'],
    albumId: row.album_id as string,
    content: row.content as string,
    trackId: (row.track_id as string | null) ?? null,
    timestampMs: (row.timestamp_ms as number | null) ?? null,
    cycleId: (row.cycle_id as string | null) ?? null,
    promptId: (row.prompt_id as string | null) ?? null,
    parentMomentId: (row.parent_moment_id as string | null) ?? null,
    deletedAt: (row.deleted_at as string | null) ?? null,
    createdAt: row.created_at as string,
    createdLocalTime: (row.created_local_time as string | null) ?? null,
  }
}

// ── getMyArchiveMoments ───────────────────────────────────────────────────────
// All non-deleted moments for the current user, newest first.

export async function getMyArchiveMoments(): Promise<Moment[]> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await (supabase as any)
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

  return (data as Record<string, unknown>[]).map(mapRow)
}

// ── getMomentsByAlbumForCurrentUser ───────────────────────────────────────────

export async function getMomentsByAlbumForCurrentUser(albumId: string): Promise<Moment[]> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await (supabase as any)
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

  return (data as Record<string, unknown>[]).map(mapRow)
}

// ── getMomentBranchChain ──────────────────────────────────────────────────────
// Returns the full revision chain for a moment, from root to most recent branch.

export async function getMomentBranchChain(momentId: string): Promise<Moment[]> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Walk up to the root (follow parent_moment_id chain)
  const chain: Moment[] = []
  let currentId: string | null = momentId

  while (currentId) {
    const { data, error } = await (supabase as any)
      .from('moments')
      .select('*')
      .eq('id', currentId)
      .eq('member_id', user.id)
      .single()

    if (error || !data) break

    const moment = mapRow(data as Record<string, unknown>)
    chain.unshift(moment) // prepend to get root-first order
    currentId = moment.parentMomentId
  }

  return chain
}

// ── getCycleDiscussionMoments ─────────────────────────────────────────────────
// Returns non-deleted moments for a cycle visible to the current user.
// NOTE: Club-visibility gating is deferred to Phase 3B (see schema note).
// Currently returns only the current user's own moments for the cycle.

export async function getCycleDiscussionMoments(cycleId: string): Promise<Moment[]> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await (supabase as any)
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

  return (data as Record<string, unknown>[]).map(mapRow)
}

// ── searchMyMoments ───────────────────────────────────────────────────────────
// Full-text content search across the current user's moments.

export async function searchMyMoments(query: string): Promise<Moment[]> {
  if (!query.trim()) return []

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await (supabase as any)
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

  return (data as Record<string, unknown>[]).map(mapRow)
}
