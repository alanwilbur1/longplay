'use server'

/**
 * lib/actions/moments.ts
 *
 * Server actions for the Moment system (Phase 3A).
 *
 * Design rules:
 * - No in-place content editing. A revision = new Moment with parent_moment_id.
 * - Visibility changes always write to moment_visibility_history.
 * - All mutations require an authenticated Supabase user.
 * - Users can only mutate their own Moments.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── Types ─────────────────────────────────────────────────────────────────────

export type MomentType =
  | 'mark'
  | 'annotation'
  | 'reflection'
  | 'prompt_response'
  | 'rating'
  | 'reply'
  | 'save'

export type MomentVisibility = 'private' | 'club' | 'connection' | 'public'

export interface Moment {
  id: string
  memberId: string
  type: MomentType
  visibility: MomentVisibility
  albumId: string
  content: string
  trackId: string | null
  timestampMs: number | null
  cycleId: string | null
  promptId: string | null
  parentMomentId: string | null
  deletedAt: string | null
  createdAt: string
  createdLocalTime: string | null
}

export interface CreateMomentInput {
  type: MomentType
  albumId: string
  content: string
  trackId?: string | null
  timestampMs?: number | null
  cycleId?: string | null
  promptId?: string | null
  visibility?: MomentVisibility
  createdLocalTime?: string | null
}

export interface ActionResult<T = null> {
  success: boolean
  data?: T
  error?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): Moment {
  return {
    id: row.id as string,
    memberId: row.member_id as string,
    type: row.type as MomentType,
    visibility: row.visibility as MomentVisibility,
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

// ── createMoment ──────────────────────────────────────────────────────────────

export async function createMoment(
  input: CreateMomentInput,
): Promise<ActionResult<Moment>> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await (supabase as any)
    .from('moments')
    .insert({
      member_id: user.id,
      type: input.type,
      album_id: input.albumId,
      content: input.content,
      visibility: input.visibility ?? 'private',
      track_id: input.trackId ?? null,
      timestamp_ms: input.timestampMs ?? null,
      cycle_id: input.cycleId ?? null,
      prompt_id: input.promptId ?? null,
      created_local_time: input.createdLocalTime ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[createMoment] error:', error.message)
    return { success: false, error: error.message }
  }

  revalidatePath('/archive/moments')

  return { success: true, data: mapRow(data as Record<string, unknown>) }
}

// ── branchMoment ──────────────────────────────────────────────────────────────
// Creates a new Moment that revises the parent. The original is never modified.

export async function branchMoment(
  parentMomentId: string,
  input: CreateMomentInput,
): Promise<ActionResult<Moment>> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  // Verify the parent belongs to this user
  const { data: parent, error: parentError } = await (supabase as any)
    .from('moments')
    .select('id, member_id, album_id, type')
    .eq('id', parentMomentId)
    .eq('member_id', user.id)
    .single()

  if (parentError || !parent) {
    return { success: false, error: 'Parent moment not found or not owned by you' }
  }

  const { data, error } = await (supabase as any)
    .from('moments')
    .insert({
      member_id: user.id,
      type: input.type,
      album_id: input.albumId ?? (parent as Record<string, unknown>).album_id,
      content: input.content,
      visibility: input.visibility ?? 'private',
      track_id: input.trackId ?? null,
      timestamp_ms: input.timestampMs ?? null,
      cycle_id: input.cycleId ?? null,
      prompt_id: input.promptId ?? null,
      parent_moment_id: parentMomentId,
      created_local_time: input.createdLocalTime ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[branchMoment] error:', error.message)
    return { success: false, error: error.message }
  }

  revalidatePath('/archive/moments')

  return { success: true, data: mapRow(data as Record<string, unknown>) }
}

// ── updateMomentVisibility ────────────────────────────────────────────────────

export async function updateMomentVisibility(
  momentId: string,
  newVisibility: MomentVisibility,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  // Fetch current visibility to record history
  const { data: current, error: fetchError } = await (supabase as any)
    .from('moments')
    .select('visibility, member_id')
    .eq('id', momentId)
    .eq('member_id', user.id)
    .single()

  if (fetchError || !current) {
    return { success: false, error: 'Moment not found or not owned by you' }
  }

  const previousVisibility = (current as Record<string, unknown>).visibility as MomentVisibility

  if (previousVisibility === newVisibility) {
    return { success: true }
  }

  // Update visibility
  const { error: updateError } = await (supabase as any)
    .from('moments')
    .update({ visibility: newVisibility, updated_at: new Date().toISOString() })
    .eq('id', momentId)
    .eq('member_id', user.id)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Write visibility history
  const { error: historyError } = await (supabase as any)
    .from('moment_visibility_history')
    .insert({
      moment_id: momentId,
      previous_visibility: previousVisibility,
      new_visibility: newVisibility,
      changed_by: user.id,
    })

  if (historyError) {
    console.error('[updateMomentVisibility] history write failed:', historyError.message)
    // Non-fatal: the update succeeded; log the failure
  }

  revalidatePath('/archive/moments')

  return { success: true }
}

// ── softDeleteMoment ──────────────────────────────────────────────────────────

export async function softDeleteMoment(momentId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const { error } = await (supabase as any)
    .from('moments')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', momentId)
    .eq('member_id', user.id)
    .is('deleted_at', null)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/archive/moments')

  return { success: true }
}

// ── listMyMoments ─────────────────────────────────────────────────────────────

export interface ListMomentsFilter {
  type?: MomentType
  albumId?: string
  cycleId?: string
  limit?: number
  offset?: number
}

export async function listMyMoments(
  filters: ListMomentsFilter = {},
): Promise<ActionResult<Moment[]>> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated', data: [] }

  let query = (supabase as any)
    .from('moments')
    .select('*')
    .eq('member_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (filters.type) query = query.eq('type', filters.type)
  if (filters.albumId) query = query.eq('album_id', filters.albumId)
  if (filters.cycleId) query = query.eq('cycle_id', filters.cycleId)
  if (filters.limit) query = query.limit(filters.limit)
  if (filters.offset) query = query.range(filters.offset, (filters.offset ?? 0) + (filters.limit ?? 50) - 1)

  const { data, error } = await query

  if (error) {
    console.error('[listMyMoments] error:', error.message)
    return { success: false, error: error.message, data: [] }
  }

  return {
    success: true,
    data: (data as Record<string, unknown>[]).map(mapRow),
  }
}

// ── getMyMoment ───────────────────────────────────────────────────────────────

export async function getMyMoment(momentId: string): Promise<ActionResult<Moment>> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await (supabase as any)
    .from('moments')
    .select('*')
    .eq('id', momentId)
    .eq('member_id', user.id)
    .is('deleted_at', null)
    .single()

  if (error || !data) {
    return { success: false, error: 'Moment not found' }
  }

  return { success: true, data: mapRow(data as Record<string, unknown>) }
}
