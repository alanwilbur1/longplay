'use server'

/**
 * lib/recommendations — Phase 4.2 server entry.
 *
 * One server action: getRecommendedRooms(limit?).
 *
 * Reads:
 *   - user_profiles.preferences.calibrationAnswers (set during onboarding)
 *   - favorite_artists.genres (when populated by streaming sync)
 *   - club_memberships (to exclude already-joined rooms)
 *   - rooms (Phase 4.2 taxonomy columns)
 *
 * Returns ranked rooms + grounded one-sentence explanations.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { rankRooms } from './scorer'
import { explainFactors } from './explainer'
import type {
  RecommendedRoom,
  RoomForRecommendation,
} from './types'

export type { RecommendedRoom } from './types'

export async function getRecommendedRooms(limit = 3): Promise<RecommendedRoom[]> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // 1. Listener calibration answers (stored in preferences JSONB).
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('preferences')
    .eq('id', user.id)
    .maybeSingle()

  const preferences = (profile?.preferences ?? {}) as {
    calibrationAnswers?: Record<string, string[]>
  }
  const calibrationAnswers = preferences.calibrationAnswers ?? {}

  // 2. Genres from the listener's favorite artists.
  const { data: favArtists } = await supabase
    .from('favorite_artists')
    .select('genres')
    .eq('user_id', user.id)
    .limit(50)
  const listenerGenres = Array.from(
    new Set(
      (favArtists ?? [])
        .flatMap((row: { genres: string[] | null }) => row.genres ?? [])
        .filter((g: string) => g.length > 0),
    ),
  )

  // 3. Slugs the listener has already joined.
  const { data: memberships } = await supabase
    .from('club_memberships')
    .select('rooms(slug)')
    .eq('user_id', user.id)
    .eq('status', 'active')
  const joinedRoomSlugs = (memberships ?? [])
    .map((m) => {
      const r = (m as unknown as { rooms?: { slug?: string } | { slug?: string }[] }).rooms
      const slugFromObj = Array.isArray(r) ? r[0]?.slug : r?.slug
      return slugFromObj ?? null
    })
    .filter((s): s is string => !!s)

  // 4. Candidate rooms — public only.
  const { data: rooms } = await supabase
    .from('rooms')
    .select(
      'id, slug, name, description, tagline, type, visibility, genres, moods, energy_level, cadence, featured, cover_art, recommendation_weight, member_count',
    )
    .eq('visibility', 'public')
    .order('recommendation_weight', { ascending: false })
    .limit(50)

  const candidates: RoomForRecommendation[] = (rooms ?? []).map((r) => {
    const row = r as unknown as Record<string, unknown>
    return {
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      description: String(row.description ?? ''),
      tagline: (row.tagline as string | null) ?? null,
      type: String(row.type ?? ''),
      visibility: String(row.visibility ?? ''),
      genres: (row.genres as string[] | null) ?? [],
      moods: (row.moods as string[] | null) ?? [],
      energy_level:
        (row.energy_level as 'low' | 'medium' | 'high' | null) ?? null,
      cadence:
        (row.cadence as
          | 'weekly'
          | 'biweekly'
          | 'monthly'
          | 'seasonal'
          | 'ongoing'
          | null) ?? null,
      featured: Boolean(row.featured),
      cover_art: (row.cover_art as string | null) ?? null,
      recommendation_weight: Number(row.recommendation_weight ?? 50),
      member_count: Number(row.member_count ?? 0),
    }
  })

  // 5. Rank + explain.
  const ranked = rankRooms(
    { calibrationAnswers, listenerGenres, joinedRoomSlugs, candidates },
    limit,
  )

  return ranked.map((r) => ({
    room: r.room,
    score: r.score,
    factors: r.factors,
    explanation: explainFactors(r.factors),
  }))
}
