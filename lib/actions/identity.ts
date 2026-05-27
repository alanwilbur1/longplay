'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * lib/actions/identity.ts — Phase 6A.7
 *
 * Frontend-facing reader for the Layer 5 identity substrate. Cookie-
 * aware: every call resolves the calling user's identity via the
 * session, then queries listener_identity_traits +
 * listener_archetype_snapshots through RLS (owner-self-select).
 *
 * Stable envelope shape so components don't have to handle two
 * separate shapes — the action returns either a populated identity
 * record or a `state: 'forming'` placeholder when the user has no
 * archetype data yet. Components branch on `state`.
 *
 * No interpretation in this layer — just a shape transform from the
 * two DB tables into a single envelope. All copy / band-to-text
 * mapping lives in lib/identity/presentation.ts (pure helpers used
 * by the components that render this envelope).
 */

import type { TraitBand, TraitKey } from '@/lib/identity/traits'

export interface IdentityTrait {
  trait_key: TraitKey
  trait_score: number | null
  trait_band: TraitBand
  contributing_factors: Record<string, unknown>
}

export interface IdentitySupportingRoom {
  room_id: string
  slug: string | null
  name: string | null
  score: number
}

export interface IdentitySupportingGenre {
  genre: string
  weighted_score: number
}

export interface IdentitySupportingTrait {
  trait_key: TraitKey
  trait_score: number
  contribution: number
}

export interface IdentityArchetype {
  archetype_key: string
  archetype_label: string
  confidence_score: number
  rank: number
  supporting_traits: IdentitySupportingTrait[]
  supporting_rooms: IdentitySupportingRoom[]
  supporting_genres: IdentitySupportingGenre[]
}

export type IdentityEnvelope =
  | {
      state: 'unauthenticated'
    }
  | {
      state: 'forming'
      /** Whether the user has at least connected a listening source.
       *  Drives the fallback copy: "still listening" vs "connect spotify". */
      has_connection: boolean
      /** Whether we have at least one trait row, even if no archetype
       *  cleared the confidence threshold. Some users land here when
       *  data is too thin to confidently match an archetype. */
      has_partial_traits: boolean
    }
  | {
      state: 'ready'
      user_id: string
      primary: IdentityArchetype
      alternates: IdentityArchetype[]
      traits: IdentityTrait[]
      /** From either archetype row or first trait row — same recompute
       *  cycle writes both. UI uses this for the freshness footer. */
      computed_at: string | null
      algorithm_version: string
    }

/**
 * Read the calling user's full identity envelope. Cookie-aware — no
 * userId parameter; the action resolves it from the session.
 */
export async function readMyListenerIdentity(): Promise<IdentityEnvelope> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { state: 'unauthenticated' }
  }
  const userId = user.id

  const [archetypesRes, traitsRes, connectionRes] = await Promise.all([
    supabase
      .from('listener_archetype_snapshots')
      .select(
        'archetype_key, archetype_label, confidence_score, rank, supporting_traits, supporting_rooms, supporting_genres, computed_at, algorithm_version',
      )
      .eq('user_id', userId)
      .order('rank', { ascending: true }),
    supabase
      .from('listener_identity_traits')
      .select(
        'trait_key, trait_score, trait_band, contributing_factors, computed_at, algorithm_version',
      )
      .eq('user_id', userId),
    supabase
      .from('listening_connections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active'),
  ])

  type ArchetypeRow = {
    archetype_key: string
    archetype_label: string
    confidence_score: number
    rank: number
    supporting_traits: unknown
    supporting_rooms: unknown
    supporting_genres: unknown
    computed_at: string | null
    algorithm_version: string
  }
  type TraitRow = {
    trait_key: string
    trait_score: number | null
    trait_band: string | null
    contributing_factors: unknown
    computed_at: string | null
    algorithm_version: string
  }

  const archetypeRows = (archetypesRes.data ?? []) as unknown as ArchetypeRow[]
  const traitRows = (traitsRes.data ?? []) as unknown as TraitRow[]
  const hasConnection = (connectionRes.count ?? 0) > 0

  if (archetypeRows.length === 0) {
    return {
      state: 'forming',
      has_connection: hasConnection,
      has_partial_traits: traitRows.length > 0,
    }
  }

  // Sort defensively — DB ORDER BY should already do this, but a
  // pure projection that depends on rank-1 being first is too brittle
  // not to defend.
  archetypeRows.sort((a, b) => a.rank - b.rank)
  const primaryRow = archetypeRows[0]
  const alternateRows = archetypeRows.slice(1)

  const mapArchetype = (row: ArchetypeRow): IdentityArchetype => ({
    archetype_key: row.archetype_key,
    archetype_label: row.archetype_label,
    confidence_score: row.confidence_score,
    rank: row.rank,
    supporting_traits: (row.supporting_traits as IdentitySupportingTrait[]) ?? [],
    supporting_rooms: (row.supporting_rooms as IdentitySupportingRoom[]) ?? [],
    supporting_genres:
      (row.supporting_genres as IdentitySupportingGenre[]) ?? [],
  })

  const traits: IdentityTrait[] = traitRows.map((r) => ({
    trait_key: r.trait_key as TraitKey,
    trait_score: r.trait_score,
    trait_band: (r.trait_band as TraitBand) ?? 'unknown',
    contributing_factors:
      (r.contributing_factors as Record<string, unknown>) ?? {},
  }))

  return {
    state: 'ready',
    user_id: userId,
    primary: mapArchetype(primaryRow),
    alternates: alternateRows.map(mapArchetype),
    traits,
    computed_at: primaryRow.computed_at,
    algorithm_version: primaryRow.algorithm_version,
  }
}
