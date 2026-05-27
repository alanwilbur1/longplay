import { TRAIT_KEYS, type TraitBand, type TraitKey } from './traits'

/**
 * lib/identity/drift.ts — Phase 6A.9
 *
 * Pure deterministic drift computation. Compares two identity
 * snapshots (previous + current) and returns a structured
 * DriftSummary, or null when no meaningful change is detected.
 *
 * Architectural rules:
 *   - Deterministic: same inputs → byte-identical output. No
 *     randomness, no time-of-day dependencies.
 *   - Threshold-aware: small fluctuations don't register. The
 *     thresholds are explicit constants here so they can be tuned
 *     by editing this file + bumping IDENTITY_ALGORITHM_VERSION.
 *   - Stable: numeric drift is symmetric — a 0.16 rise registers
 *     the same as a 0.16 fall, just with opposite sign in the
 *     `delta` field. Tests assert this invariant.
 *   - No fake narrative invention. The output is structured data;
 *     downstream UI / future prose layers (NOT Phase 6A.9) decide
 *     how to render it.
 */

// ── Thresholds ───────────────────────────────────────────────────
//
// Tuned to avoid snapshot spam while still capturing meaningful
// evolution. Trait scores are [0..1]; archetype confidence is also
// [0..1]; top-genre/top-room comparisons are set membership.

/** Minimum |trait_score_delta| to count as a rising/falling trait. */
export const TRAIT_DRIFT_THRESHOLD = 0.15
/** Minimum |archetype_confidence_delta| to record as a change. */
export const ARCHETYPE_CONFIDENCE_THRESHOLD = 0.1
/** Days between snapshots considered "current" for the window_days field. */
export const HISTORY_FRESH_WINDOW_DAYS = 30

// ── Shapes ───────────────────────────────────────────────────────

export interface SnapshotTraitEntry {
  score: number | null
  band: TraitBand
}

export interface SnapshotArchetype {
  archetype_key: string
  archetype_label: string
  confidence_score: number
  rank: number
}

export interface SnapshotGenre {
  genre: string
  weighted_score: number
}

export interface SnapshotRoom {
  room_id: string
  slug: string | null
  name: string | null
  score: number
}

/**
 * The minimum shape needed to compute drift. Both
 * lib/identity/history-recompute.ts (orchestrator) and
 * scripts/test-identity-drift.ts (tests) build values of this
 * shape — the database row in listener_identity_history serializes
 * directly to and from it.
 */
export interface IdentitySnapshotForDrift {
  snapshot_at: string // ISO
  primary_archetype_key: string | null
  primary_confidence: number | null
  archetypes: SnapshotArchetype[]
  trait_snapshot: Partial<Record<TraitKey, SnapshotTraitEntry>>
  top_genres: SnapshotGenre[]
  top_rooms: SnapshotRoom[]
}

export interface TraitDriftEntry {
  trait_key: TraitKey
  prev_score: number | null
  curr_score: number | null
  delta: number // curr - prev; signed
}

export interface ArchetypeTransition {
  from_key: string | null
  from_label: string | null
  to_key: string | null
  to_label: string | null
}

export interface DriftSummary {
  archetype_transition: ArchetypeTransition | null
  archetype_confidence_change: number | null
  rising_traits: TraitDriftEntry[]
  falling_traits: TraitDriftEntry[]
  emerging_genres: SnapshotGenre[]
  fading_genres: { genre: string }[]
  emerging_rooms: SnapshotRoom[]
  fading_rooms: { room_id: string; slug: string | null; name: string | null }[]
  /** Days between previous.snapshot_at and current.snapshot_at.
   *  Used by UI ("over the last 8 days, …") + the append decision
   *  that ensures one snapshot/week minimum. */
  window_days: number
  /** True when at least one of the structural fields is non-empty.
   *  Caller uses this to decide whether to append a new history row
   *  vs. skip on a no-change recompute. */
  has_meaningful_change: boolean
}

// ── Core computation ─────────────────────────────────────────────

/**
 * Compute drift between two snapshots. `prev` should be older than
 * `curr`. Returns a populated DriftSummary; the caller inspects
 * `has_meaningful_change` to decide whether to persist.
 *
 * Pure function — same inputs always produce the same output.
 */
export function computeDrift(
  prev: IdentitySnapshotForDrift,
  curr: IdentitySnapshotForDrift,
): DriftSummary {
  const archetypeTransition = computeArchetypeTransition(prev, curr)
  const confidenceChange = computeConfidenceChange(prev, curr)
  const { rising, falling } = computeTraitDrift(prev, curr)
  const { emerging: emergingGenres, fading: fadingGenres } = computeGenreDrift(
    prev,
    curr,
  )
  const { emerging: emergingRooms, fading: fadingRooms } = computeRoomDrift(
    prev,
    curr,
  )
  const windowDays = computeWindowDays(prev.snapshot_at, curr.snapshot_at)

  const hasMeaningfulChange =
    archetypeTransition !== null ||
    (confidenceChange !== null &&
      Math.abs(confidenceChange) >= ARCHETYPE_CONFIDENCE_THRESHOLD) ||
    rising.length > 0 ||
    falling.length > 0 ||
    emergingGenres.length > 0 ||
    fadingGenres.length > 0 ||
    emergingRooms.length > 0 ||
    fadingRooms.length > 0

  return {
    archetype_transition: archetypeTransition,
    archetype_confidence_change: confidenceChange,
    rising_traits: rising,
    falling_traits: falling,
    emerging_genres: emergingGenres,
    fading_genres: fadingGenres,
    emerging_rooms: emergingRooms,
    fading_rooms: fadingRooms,
    window_days: windowDays,
    has_meaningful_change: hasMeaningfulChange,
  }
}

// ── Subcomputations ──────────────────────────────────────────────

function computeArchetypeTransition(
  prev: IdentitySnapshotForDrift,
  curr: IdentitySnapshotForDrift,
): ArchetypeTransition | null {
  const prevKey = prev.primary_archetype_key ?? null
  const currKey = curr.primary_archetype_key ?? null
  if (prevKey === currKey) return null
  return {
    from_key: prevKey,
    from_label: archetypeLabelFromSnapshot(prev, prevKey),
    to_key: currKey,
    to_label: archetypeLabelFromSnapshot(curr, currKey),
  }
}

function archetypeLabelFromSnapshot(
  snap: IdentitySnapshotForDrift,
  key: string | null,
): string | null {
  if (!key) return null
  const match = snap.archetypes.find((a) => a.archetype_key === key)
  return match?.archetype_label ?? null
}

function computeConfidenceChange(
  prev: IdentitySnapshotForDrift,
  curr: IdentitySnapshotForDrift,
): number | null {
  // Only report a confidence delta when BOTH snapshots have the
  // same primary archetype — comparing confidence across different
  // archetypes is apples-to-oranges and would mislead.
  if (
    prev.primary_archetype_key === null ||
    curr.primary_archetype_key === null
  ) {
    return null
  }
  if (prev.primary_archetype_key !== curr.primary_archetype_key) return null
  const prevC = prev.primary_confidence ?? 0
  const currC = curr.primary_confidence ?? 0
  return round4(currC - prevC)
}

function computeTraitDrift(
  prev: IdentitySnapshotForDrift,
  curr: IdentitySnapshotForDrift,
): { rising: TraitDriftEntry[]; falling: TraitDriftEntry[] } {
  const rising: TraitDriftEntry[] = []
  const falling: TraitDriftEntry[] = []
  for (const key of TRAIT_KEYS) {
    const prevEntry = prev.trait_snapshot[key]
    const currEntry = curr.trait_snapshot[key]
    const prevScore = prevEntry?.score ?? null
    const currScore = currEntry?.score ?? null
    // If either side has no score, can't compute a meaningful delta.
    // (UI can still infer "trait emerged from unknown to known" via
    // the band fields, but that's a different signal.)
    if (prevScore === null || currScore === null) continue
    const delta = round4(currScore - prevScore)
    if (Math.abs(delta) < TRAIT_DRIFT_THRESHOLD) continue
    const entry: TraitDriftEntry = {
      trait_key: key,
      prev_score: prevScore,
      curr_score: currScore,
      delta,
    }
    if (delta > 0) rising.push(entry)
    else falling.push(entry)
  }
  // Sort by |delta| desc so the most dramatic change is first.
  // Deterministic tie-break: alphabetical by key.
  const cmp = (a: TraitDriftEntry, b: TraitDriftEntry): number => {
    const am = Math.abs(a.delta)
    const bm = Math.abs(b.delta)
    if (bm !== am) return bm - am
    return a.trait_key.localeCompare(b.trait_key)
  }
  rising.sort(cmp)
  falling.sort(cmp)
  return { rising, falling }
}

function computeGenreDrift(
  prev: IdentitySnapshotForDrift,
  curr: IdentitySnapshotForDrift,
): { emerging: SnapshotGenre[]; fading: { genre: string }[] } {
  const prevSet = new Set(prev.top_genres.map((g) => g.genre))
  const currSet = new Set(curr.top_genres.map((g) => g.genre))
  const emerging = curr.top_genres.filter((g) => !prevSet.has(g.genre))
  const fading = prev.top_genres
    .filter((g) => !currSet.has(g.genre))
    .map((g) => ({ genre: g.genre }))
  return { emerging, fading }
}

function computeRoomDrift(
  prev: IdentitySnapshotForDrift,
  curr: IdentitySnapshotForDrift,
): {
  emerging: SnapshotRoom[]
  fading: { room_id: string; slug: string | null; name: string | null }[]
} {
  const prevIds = new Set(prev.top_rooms.map((r) => r.room_id))
  const currIds = new Set(curr.top_rooms.map((r) => r.room_id))
  const emerging = curr.top_rooms.filter((r) => !prevIds.has(r.room_id))
  const fading = prev.top_rooms
    .filter((r) => !currIds.has(r.room_id))
    .map((r) => ({ room_id: r.room_id, slug: r.slug, name: r.name }))
  return { emerging, fading }
}

function computeWindowDays(prevIso: string, currIso: string): number {
  const prevMs = Date.parse(prevIso)
  const currMs = Date.parse(currIso)
  if (!Number.isFinite(prevMs) || !Number.isFinite(currMs)) return 0
  const diff = Math.max(0, currMs - prevMs)
  return Math.round(diff / (24 * 60 * 60 * 1000))
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000
}

// ── Append decision ──────────────────────────────────────────────
//
// The orchestrator (lib/identity/history-recompute.ts) calls
// shouldAppend() to decide whether to write a new history row.
// Pure function so the decision is testable in isolation.

/** Minimum days between rows when no meaningful drift is observed. */
export const HISTORY_MIN_DAYS_NO_CHANGE = 7

export function shouldAppendHistory(params: {
  hasPrevious: boolean
  drift: DriftSummary | null
}): boolean {
  // First snapshot for the user — always write.
  if (!params.hasPrevious) return true
  const drift = params.drift
  if (!drift) return false
  // Meaningful change — write.
  if (drift.has_meaningful_change) return true
  // Slow-evolution capture: at least one row per week even on
  // no-change recomputes. window_days==0 happens when the previous
  // snapshot was taken in the same second; treat as "no time has
  // passed" → don't write.
  if (drift.window_days >= HISTORY_MIN_DAYS_NO_CHANGE) return true
  return false
}
