import { TRAIT_KEYS, type TraitBand, type TraitKey } from './traits'

/**
 * lib/identity/compatibility.ts — Phase 6A.10
 *
 * Pure deterministic compatibility scoring. No DB, no fetch, no
 * ML, no embeddings. Same inputs → byte-identical outputs.
 *
 * Architectural rules (design constraints):
 *   - Compatibility is structured-overlap math, not collaborative
 *     filtering. We DO NOT look at what other users like — we
 *     compute against the two users' own listener_* substrates.
 *   - Output is explainable: every score component is named,
 *     bounded, and persisted in the shared_* JSONB columns.
 *   - Bands are qualitative — UI shows "Strong resonance", not
 *     "87% match". The score is exposed for operators / debug but
 *     never as a percentage in user-facing copy.
 *   - Honest about divergence: we surface where listeners DIFFER
 *     alongside where they overlap. Pure-overlap framing implies
 *     identical = best, which is wrong.
 */

export const COMPATIBILITY_ALGORITHM_VERSION = 'compat_v1' as const

// ── Score weights ─────────────────────────────────────────────────
//
// Each component is independently bounded; the composite is the
// sum. Real-world scores typically land 5..40 — operator tuning
// happens here, not via a runtime config table.

const W_GENRE_MAX = 20
const W_ARCHETYPE_SAME_PRIMARY = 15
const W_ARCHETYPE_CROSS_LISTED = 7
const W_TRAIT_MAX = 10 // distributed across 7 traits
const W_ROOM_MAX = 10 // 1pt per shared top-room, capped

// ── Band thresholds ──────────────────────────────────────────────

export type CompatibilityBand =
  | 'strong'
  | 'clear'
  | 'emerging'
  | 'adjacent'
  | 'limited'

export function compatibilityBand(score: number): CompatibilityBand {
  if (!Number.isFinite(score) || score < 0) return 'limited'
  if (score >= 35) return 'strong'
  if (score >= 22) return 'clear'
  if (score >= 12) return 'emerging'
  if (score >= 5) return 'adjacent'
  return 'limited'
}

export function compatibilityBandLabel(band: CompatibilityBand): string {
  switch (band) {
    case 'strong':
      return 'Strong resonance'
    case 'clear':
      return 'Clear resonance'
    case 'emerging':
      return 'Emerging resonance'
    case 'adjacent':
      return 'Adjacent listening'
    case 'limited':
      return 'Limited overlap'
  }
}

// ── Canonical pair ordering ──────────────────────────────────────
//
// Always store with the lex-smaller UUID in user_id_a. Halves
// storage, eliminates "(A,B) vs (B,A)" ambiguity, makes upsert
// trivial. Code must normalize before reading/writing the table.

export interface CanonicalPair {
  user_id_a: string
  user_id_b: string
  /** True when the caller's preferred ordering required a swap. UI
   *  layers use this to remap a_/b_ side columns back to "me / them". */
  swapped: boolean
}

export function canonicalPair(
  preferredA: string,
  preferredB: string,
): CanonicalPair {
  if (preferredA === preferredB) {
    throw new Error('[compatibility] canonicalPair: same user_id on both sides')
  }
  if (preferredA < preferredB) {
    return { user_id_a: preferredA, user_id_b: preferredB, swapped: false }
  }
  return { user_id_a: preferredB, user_id_b: preferredA, swapped: true }
}

// ── Input envelopes ──────────────────────────────────────────────
//
// The minimum shape needed to score two users. The orchestrator
// (lib/identity/compatibility-recompute.ts) builds these from the
// DB. Tests (scripts/test-compatibility.ts) build them inline.

export interface CompatibilityInput {
  user_id: string
  primary_archetype_key: string | null
  alternate_archetype_keys: string[]
  trait_bands: Partial<Record<TraitKey, TraitBand>>
  top_genres: Array<{ genre: string; weighted_score: number }>
  top_rooms: Array<{
    room_id: string
    slug: string | null
    name: string | null
    score: number
  }>
}

// ── Output shape ─────────────────────────────────────────────────

export interface SharedTraitEntry {
  trait_key: TraitKey
  a_band: TraitBand
  b_band: TraitBand
  /** 1.0 when bands match exactly; 0.5 when adjacent; 0 when far apart.
   *  Only entries with alignment > 0 appear in shared_traits. */
  alignment: number
}

export interface DivergencePoint {
  trait_key: TraitKey
  a_band: TraitBand
  b_band: TraitBand
  /** Band gap in steps. low↔medium = 1, low↔high = 2. Only entries
   *  with gap ≥ 2 appear in divergence_points. */
  gap: number
}

export interface SharedGenreEntry {
  genre: string
  a_weight: number
  b_weight: number
}

export interface SharedRoomEntry {
  room_id: string
  slug: string | null
  name: string | null
  a_score: number
  b_score: number
}

export interface ArchetypeAlignment {
  a_primary: string | null
  b_primary: string | null
  /** True when the primary archetype matches exactly. */
  same_primary: boolean
  /** True when each user's primary appears in the other's alternates.
   *  (Either direction counts.) */
  cross_listed: boolean
}

export interface CompatibilityResult {
  score: number
  band: CompatibilityBand
  shared_traits: SharedTraitEntry[]
  shared_genres: SharedGenreEntry[]
  shared_rooms: SharedRoomEntry[]
  archetype_alignment: ArchetypeAlignment
  divergence_points: DivergencePoint[]
  /** Per-component breakdown for operator inspection. Sum equals score.
   *  Not persisted — recomputable from the structured fields above. */
  components: {
    genre: number
    archetype: number
    trait: number
    room: number
  }
}

// ── Band-distance helper ─────────────────────────────────────────
//
// Trait bands are ordered: low < medium < high. 'unknown' is a
// sentinel for "we don't know" — same as null and excluded from
// alignment math.

function bandRank(b: TraitBand | null | undefined): number | null {
  if (b === 'low') return 0
  if (b === 'medium') return 1
  if (b === 'high') return 2
  return null
}

function bandGap(a: TraitBand, b: TraitBand): number | null {
  const ra = bandRank(a)
  const rb = bandRank(b)
  if (ra === null || rb === null) return null
  return Math.abs(ra - rb)
}

// ── Compute ──────────────────────────────────────────────────────

/**
 * Score compatibility between two listeners. PURE — no I/O, no
 * randomness, no timestamps. Same inputs → byte-identical output.
 *
 * The input order doesn't affect the score (symmetric), but the
 * shared_genres / shared_rooms / shared_traits arrays use the
 * `a_*`/`b_*` field convention reflecting `a` and `b` as passed in.
 * The orchestrator handles canonical mapping back to "me/them" at
 * the read boundary.
 */
export function computeCompatibility(
  a: CompatibilityInput,
  b: CompatibilityInput,
): CompatibilityResult {
  // ── Genre Jaccard ────────────────────────────────────────────
  const genreScore = computeGenreScore(a, b)

  // ── Archetype alignment ──────────────────────────────────────
  const archetypeAlignment = computeArchetypeAlignment(a, b)
  let archetypeScore = 0
  if (archetypeAlignment.same_primary) {
    archetypeScore = W_ARCHETYPE_SAME_PRIMARY
  } else if (archetypeAlignment.cross_listed) {
    archetypeScore = W_ARCHETYPE_CROSS_LISTED
  }

  // ── Trait alignment ──────────────────────────────────────────
  const { traitScore, sharedTraits, divergencePoints } = computeTraitOverlap(a, b)

  // ── Shared rooms (top 10 each, intersection) ─────────────────
  const { roomScore, sharedRooms } = computeRoomOverlap(a, b)

  const total =
    genreScore.score + archetypeScore + traitScore + roomScore

  return {
    score: round4(total),
    band: compatibilityBand(total),
    shared_traits: sharedTraits,
    shared_genres: genreScore.sharedGenres,
    shared_rooms: sharedRooms,
    archetype_alignment: archetypeAlignment,
    divergence_points: divergencePoints,
    components: {
      genre: round4(genreScore.score),
      archetype: archetypeScore,
      trait: round4(traitScore),
      room: round4(roomScore),
    },
  }
}

// ── Component computations ───────────────────────────────────────

function computeGenreScore(
  a: CompatibilityInput,
  b: CompatibilityInput,
): { score: number; sharedGenres: SharedGenreEntry[] } {
  const aMap = new Map(a.top_genres.map((g) => [g.genre, g.weighted_score]))
  const bMap = new Map(b.top_genres.map((g) => [g.genre, g.weighted_score]))
  const intersect: SharedGenreEntry[] = []
  for (const [g, aw] of aMap) {
    const bw = bMap.get(g)
    if (bw === undefined) continue
    intersect.push({ genre: g, a_weight: aw, b_weight: bw })
  }
  const unionSize = new Set([...aMap.keys(), ...bMap.keys()]).size
  const jaccard = unionSize === 0 ? 0 : intersect.length / unionSize
  // Sort shared genres by combined weight desc with deterministic
  // alphabetical tie-break.
  intersect.sort((x, y) => {
    const xw = x.a_weight + x.b_weight
    const yw = y.a_weight + y.b_weight
    if (yw !== xw) return yw - xw
    return x.genre.localeCompare(y.genre)
  })
  return { score: W_GENRE_MAX * jaccard, sharedGenres: intersect }
}

function computeArchetypeAlignment(
  a: CompatibilityInput,
  b: CompatibilityInput,
): ArchetypeAlignment {
  const aPrim = a.primary_archetype_key
  const bPrim = b.primary_archetype_key
  const samePrimary = aPrim !== null && aPrim === bPrim
  const aAlts = new Set(a.alternate_archetype_keys)
  const bAlts = new Set(b.alternate_archetype_keys)
  const crossListed =
    !samePrimary &&
    ((aPrim !== null && bAlts.has(aPrim)) ||
      (bPrim !== null && aAlts.has(bPrim)))
  return {
    a_primary: aPrim,
    b_primary: bPrim,
    same_primary: samePrimary,
    cross_listed: crossListed,
  }
}

function computeTraitOverlap(
  a: CompatibilityInput,
  b: CompatibilityInput,
): {
  traitScore: number
  sharedTraits: SharedTraitEntry[]
  divergencePoints: DivergencePoint[]
} {
  let traitAlignSum = 0
  let traitContributingCount = 0
  const sharedTraits: SharedTraitEntry[] = []
  const divergencePoints: DivergencePoint[] = []

  for (const key of TRAIT_KEYS) {
    const aBand = a.trait_bands[key]
    const bBand = b.trait_bands[key]
    if (!aBand || !bBand || aBand === 'unknown' || bBand === 'unknown') {
      continue
    }
    const gap = bandGap(aBand, bBand)
    if (gap === null) continue
    traitContributingCount += 1
    let alignment = 0
    if (gap === 0) alignment = 1
    else if (gap === 1) alignment = 0.5
    else alignment = 0
    traitAlignSum += alignment
    if (alignment > 0) {
      sharedTraits.push({
        trait_key: key,
        a_band: aBand,
        b_band: bBand,
        alignment,
      })
    }
    if (gap >= 2) {
      divergencePoints.push({
        trait_key: key,
        a_band: aBand,
        b_band: bBand,
        gap,
      })
    }
  }

  // Sort shared by alignment desc + key asc; divergence by gap desc
  // + key asc. Deterministic ordering.
  sharedTraits.sort((x, y) => {
    if (y.alignment !== x.alignment) return y.alignment - x.alignment
    return x.trait_key.localeCompare(y.trait_key)
  })
  divergencePoints.sort((x, y) => {
    if (y.gap !== x.gap) return y.gap - x.gap
    return x.trait_key.localeCompare(y.trait_key)
  })

  // Normalize trait score: max trait alignment is
  // traitContributingCount (every trait perfectly aligned). Scale to
  // W_TRAIT_MAX. When zero traits contribute, score is 0.
  const traitScore =
    traitContributingCount === 0
      ? 0
      : (W_TRAIT_MAX * traitAlignSum) / traitContributingCount

  return { traitScore, sharedTraits, divergencePoints }
}

function computeRoomOverlap(
  a: CompatibilityInput,
  b: CompatibilityInput,
): { roomScore: number; sharedRooms: SharedRoomEntry[] } {
  const TOP_ROOMS = 10
  // Top-10 (by score) on each side; map by room_id for intersection.
  const aTop = [...a.top_rooms].sort((x, y) => y.score - x.score).slice(0, TOP_ROOMS)
  const bTop = [...b.top_rooms].sort((x, y) => y.score - x.score).slice(0, TOP_ROOMS)
  const aMap = new Map(aTop.map((r) => [r.room_id, r]))
  const sharedRooms: SharedRoomEntry[] = []
  for (const bRoom of bTop) {
    const aRoom = aMap.get(bRoom.room_id)
    if (!aRoom) continue
    sharedRooms.push({
      room_id: bRoom.room_id,
      slug: bRoom.slug ?? aRoom.slug,
      name: bRoom.name ?? aRoom.name,
      a_score: aRoom.score,
      b_score: bRoom.score,
    })
  }
  // Sort shared rooms by combined score desc + room_id asc.
  sharedRooms.sort((x, y) => {
    const xs = x.a_score + x.b_score
    const ys = y.a_score + y.b_score
    if (ys !== xs) return ys - xs
    return x.room_id.localeCompare(y.room_id)
  })
  // 1pt per shared, capped at W_ROOM_MAX.
  const roomScore = Math.min(sharedRooms.length, W_ROOM_MAX)
  return { roomScore, sharedRooms }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
