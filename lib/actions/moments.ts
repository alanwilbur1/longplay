'use server'

/**
 * lib/actions/moments.ts — Phase 3A server actions (hardened).
 *
 * Hardening applied (Phase 3A):
 * - Visibility gate: only 'private' accepted until Phase 3B.
 * - Duplicate protection for mark/save (per member+album+track+type).
 * - Content length cap: 8 000 chars.
 * - Deleted-moment safety: branchMoment and updateMomentVisibility reject deleted parents/targets.
 * - Visibility history write failure is now returned as an error.
 * - No supabase `as any` casts — client is createServerClient<Database>.
 * - Revalidation expanded to /archive/moments, /profile, /listening-life, /room layout.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Database } from '@/lib/supabase/types'
import { recordMomentCreated } from '@/lib/memory'

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

// ── Internal helpers ───────────────────────────────────────────────────────────

type MomentRow = Database['public']['Tables']['moments']['Row']

function mapRow(row: MomentRow): Moment {
  return {
    id: row.id,
    memberId: row.member_id,
    type: row.type as MomentType,
    visibility: row.visibility as MomentVisibility,
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

const MAX_CONTENT_LENGTH = 8000

function revalidateAll() {
  revalidatePath('/archive/moments')
  revalidatePath('/profile')
  revalidatePath('/listening-life')
  revalidatePath('/room', 'layout')
}

// ── createMoment ──────────────────────────────────────────────────────────────

export async function createMoment(
  input: CreateMomentInput,
): Promise<ActionResult<Moment>> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  // Visibility gate — Phase 3B
  const visibility = input.visibility ?? 'private'
  if (visibility !== 'private') {
    return { success: false, error: 'Visibility levels above private are not yet enabled.' }
  }

  // Content length cap
  if (input.content.length > MAX_CONTENT_LENGTH) {
    return { success: false, error: `Content must be ${MAX_CONTENT_LENGTH.toLocaleString()} characters or fewer.` }
  }

  // Duplicate protection for mark and save
  if (input.type === 'mark' || input.type === 'save') {
    let dupQuery = supabase
      .from('moments')
      .select('id')
      .eq('member_id', user.id)
      .eq('album_id', input.albumId)
      .eq('type', input.type)
      .is('deleted_at', null)

    if (input.type === 'mark' && input.trackId) {
      dupQuery = dupQuery.eq('track_id', input.trackId)
    }

    const { data: existing } = await dupQuery.limit(1)
    if (existing && existing.length > 0) {
      const label = input.type === 'mark' ? 'marked this' : 'saved this album'
      return { success: false, error: `You've already ${label}.` }
    }
  }

  const { data, error } = await supabase
    .from('moments')
    .insert({
      member_id: user.id,
      type: input.type,
      album_id: input.albumId,
      content: input.content,
      visibility,
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

  const created = mapRow(data)

  // Memory: record a moment_create participation event. Fire-and-forget;
  // a failure to write the event must never block the moment write.
  // Awaited only so the function doesn't return before the insert has
  // a chance to land — it's an inexpensive single INSERT.
  await recordMomentCreated({
    momentId: created.id,
    cycleId: created.cycleId,
    albumId: created.albumId,
    momentType: created.type,
  }).catch(() => {})

  revalidateAll()
  return { success: true, data: created }
}

// ── branchMoment ──────────────────────────────────────────────────────────────
// Creates a revision of the parent. The original is never modified.

export async function branchMoment(
  parentMomentId: string,
  input: CreateMomentInput,
): Promise<ActionResult<Moment>> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  // Visibility gate
  const visibility = input.visibility ?? 'private'
  if (visibility !== 'private') {
    return { success: false, error: 'Visibility levels above private are not yet enabled.' }
  }

  // Content length cap
  if (input.content.length > MAX_CONTENT_LENGTH) {
    return { success: false, error: `Content must be ${MAX_CONTENT_LENGTH.toLocaleString()} characters or fewer.` }
  }

  // Verify parent belongs to this user and is NOT deleted
  const { data: parent, error: parentError } = await supabase
    .from('moments')
    .select('id, member_id, album_id, type')
    .eq('id', parentMomentId)
    .eq('member_id', user.id)
    .is('deleted_at', null)
    .single()

  if (parentError || !parent) {
    return { success: false, error: 'Parent moment not found, deleted, or not owned by you' }
  }

  const { data, error } = await supabase
    .from('moments')
    .insert({
      member_id: user.id,
      type: input.type,
      album_id: input.albumId ?? parent.album_id,
      content: input.content,
      visibility,
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

  revalidateAll()
  return { success: true, data: mapRow(data) }
}

// ── updateMomentVisibility ────────────────────────────────────────────────────

export async function updateMomentVisibility(
  momentId: string,
  newVisibility: MomentVisibility,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  // Visibility gate — Phase 3B
  if (newVisibility !== 'private') {
    return { success: false, error: 'Visibility levels above private are not yet enabled.' }
  }

  // Fetch current — also rejects deleted moments
  const { data: current, error: fetchError } = await supabase
    .from('moments')
    .select('visibility, member_id')
    .eq('id', momentId)
    .eq('member_id', user.id)
    .is('deleted_at', null)
    .single()

  if (fetchError || !current) {
    return { success: false, error: 'Moment not found, deleted, or not owned by you' }
  }

  const previousVisibility = current.visibility as MomentVisibility

  // No-op guard — no history row written
  if (previousVisibility === newVisibility) {
    return { success: true }
  }

  const { error: updateError } = await supabase
    .from('moments')
    .update({ visibility: newVisibility, updated_at: new Date().toISOString() })
    .eq('id', momentId)
    .eq('member_id', user.id)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // Write visibility history — now treated as a required step
  const { error: historyError } = await supabase
    .from('moment_visibility_history')
    .insert({
      moment_id: momentId,
      previous_visibility: previousVisibility,
      new_visibility: newVisibility,
      changed_by: user.id,
    })

  if (historyError) {
    console.error('[updateMomentVisibility] history write failed:', historyError.message)
    return {
      success: false,
      error: `Visibility updated but audit log failed: ${historyError.message}`,
    }
  }

  revalidateAll()
  return { success: true }
}

// ── softDeleteMoment ──────────────────────────────────────────────────────────

export async function softDeleteMoment(momentId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('moments')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', momentId)
    .eq('member_id', user.id)
    .is('deleted_at', null)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidateAll()
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

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated', data: [] }

  // Build the query — Supabase v2 filter builder supports procedural chaining
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('moments')
    .select('*')
    .eq('member_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (filters.type) query = query.eq('type', filters.type)
  if (filters.albumId) query = query.eq('album_id', filters.albumId)
  if (filters.cycleId) query = query.eq('cycle_id', filters.cycleId)
  if (filters.limit) query = query.limit(filters.limit)
  if (filters.offset) query = query.range(
    filters.offset,
    filters.offset + (filters.limit ?? 50) - 1,
  )

  const { data, error } = await query

  if (error) {
    console.error('[listMyMoments] error:', error.message)
    return { success: false, error: error.message, data: [] }
  }

  return { success: true, data: (data as MomentRow[]).map(mapRow) }
}

// ── getMyMoment ───────────────────────────────────────────────────────────────

export async function getMyMoment(momentId: string): Promise<ActionResult<Moment>> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('moments')
    .select('*')
    .eq('id', momentId)
    .eq('member_id', user.id)
    .is('deleted_at', null)
    .single()

  if (error || !data) {
    return { success: false, error: 'Moment not found' }
  }

  return { success: true, data: mapRow(data as MomentRow) }
}
