import type { TraitBand, TraitKey } from '@/lib/identity/traits'
import { TRAIT_KEYS } from '@/lib/identity/traits'

/**
 * lib/ecology/computation.ts — Phase 6A.11
 *
 * Pure deterministic room ecology + adjacency math. No DB, no
 * fetch — the orchestrator (lib/ecology/recompute.ts) builds
 * input shapes from Layer 1-5 data and calls these helpers.
 *
 * Architectural rules:
 *   - Same inputs → byte-identical output. No randomness, no Date.now.
 *   - Threshold-aware. Drift detection mirrors Phase 6A.9's
 *     identity_history append rules.
 *   - Restrained tone in the output shape — modal bands + share
 *     fractions, not "vibrancy scores".
 *   - No collaborative filtering. Adjacency is structured overlap
 *     across the rooms' currently-active listener populations.
 */

export const ECOLOGY_ALGORITHM_VERSION = 'ecology_v1' as const

// ── Thresholds ───────────────────────────────────────────────────

/** Minimum room_affinity_scores.score for a listener to count as
 *  "active" in the room's ecology. Matches the "emerging" band
 *  cutoff from Phase 6A.8. */
export const ACTIVE_LISTENER_AFFINITY_FLOOR = 12

/** Days between ecology snapshots considered "fresh" for the
 *  shouldAppend decision. Same convention as identity_history. */
export const ECOLOGY_MIN_DAYS_NO_CHANGE = 7

/** Shares above this make a top archetype "dominant" enough for the
 *  drift comparator to count as a change when it appears/disappears. */
const ARCHETYPE_DRIFT_SHARE = 0.15

/** Top-N counts in dominant_* output. */
const TOP_ARCHETYPES = 5
const TOP_GENRES = 10

// ── Input shapes ─────────────────────────────────────────────────

/**
 * Per-listener envelope used by computeRoomEcology. The orchestrator
 * pre-joins listener_archetype_snapshots, listener_identity_traits,
 * and listener_genres into this shape. Empty arrays / null fields
 * are tolerated — the math degrades gracefully.
 */
export interface ListenerEcologyInput {
  user_id: string
  /** room_affinity_scores.score for the room this listener is being
   *  counted in. Caller filters by ACTIVE_LISTENER_AFFINITY_FLOOR
   *  before passing. */
  affinity_score: number
  primary_archetype_key: string | null
  primary_archetype_label: string | null
  trait_bands: Partial<Record<TraitKey, TraitBand>>
  top_genres: Array<{ genre: string; weighted_score: number }>
}

/** Shared room metadata (rooms.energy_level + display). */
export interface RoomEcologyContext {
  room_id: string
  declared_energy_level: 'low' | 'medium' | 'high' | null
}

// ── Output shapes ────────────────────────────────────────────────

export interface DominantArchetypeEntry {
  archetype_key: string
  archetype_label: string
  listener_count: number
  share: number // [0..1]
}

export interface DominantTraitEntry {
  modal_band: TraitBand
  low_share: number
  medium_share: number
  high_share: number
  /** Total listeners with a known (non-'unknown') band for this trait. */
  n: number
}

export interface DominantGenreEntry {
  genre: string
  sum_weight: number
  listener_count: number
}

export interface EnergyProfile {
  declared: 'low' | 'medium' | 'high' | null
  observed_recency: number | null
  observed_exploratory: number | null
  observed_nocturnal: number | null
  observed_album_focus: number | null
}

export interface RoomEcologyResult {
  room_id: string
  active_listener_count: number
  dominant_archetypes: DominantArchetypeEntry[]
  dominant_traits: Partial<Record<TraitKey, DominantTraitEntry>>
  dominant_genres: DominantGenreEntry[]
  energy_profile: EnergyProfile
}

/**
 * Compute the ecology snapshot for one room from its active listener
 * population. Pure: same inputs → byte-identical output.
 *
 * When listeners is empty, returns a structurally-valid result with
 * zero counts — the orchestrator will still write a row when the
 * append rules want it (e.g., first snapshot for a brand-new room).
 */
export function computeRoomEcology(
  ctx: RoomEcologyContext,
  listeners: ReadonlyArray<ListenerEcologyInput>,
): RoomEcologyResult {
  const activeListenerCount = listeners.length

  // ── Archetype counts ──────────────────────────────────────────
  const archetypeCounts = new Map<
    string,
    { label: string | null; count: number }
  >()
  for (const l of listeners) {
    if (!l.primary_archetype_key) continue
    const prev = archetypeCounts.get(l.primary_archetype_key) ?? {
      label: l.primary_archetype_label,
      count: 0,
    }
    prev.count += 1
    archetypeCounts.set(l.primary_archetype_key, prev)
  }
  const dominantArchetypes: DominantArchetypeEntry[] = [...archetypeCounts.entries()]
    .map(([key, v]) => ({
      archetype_key: key,
      archetype_label: v.label ?? key,
      listener_count: v.count,
      share: activeListenerCount === 0 ? 0 : round4(v.count / activeListenerCount),
    }))
    .sort((a, b) => {
      if (b.listener_count !== a.listener_count) {
        return b.listener_count - a.listener_count
      }
      return a.archetype_key.localeCompare(b.archetype_key)
    })
    .slice(0, TOP_ARCHETYPES)

  // ── Trait band distributions ─────────────────────────────────
  const dominantTraits: Partial<Record<TraitKey, DominantTraitEntry>> = {}
  for (const key of TRAIT_KEYS) {
    let low = 0
    let medium = 0
    let high = 0
    let total = 0
    for (const l of listeners) {
      const band = l.trait_bands[key]
      if (!band || band === 'unknown') continue
      total += 1
      if (band === 'low') low += 1
      else if (band === 'medium') medium += 1
      else if (band === 'high') high += 1
    }
    if (total === 0) continue
    // Modal band — most common. Tie-break: prefer medium > high > low
    // (a center bias when bands tie, less alarming than picking edges).
    const modal: TraitBand =
      medium >= low && medium >= high
        ? 'medium'
        : high >= low
          ? 'high'
          : 'low'
    dominantTraits[key] = {
      modal_band: modal,
      low_share: round4(low / total),
      medium_share: round4(medium / total),
      high_share: round4(high / total),
      n: total,
    }
  }

  // ── Genre aggregation ────────────────────────────────────────
  const genreAgg = new Map<string, { sum: number; count: number }>()
  for (const l of listeners) {
    for (const g of l.top_genres) {
      const prev = genreAgg.get(g.genre) ?? { sum: 0, count: 0 }
      prev.sum += g.weighted_score
      prev.count += 1
      genreAgg.set(g.genre, prev)
    }
  }
  const dominantGenres: DominantGenreEntry[] = [...genreAgg.entries()]
    .map(([genre, v]) => ({
      genre,
      sum_weight: round4(v.sum),
      listener_count: v.count,
    }))
    .sort((a, b) => {
      if (b.sum_weight !== a.sum_weight) return b.sum_weight - a.sum_weight
      if (b.listener_count !== a.listener_count) {
        return b.listener_count - a.listener_count
      }
      return a.genre.localeCompare(b.genre)
    })
    .slice(0, TOP_GENRES)

  // ── Energy profile ───────────────────────────────────────────
  // Means over listeners' observed trait scores (recency_bias,
  // exploratory, nocturnal, album_focus). The trait_bands here are
  // bands only — we want raw scores too, which the orchestrator
  // doesn't currently pass. For Phase 6A.11 v1, infer "observed_*"
  // as the modal band remapped to {low: 0.2, medium: 0.5, high: 0.8}
  // — preserves the qualitative reading without requiring an extra
  // column on the input.
  const energyProfile: EnergyProfile = {
    declared: ctx.declared_energy_level,
    observed_recency: bandToScore(dominantTraits.recency_bias_score?.modal_band),
    observed_exploratory: bandToScore(dominantTraits.exploratory_score?.modal_band),
    observed_nocturnal: bandToScore(dominantTraits.nocturnal_score?.modal_band),
    observed_album_focus: bandToScore(dominantTraits.album_focus_score?.modal_band),
  }

  return {
    room_id: ctx.room_id,
    active_listener_count: activeListenerCount,
    dominant_archetypes: dominantArchetypes,
    dominant_traits: dominantTraits,
    dominant_genres: dominantGenres,
    energy_profile: energyProfile,
  }
}

function bandToScore(b: TraitBand | undefined): number | null {
  if (!b || b === 'unknown') return null
  if (b === 'low') return 0.2
  if (b === 'medium') return 0.5
  return 0.8
}

// ── Drift between ecology snapshots ──────────────────────────────

export interface ArchetypeShift {
  archetype_key: string
  archetype_label: string
  prev_share: number
  curr_share: number
  /** curr - prev; signed. */
  delta: number
}

export interface GenreShift {
  genre: string
}

export interface TraitBandShift {
  trait_key: TraitKey
  prev_modal: TraitBand
  curr_modal: TraitBand
}

export interface RoomDriftSummary {
  archetype_shifts: ArchetypeShift[] // ascending or descending shares
  emerging_genres: GenreShift[]
  fading_genres: GenreShift[]
  trait_modal_shifts: TraitBandShift[]
  window_days: number
  has_meaningful_change: boolean
}

export function computeRoomDrift(
  prev: {
    snapshot_at: string
    dominant_archetypes: DominantArchetypeEntry[]
    dominant_traits: Partial<Record<TraitKey, DominantTraitEntry>>
    dominant_genres: DominantGenreEntry[]
  },
  curr: {
    snapshot_at: string
    dominant_archetypes: DominantArchetypeEntry[]
    dominant_traits: Partial<Record<TraitKey, DominantTraitEntry>>
    dominant_genres: DominantGenreEntry[]
  },
): RoomDriftSummary {
  // Archetype share shifts.
  const prevShareByKey = new Map(
    prev.dominant_archetypes.map((a) => [a.archetype_key, a]),
  )
  const currShareByKey = new Map(
    curr.dominant_archetypes.map((a) => [a.archetype_key, a]),
  )
  const allKeys = new Set<string>([
    ...prevShareByKey.keys(),
    ...currShareByKey.keys(),
  ])
  const archetypeShifts: ArchetypeShift[] = []
  for (const key of allKeys) {
    const prevEntry = prevShareByKey.get(key)
    const currEntry = currShareByKey.get(key)
    const prevShare = prevEntry?.share ?? 0
    const currShare = currEntry?.share ?? 0
    const delta = round4(currShare - prevShare)
    if (Math.abs(delta) < ARCHETYPE_DRIFT_SHARE) continue
    archetypeShifts.push({
      archetype_key: key,
      archetype_label:
        currEntry?.archetype_label ?? prevEntry?.archetype_label ?? key,
      prev_share: round4(prevShare),
      curr_share: round4(currShare),
      delta,
    })
  }
  archetypeShifts.sort((a, b) => {
    const am = Math.abs(a.delta)
    const bm = Math.abs(b.delta)
    if (bm !== am) return bm - am
    return a.archetype_key.localeCompare(b.archetype_key)
  })

  // Emerging / fading genres — set diff over top-N.
  const prevGenreSet = new Set(prev.dominant_genres.map((g) => g.genre))
  const currGenreSet = new Set(curr.dominant_genres.map((g) => g.genre))
  const emergingGenres: GenreShift[] = curr.dominant_genres
    .filter((g) => !prevGenreSet.has(g.genre))
    .map((g) => ({ genre: g.genre }))
  const fadingGenres: GenreShift[] = prev.dominant_genres
    .filter((g) => !currGenreSet.has(g.genre))
    .map((g) => ({ genre: g.genre }))

  // Trait modal-band shifts (only when the modal band moved).
  const traitShifts: TraitBandShift[] = []
  for (const key of TRAIT_KEYS) {
    const p = prev.dominant_traits[key]
    const c = curr.dominant_traits[key]
    if (!p || !c) continue
    if (p.modal_band === c.modal_band) continue
    traitShifts.push({
      trait_key: key,
      prev_modal: p.modal_band,
      curr_modal: c.modal_band,
    })
  }
  // Stable order
  traitShifts.sort((a, b) => a.trait_key.localeCompare(b.trait_key))

  const windowDays = computeWindowDays(prev.snapshot_at, curr.snapshot_at)
  const hasMeaningfulChange =
    archetypeShifts.length > 0 ||
    emergingGenres.length > 0 ||
    fadingGenres.length > 0 ||
    traitShifts.length > 0

  return {
    archetype_shifts: archetypeShifts,
    emerging_genres: emergingGenres,
    fading_genres: fadingGenres,
    trait_modal_shifts: traitShifts,
    window_days: windowDays,
    has_meaningful_change: hasMeaningfulChange,
  }
}

export function shouldAppendRoomEcology(params: {
  hasPrevious: boolean
  drift: RoomDriftSummary | null
}): boolean {
  if (!params.hasPrevious) return true
  if (!params.drift) return false
  if (params.drift.has_meaningful_change) return true
  if (params.drift.window_days >= ECOLOGY_MIN_DAYS_NO_CHANGE) return true
  return false
}

// ── Adjacency between rooms ──────────────────────────────────────

const W_OVERLAP = 12 // overlap count component cap
const W_ARCHETYPE = 10 // per shared archetype, x 5 max
const W_GENRE = 10 // genre jaccard component cap

export type AdjacencyBand =
  | 'aligned'
  | 'overlapping'
  | 'adjacent'
  | 'disjoint'

export function adjacencyBand(score: number): AdjacencyBand {
  if (!Number.isFinite(score) || score < 0) return 'disjoint'
  if (score >= 22) return 'aligned'
  if (score >= 14) return 'overlapping'
  if (score >= 6) return 'adjacent'
  return 'disjoint'
}

export function adjacencyBandLabel(band: AdjacencyBand): string {
  switch (band) {
    case 'aligned':
      return 'Aligned'
    case 'overlapping':
      return 'Overlapping populations'
    case 'adjacent':
      return 'Adjacent'
    case 'disjoint':
      return 'Distinct'
  }
}

export interface RoomAdjacencyInput {
  room_id: string
  active_listener_ids: ReadonlyArray<string>
  dominant_archetypes: DominantArchetypeEntry[]
  dominant_genres: DominantGenreEntry[]
}

export interface RoomAdjacencyResult {
  score: number
  band: AdjacencyBand
  listener_overlap_count: number
  shared_archetypes: Array<{
    archetype_key: string
    archetype_label: string
    a_share: number
    b_share: number
  }>
  shared_genres: Array<{
    genre: string
    a_weight: number
    b_weight: number
  }>
  components: {
    overlap: number
    archetype: number
    genre: number
  }
}

/**
 * Adjacency between two rooms. Symmetric: computeAdjacency(A, B) and
 * computeAdjacency(B, A) produce equivalent scores; the orchestrator
 * normalizes to canonical order at the storage boundary.
 */
export function computeRoomAdjacency(
  a: RoomAdjacencyInput,
  b: RoomAdjacencyInput,
): RoomAdjacencyResult {
  // Listener overlap — set intersection over active listener IDs.
  const aSet = new Set(a.active_listener_ids)
  const overlapCount = b.active_listener_ids.reduce(
    (n, id) => (aSet.has(id) ? n + 1 : n),
    0,
  )
  // Normalize: cap at W_OVERLAP. 1pt per shared listener with linear
  // saturation — meaningful at small N, doesn't blow up at large N.
  const overlapComponent = Math.min(overlapCount, W_OVERLAP)

  // Archetype overlap. Same logic as compat: shared keys, weighted
  // by combined share.
  const aArchMap = new Map(
    a.dominant_archetypes.map((x) => [x.archetype_key, x]),
  )
  const sharedArchetypes: RoomAdjacencyResult['shared_archetypes'] = []
  let archetypeScore = 0
  for (const bArch of b.dominant_archetypes) {
    const aArch = aArchMap.get(bArch.archetype_key)
    if (!aArch) continue
    sharedArchetypes.push({
      archetype_key: bArch.archetype_key,
      archetype_label: bArch.archetype_label,
      a_share: aArch.share,
      b_share: bArch.share,
    })
    // Per-pair contribution: min(share_a, share_b) * weight scale.
    // A shared archetype that's 50% of each room → 0.5 contribution.
    archetypeScore += Math.min(aArch.share, bArch.share)
  }
  archetypeScore = Math.min(archetypeScore * W_ARCHETYPE, W_ARCHETYPE)
  sharedArchetypes.sort((x, y) => {
    const xc = Math.min(x.a_share, x.b_share)
    const yc = Math.min(y.a_share, y.b_share)
    if (yc !== xc) return yc - xc
    return x.archetype_key.localeCompare(y.archetype_key)
  })

  // Genre Jaccard on dominant_genres (top-10 each, set membership).
  const aGenres = new Set(a.dominant_genres.map((g) => g.genre))
  const bGenres = new Set(b.dominant_genres.map((g) => g.genre))
  const interGenres: RoomAdjacencyResult['shared_genres'] = []
  for (const ag of a.dominant_genres) {
    if (!bGenres.has(ag.genre)) continue
    const bg = b.dominant_genres.find((x) => x.genre === ag.genre)!
    interGenres.push({
      genre: ag.genre,
      a_weight: ag.sum_weight,
      b_weight: bg.sum_weight,
    })
  }
  const unionGenres = new Set([...aGenres, ...bGenres]).size
  const genreJaccard = unionGenres === 0 ? 0 : interGenres.length / unionGenres
  const genreComponent = W_GENRE * genreJaccard
  interGenres.sort((x, y) => {
    const xw = x.a_weight + x.b_weight
    const yw = y.a_weight + y.b_weight
    if (yw !== xw) return yw - xw
    return x.genre.localeCompare(y.genre)
  })

  const total = round4(overlapComponent + archetypeScore + genreComponent)

  return {
    score: total,
    band: adjacencyBand(total),
    listener_overlap_count: overlapCount,
    shared_archetypes: sharedArchetypes,
    shared_genres: interGenres,
    components: {
      overlap: round4(overlapComponent),
      archetype: round4(archetypeScore),
      genre: round4(genreComponent),
    },
  }
}

/**
 * Canonical room-pair ordering. Same pattern as
 * lib/identity/compatibility.ts:canonicalPair.
 */
export function canonicalRoomPair(
  preferredA: string,
  preferredB: string,
): { room_id_a: string; room_id_b: string; swapped: boolean } {
  if (preferredA === preferredB) {
    throw new Error('[ecology] canonicalRoomPair: same room_id on both sides')
  }
  if (preferredA < preferredB) {
    return { room_id_a: preferredA, room_id_b: preferredB, swapped: false }
  }
  return { room_id_a: preferredB, room_id_b: preferredA, swapped: true }
}

// ── Helpers ──────────────────────────────────────────────────────

function computeWindowDays(prevIso: string, currIso: string): number {
  const p = Date.parse(prevIso)
  const c = Date.parse(currIso)
  if (!Number.isFinite(p) || !Number.isFinite(c)) return 0
  return Math.max(0, Math.round((c - p) / (24 * 60 * 60 * 1000)))
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}
