/**
 * lib/recommendations/scorer.ts
 *
 * Heuristic room recommender — Phase 4.2.
 *
 * Transparent weighted overlap. No ML. The numbers are calibrated to
 * produce sensible orderings in the seeded catalog, not to be precise
 * — when real listening data lands (Phase 4.4 listening identity
 * graph) we'll tighten these against measured behaviour.
 */

import type {
  ExplanationFactor,
  RecommendationInput,
  RecommendedRoom,
  RoomForRecommendation,
} from './types'

// ── Weights (kept here so they're easy to tune) ───────────────────────────
const W_GENRE_PER_MATCH = 12
const W_MOOD_PER_MATCH = 10
const W_CONTEXT_PER_MATCH = 8       // calibration scenario → room mood hint
const W_ENERGY_MATCH = 6
const W_FEATURED_BOOST = 5
const W_FIRST_ROOM_FRIENDLY = 4     // bias toward public + editorial + active
const W_POPULAR_BONUS_CAP = 5       // capped contribution from member_count
const W_ROOM_WEIGHT_MULTIPLIER = 0.05  // recommendation_weight scales final

// ── Calibration → mood/scenario mapping ───────────────────────────────────
// Mirrors the calibration questions in components/onboarding-screen.tsx.
// Maps each option to the tags we expect to find on rooms.
const CALIBRATION_OPTION_TAGS: Record<string, string[]> = {
  // calibration-1: "When does music matter most to you?"
  'driving-night':         ['late-night', 'solo', 'reflective'],
  'walking-cities':        ['urban', 'restless', 'cinematic'],
  'morning-quiet':         ['ambient', 'quiet', 'meditative'],
  'after-midnight':        ['late-night', 'nocturnal', 'intimate'],
  'while-working':         ['focus', 'ambient', 'instrumental'],
  'emotional-overwhelm':   ['catharsis', 'intimate', 'reflective'],
  'close-friends':         ['communal', 'warm'],
  'traveling':             ['cinematic', 'restless', 'world'],
  // calibration-2: "What do you look for in a record?"
  atmosphere:              ['ambient', 'atmospheric', 'cinematic'],
  'emotional-honesty':     ['confessional', 'intimate', 'songwriter'],
  restraint:               ['minimal', 'patient', 'sparse'],
  transcendence:           ['spiritual', 'ambient', 'expansive'],
  texture:                 ['textural', 'experimental'],
  intimacy:                ['intimate', 'confessional', 'late-night'],
  ambiguity:               ['experimental', 'avant-garde'],
  warmth:                  ['warm', 'analog', 'songwriter'],
  // calibration-3: "How do you return to music?"
  'obsessive-replay':      ['album-focus', 'reflective'],
  'mood-drift':            ['ambient', 'atmospheric'],
  'context-discovery':     ['cinematic', 'editorial'],
  'memory-revisit':        ['reflective', 'nostalgic'],
  'emotional-precision':   ['confessional', 'intimate'],
  // calibration-4: "What kind of records stay with you?"
  'slow-reveal':           ['patient', 'minimal', 'ambient'],
  'life-periods':          ['reflective', 'nostalgic'],
  'emotional-distance':    ['restrained', 'minimal'],
  cinematic:               ['cinematic', 'atmospheric'],
  places:                  ['ambient', 'world', 'atmospheric'],
  nocturnal:               ['late-night', 'nocturnal', 'intimate'],
  fragile:                 ['intimate', 'confessional', 'sparse'],
  expansive:               ['expansive', 'ambient', 'spiritual'],
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

function lowerSet(items: string[]): Set<string> {
  return new Set(items.map((s) => s.toLowerCase()))
}

function overlap(a: string[], b: Set<string>): string[] {
  return a.filter((x) => b.has(x.toLowerCase()))
}

// Derive a flat scenario-tag set from calibration answers.
function scenarioTagsFromAnswers(answers: Record<string, string[]>): string[] {
  const out: string[] = []
  for (const stepAnswers of Object.values(answers ?? {})) {
    if (!Array.isArray(stepAnswers)) continue
    for (const opt of stepAnswers) {
      const tags = CALIBRATION_OPTION_TAGS[opt]
      if (tags) out.push(...tags)
    }
  }
  return unique(out)
}

// Crude listener energy preference from calibration.
function listenerEnergyFromAnswers(
  answers: Record<string, string[]>,
): 'low' | 'medium' | 'high' | null {
  const flat = Object.values(answers ?? {}).flat()
  const low = ['morning-quiet', 'after-midnight', 'restraint', 'slow-reveal', 'fragile', 'nocturnal']
  const high = ['close-friends', 'expansive', 'transcendence', 'cinematic']
  const isLow = flat.some((a) => low.includes(a))
  const isHigh = flat.some((a) => high.includes(a))
  if (isLow && !isHigh) return 'low'
  if (isHigh && !isLow) return 'high'
  if (isLow || isHigh) return 'medium'
  return null
}

function scoreRoom(
  room: RoomForRecommendation,
  input: RecommendationInput,
  scenarioTags: string[],
  listenerEnergy: 'low' | 'medium' | 'high' | null,
): { score: number; factors: ExplanationFactor[] } {
  const factors: ExplanationFactor[] = []
  let score = 0

  // 1. Genre overlap (listener favorites ↔ room.genres)
  if (input.listenerGenres.length > 0 && room.genres.length > 0) {
    const roomGenres = lowerSet(room.genres)
    const matches = overlap(input.listenerGenres, roomGenres)
    if (matches.length > 0) {
      const w = matches.length * W_GENRE_PER_MATCH
      score += w
      factors.push({
        kind: 'genre-match',
        weight: w,
        detail: matches.slice(0, 3).join(', '),
      })
    }
  }

  // 2. Mood overlap (room.moods ↔ scenario tags)
  if (room.moods.length > 0 && scenarioTags.length > 0) {
    const scenarioSet = lowerSet(scenarioTags)
    const matches = overlap(room.moods, scenarioSet)
    if (matches.length > 0) {
      const w = matches.length * W_MOOD_PER_MATCH
      score += w
      factors.push({
        kind: 'mood-match',
        weight: w,
        detail: matches.slice(0, 3).join(', '),
      })
    }
  }

  // 3. Context-tag overlap (broader: any room.genres also matching the
  //    scenario tag set — e.g. a "late-night" room genre matches a
  //    "late-night" scenario tag).
  if (room.genres.length > 0 && scenarioTags.length > 0) {
    const scenarioSet = lowerSet(scenarioTags)
    const matches = overlap(room.genres, scenarioSet)
    if (matches.length > 0) {
      const w = matches.length * W_CONTEXT_PER_MATCH
      score += w
      factors.push({
        kind: 'context-match',
        weight: w,
        detail: matches.slice(0, 3).join(', '),
      })
    }
  }

  // 4. Energy match
  if (room.energy_level && listenerEnergy && room.energy_level === listenerEnergy) {
    score += W_ENERGY_MATCH
    factors.push({
      kind: 'energy-match',
      weight: W_ENERGY_MATCH,
      detail: `${listenerEnergy}-energy`,
    })
  }

  // 5. Featured boost (small additive)
  if (room.featured) {
    score += W_FEATURED_BOOST
    factors.push({
      kind: 'featured',
      weight: W_FEATURED_BOOST,
      detail: 'featured by curators',
    })
  }

  // 6. First-room-friendly: public + editorial + has an active cycle
  if (
    room.visibility === 'public' &&
    (room.type === 'editorial' || room.type === 'community')
  ) {
    score += W_FIRST_ROOM_FRIENDLY
    factors.push({
      kind: 'first-room-friendly',
      weight: W_FIRST_ROOM_FRIENDLY,
      detail: 'active and album-focused',
    })
  }

  // 7. Popularity (capped — never the dominant factor)
  if (room.member_count > 0) {
    const popularity = Math.min(W_POPULAR_BONUS_CAP, Math.log10(room.member_count + 1) * 2)
    if (popularity >= 1) {
      score += popularity
      factors.push({
        kind: 'popular',
        weight: popularity,
        detail: `${room.member_count} listeners`,
      })
    }
  }

  // 8. Curator-set weight multiplier (room.recommendation_weight 0..100)
  // A weight of 50 is neutral. Scale the whole score by ±25%.
  const multiplier = 1 + (room.recommendation_weight - 50) * W_ROOM_WEIGHT_MULTIPLIER * 0.01
  score *= multiplier

  return { score, factors }
}

/**
 * Rank the candidate rooms for the listener.
 *
 * Returns the top N rooms with score + structured factors. The
 * explainer turns factors into a sentence.
 */
export function rankRooms(
  input: RecommendationInput,
  limit = 3,
): Array<{ room: RoomForRecommendation; score: number; factors: ExplanationFactor[] }> {
  const scenarioTags = scenarioTagsFromAnswers(input.calibrationAnswers)
  const listenerEnergy = listenerEnergyFromAnswers(input.calibrationAnswers)
  const joined = new Set(input.joinedRoomSlugs)

  const scored = input.candidates
    .filter((r) => !joined.has(r.slug))
    .filter((r) => r.visibility === 'public') // recommend only discoverable rooms
    .map((room) => ({ room, ...scoreRoom(room, input, scenarioTags, listenerEnergy) }))

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // tie-break: featured first, then popularity
    if (a.room.featured !== b.room.featured) return a.room.featured ? -1 : 1
    return b.room.member_count - a.room.member_count
  })

  return scored.slice(0, limit)
}
