/**
 * lib/recommendations/scorer.ts
 *
 * Heuristic room recommender — v2.1.
 *
 * Transparent weighted overlap with provenance-aware genre weighting,
 * an explicit affinity tag factor, current-album artist overlap, a
 * recency boost, and a post-scoring MMR-style diversity penalty.
 *
 * No ML. No embeddings. Every factor and weight is grep-able in this
 * file and explainable to a listener.
 */

import {
  SCORE_VERSION,
  type ExplanationFactor,
  type RecommendationInput,
  type RoomForRecommendation,
} from './types'

export { SCORE_VERSION }

// ── Per-match factor weights ─────────────────────────────────────────────
//
// Canonical genres come from Spotify (via the listening profile
// snapshot). They're the trusted source — when Spotify says an artist
// is "indie folk" we treat that as ground truth.
//
// Enriched genres come from Last.fm via the artist_genre_enrichments
// table. Last.fm tags are user-generated and noisier — useful as
// signal-of-last-resort when Spotify returns nothing, but not
// equivalent in confidence. Half-weight reflects that gap.
const W_CANONICAL_GENRE_PER_MATCH = 12
const W_ENRICHED_GENRE_PER_MATCH = 6

// Affinity tags are derived deterministically from the listener's
// top genres + density signals during the snapshot recompute. First
// class because they encode listening *posture* (e.g. "album-listener",
// "intimate", "spiritual") rather than literal genre — and posture
// matches well against room.moods, which encode the same.
const W_AFFINITY_TAG_PER_MATCH = 9

// Artist-match is the strongest single overlap signal we have, but
// it intentionally does NOT eclipse the combined-genre signal: three
// or more canonical genre matches will still outscore one artist
// match, which keeps lone-artist-fan results from dominating.
const W_ARTIST_PER_MATCH = 12

// Recency boost is *conservative*: a flat +4 only, gated on density
// AND the room having any genre overlap with the listener at all.
// We don't scale per overlapping genre yet — that would double-count
// the canonical / enriched factors and inflate ambient-only rooms
// for a listener who's been ambient-heavy for a single week.
const W_RECENCY_BOOST = 4

// Existing factors (unchanged from Phase 4.2).
const W_MOOD_PER_MATCH = 10
const W_CONTEXT_PER_MATCH = 8
const W_ENERGY_MATCH = 6
const W_FEATURED_BOOST = 5
const W_FIRST_ROOM_FRIENDLY = 4
const W_POPULAR_BONUS_CAP = 5
const W_ROOM_WEIGHT_MULTIPLIER = 0.05

// ── Diversity (MMR-style, applied after scoring) ─────────────────────────
//
// Top-3 recommendations can collapse to one genre when the listener
// skews heavily. λ=8 is calibrated so that a fully overlapping
// candidate (Jaccard=1 on genres∪moods) loses 8 points — strong
// enough to break up an ambient-only run; weak enough that a
// genuinely strong second match (e.g. 3 canonical genre overlaps =
// 36 points) still wins comfortably.
//
// CRITICAL invariant: penalty is computed against ALREADY-PICKED
// rooms, never against unscored candidates. The #1 pick is therefore
// always penalty=0 — the highest-scoring room before diversification.
const LAMBDA_DIVERSITY = 8

// ── Calibration → mood/scenario mapping ──────────────────────────────────
// Mirrors the calibration questions in components/onboarding-screen.tsx.
// PRESERVED VERBATIM from Phase 4.2 — per the phase contract this
// mapping is not modified.
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

/** Flatten calibration answers → scenario tag list. */
export function scenarioTagsFromAnswers(answers: Record<string, string[]>): string[] {
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

/** Crude listener energy preference from calibration. */
export function listenerEnergyFromAnswers(
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

/** Lowercase exact match: each listener artist name compared to the
 *  room's current-cycle album.artist. Multi-artist credits stored as
 *  "A, B" get matched only when the listener's name equals the whole
 *  field — deliberately strict to avoid fuzzy false-positives on
 *  short names ("Air" matching "Airbag"). */
function artistMatches(
  listenerNames: string[],
  albumArtist: string | null | undefined,
): string[] {
  if (!albumArtist) return []
  const target = albumArtist.toLowerCase().trim()
  if (!target) return []
  const matched: string[] = []
  for (const name of listenerNames) {
    if (!name) continue
    if (name.toLowerCase().trim() === target) matched.push(name)
  }
  return matched
}

interface ScoredCandidate {
  room: RoomForRecommendation
  score: number
  factors: ExplanationFactor[]
}

function scoreRoom(
  room: RoomForRecommendation,
  input: RecommendationInput,
  scenarioTags: string[],
  listenerEnergy: 'low' | 'medium' | 'high' | null,
): ScoredCandidate {
  const factors: ExplanationFactor[] = []
  let score = 0
  let anyGenreMatched = false

  // ── 1. Canonical genre overlap (Spotify-origin, full weight) ─────────
  if (input.canonicalGenres.length > 0 && room.genres.length > 0) {
    const roomGenres = lowerSet(room.genres)
    const matches = overlap(input.canonicalGenres, roomGenres)
    if (matches.length > 0) {
      const w = matches.length * W_CANONICAL_GENRE_PER_MATCH
      score += w
      anyGenreMatched = true
      factors.push({
        kind: 'canonical-genre-match',
        weight: w,
        detail: matches.slice(0, 3).join(', '),
      })
    }
  }

  // ── 2. Enriched genre overlap (Last.fm-origin, half weight) ──────────
  // Excludes anything already counted under canonical so a genre
  // present in both columns contributes ONCE at the canonical rate.
  if (input.enrichedGenres.length > 0 && room.genres.length > 0) {
    const canonicalLower = lowerSet(input.canonicalGenres)
    const enrichedOnly = input.enrichedGenres.filter(
      (g) => !canonicalLower.has(g.toLowerCase()),
    )
    if (enrichedOnly.length > 0) {
      const roomGenres = lowerSet(room.genres)
      const matches = overlap(enrichedOnly, roomGenres)
      if (matches.length > 0) {
        const w = matches.length * W_ENRICHED_GENRE_PER_MATCH
        score += w
        anyGenreMatched = true
        factors.push({
          kind: 'enriched-genre-match',
          weight: w,
          detail: matches.slice(0, 3).join(', '),
        })
      }
    }
  }

  // ── 3. Affinity tag overlap (first-class — no longer routed
  //      through the synthetic 'snapshot' calibration step). ─────────────
  if (input.affinityTags.length > 0 && room.moods.length > 0) {
    const roomMoods = lowerSet(room.moods)
    const matches = overlap(input.affinityTags, roomMoods)
    if (matches.length > 0) {
      const w = matches.length * W_AFFINITY_TAG_PER_MATCH
      score += w
      factors.push({
        kind: 'affinity-tag-match',
        weight: w,
        detail: matches.slice(0, 3).join(', '),
      })
    }
  }

  // ── 4. Artist match (room's current cycle album artist ↔ listener
  //      top artists). Exact lowercase equality. ─────────────────────────
  if (input.topArtistNames.length > 0 && room.currentAlbumArtist) {
    const matched = artistMatches(input.topArtistNames, room.currentAlbumArtist)
    if (matched.length > 0) {
      const w = matched.length * W_ARTIST_PER_MATCH
      score += w
      factors.push({
        kind: 'artist-match',
        weight: w,
        detail: matched.slice(0, 2).join(', '),
      })
    }
  }

  // ── 5. Mood overlap (room.moods ↔ scenario tags) ─────────────────────
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

  // ── 6. Context-tag overlap (room.genres ↔ scenario tags) ─────────────
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

  // ── 7. Energy match ──────────────────────────────────────────────────
  if (room.energy_level && listenerEnergy && room.energy_level === listenerEnergy) {
    score += W_ENERGY_MATCH
    factors.push({
      kind: 'energy-match',
      weight: W_ENERGY_MATCH,
      detail: `${listenerEnergy}-energy`,
    })
  }

  // ── 8. Featured boost ────────────────────────────────────────────────
  if (room.featured) {
    score += W_FEATURED_BOOST
    factors.push({
      kind: 'featured',
      weight: W_FEATURED_BOOST,
      detail: 'featured by curators',
    })
  }

  // ── 9. First-room-friendly ───────────────────────────────────────────
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

  // ── 10. Popularity (capped) ──────────────────────────────────────────
  if (room.member_count > 0) {
    const popularity = Math.min(
      W_POPULAR_BONUS_CAP,
      Math.log10(room.member_count + 1) * 2,
    )
    if (popularity >= 1) {
      score += popularity
      factors.push({
        kind: 'popular',
        weight: popularity,
        detail: `${room.member_count} listeners`,
      })
    }
  }

  // ── 11. Recency boost — flat +4, gated on density + any genre
  //       overlap. Conservative on purpose: we don't yet trust
  //       per-genre scaling because a single recent-heavy week could
  //       inflate one genre disproportionately. Revisit when there's
  //       multi-week recent_density history to smooth against. ─────────
  if (
    (input.recentDensity === 'medium' || input.recentDensity === 'high') &&
    anyGenreMatched
  ) {
    score += W_RECENCY_BOOST
    factors.push({
      kind: 'recency-boost',
      weight: W_RECENCY_BOOST,
      detail: `recent listening is ${input.recentDensity}`,
    })
  }

  // ── 12. Curator-set weight multiplier ────────────────────────────────
  // (room.recommendation_weight 0..100; 50 is neutral; ±25% range.)
  // Semantics PRESERVED from Phase 4.2 per the phase contract.
  const multiplier =
    1 + (room.recommendation_weight - 50) * W_ROOM_WEIGHT_MULTIPLIER * 0.01
  score *= multiplier

  return { room, score, factors }
}

/** Signature of a room for diversity comparison — genres ∪ moods,
 *  lowercased. Two rooms with identical signatures get max penalty. */
function roomSignature(room: RoomForRecommendation): Set<string> {
  const sig = new Set<string>()
  for (const g of room.genres) sig.add(g.toLowerCase())
  for (const m of room.moods) sig.add(m.toLowerCase())
  return sig
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersect = 0
  for (const x of a) if (b.has(x)) intersect += 1
  const union = a.size + b.size - intersect
  return union === 0 ? 0 : intersect / union
}

/** v2.1 ranked result with diversity bookkeeping. */
export interface RankedRoom {
  room: RoomForRecommendation
  /** Final score AFTER diversity penalty. */
  score: number
  /** Pre-diversity score (= raw score from scoreRoom * multiplier). */
  score_pre_diversity: number
  /** Diversity deduction (≥ 0). 0 for the #1 pick by invariant. */
  diversity_penalty: number
  factors: ExplanationFactor[]
}

/**
 * Rank the candidate rooms for the listener.
 *
 *   1. Score every candidate via scoreRoom() (full v2.1 factor set).
 *   2. Sort by raw score (with featured / member_count tie-breaks).
 *   3. Greedy MMR diversification (λ=8):
 *        - #1 pick: highest raw score, penalty=0 (invariant).
 *        - subsequent picks: choose the candidate that maximizes
 *          (score − λ × max_jaccard_to_already_picked).
 *        - max_jaccard considers room.genres ∪ room.moods signatures.
 *
 *  Determinism: stable tie-break order ensures identical inputs
 *  produce identical outputs across deploys.
 */
export function rankRooms(
  input: RecommendationInput,
  limit = 3,
): RankedRoom[] {
  const scenarioTags = scenarioTagsFromAnswers(input.calibrationAnswers)
  const listenerEnergy = listenerEnergyFromAnswers(input.calibrationAnswers)
  const joined = new Set(input.joinedRoomSlugs)

  const scored = input.candidates
    .filter((r) => !joined.has(r.slug))
    .filter((r) => r.visibility === 'public')
    .map((room) => scoreRoom(room, input, scenarioTags, listenerEnergy))

  // Sort by raw score for the diversity loop. Stable tie-break:
  // higher score → featured first → higher member_count → slug asc.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.room.featured !== b.room.featured) return a.room.featured ? -1 : 1
    if (b.room.member_count !== a.room.member_count) {
      return b.room.member_count - a.room.member_count
    }
    return a.room.slug.localeCompare(b.room.slug)
  })

  // Greedy MMR. Keep a working pool; on each iteration evaluate every
  // remaining candidate's adjusted score against the current picks
  // and choose the maximum.
  const picks: RankedRoom[] = []
  const remaining = scored.slice()
  const pickedSignatures: Set<string>[] = []

  while (picks.length < limit && remaining.length > 0) {
    let bestIdx = 0
    let bestAdjusted = -Infinity
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]
      const sig = roomSignature(candidate.room)
      let maxSim = 0
      for (const pickedSig of pickedSignatures) {
        const s = jaccard(sig, pickedSig)
        if (s > maxSim) maxSim = s
      }
      const penalty = LAMBDA_DIVERSITY * maxSim
      const adjusted = candidate.score - penalty
      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted
        bestIdx = i
      }
    }
    const chosen = remaining.splice(bestIdx, 1)[0]
    const chosenSig = roomSignature(chosen.room)
    let maxSim = 0
    for (const pickedSig of pickedSignatures) {
      const s = jaccard(chosenSig, pickedSig)
      if (s > maxSim) maxSim = s
    }
    const penalty = LAMBDA_DIVERSITY * maxSim
    picks.push({
      room: chosen.room,
      score: chosen.score - penalty,
      score_pre_diversity: chosen.score,
      diversity_penalty: penalty,
      factors: chosen.factors,
    })
    pickedSignatures.push(chosenSig)
  }

  return picks
}

/** Internal helper exposed for the pipeline + debug route: same
 *  scoring step but returns the pre-sort list so debug surfaces can
 *  see every scored candidate, not just the top-N. */
export function scoreAllCandidates(
  input: RecommendationInput,
): ScoredCandidate[] {
  const scenarioTags = scenarioTagsFromAnswers(input.calibrationAnswers)
  const listenerEnergy = listenerEnergyFromAnswers(input.calibrationAnswers)
  const joined = new Set(input.joinedRoomSlugs)

  return input.candidates
    .filter((r) => !joined.has(r.slug))
    .filter((r) => r.visibility === 'public')
    .map((room) => scoreRoom(room, input, scenarioTags, listenerEnergy))
}
