'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { DriftSummary } from '@/lib/identity/drift'

/**
 * lib/actions/identity-history.ts — Phase 6A.9
 *
 * Cookie-aware reader for the listener_identity_history table.
 * Returns the user's timeline in reverse-chronological order so
 * UI can render "Now → recent past → further back".
 *
 * Returns a discriminated-union envelope (matches the Phase 6A.7
 * pattern):
 *   - { state: 'unauthenticated' }
 *   - { state: 'empty' }            — no history rows yet
 *   - { state: 'ready', entries }   — rows ordered newest-first
 *
 * Default limit is 20 — enough to cover a multi-year timeline at
 * the ~weekly cadence the append rules produce, without making the
 * envelope unwieldy.
 */

export interface IdentityHistoryEntry {
  id: string
  snapshot_at: string
  algorithm_version: string
  primary_archetype_key: string | null
  primary_archetype_label: string | null
  primary_confidence: number | null
  archetypes: unknown
  trait_snapshot: unknown
  top_genres: unknown
  top_rooms: unknown
  drift_summary: DriftSummary | null
  created_at: string
}

export type IdentityHistoryEnvelope =
  | { state: 'unauthenticated' }
  | { state: 'empty' }
  | { state: 'ready'; entries: IdentityHistoryEntry[] }

export async function readMyIdentityHistory(
  limit = 20,
): Promise<IdentityHistoryEnvelope> {
  const cap = Math.max(1, Math.min(limit, 200))
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { state: 'unauthenticated' }

  const { data, error } = await supabase
    .from('listener_identity_history')
    .select(
      'id, snapshot_at, algorithm_version, primary_archetype_key, primary_archetype_label, primary_confidence, archetypes, trait_snapshot, top_genres, top_rooms, drift_summary, created_at',
    )
    .eq('user_id', user.id)
    .order('snapshot_at', { ascending: false })
    .limit(cap)
  if (error || !data || data.length === 0) {
    return { state: 'empty' }
  }
  return {
    state: 'ready',
    entries: data as unknown as IdentityHistoryEntry[],
  }
}
