/**
 * lib/identity-emergence/tendencies.ts — Phase 4A
 *
 * Pure tendency detectors. Each one takes the aggregated IdentityEvidence
 * and returns a Tendency: either a restrained literary line, or silence
 * (line: null).
 *
 * Three tendencies in Phase 4A — each gated through the Phase 3G
 * `assess(...)` framework against an existing ObservationKind. None
 * claim a label; none name a specific room or album; none describe
 * the listener's personality.
 *
 * Adding a fourth requires:
 *   1. Adding the TendencyKind in types.ts
 *   2. Adding a literary line in language.ts
 *   3. Adding a detector here that gates through assess()
 *   4. Writing the rule in lib/interpretation/thresholds.ts
 *
 * Resist the temptation. Three is enough for the first emergence.
 */

import { assess } from '@/lib/interpretation'
import {
  recurringRoomsLine,
  roomDistributionGatheringLine,
  roomDistributionMovingLine,
  markingStyleReflectiveLine,
  markingStyleBriefLine,
} from './language'
import type { IdentityEvidence, Tendency, TendencyKind } from './types'

// ── Silence helper ──────────────────────────────────────────────────────────
// Returns a tendency that has been gated to silence. Always carries a
// reason so dev-mode telemetry can explain why.
function silent(kind: TendencyKind, confidence: Tendency['confidence'], reason: string): Tendency {
  return { kind, confidence, line: null, reason }
}

// ── Detector 1: recurring-rooms ─────────────────────────────────────────────
// Routes through Phase 3G `room-tendency`. Requires the user to have
// returned to ANY single room ≥5 times AND across ≥2 cycles. The line
// never names which room — that would feel surveilled. We only observe
// the recurrence itself.
function detectRecurringRooms(e: IdentityEvidence): Tendency {
  // Find rooms with multi-cycle engagement.
  const candidates = e.roomReturnDistribution.filter(r => r.cyclesActive >= 2)
  if (candidates.length === 0) {
    return silent('recurring-rooms', 'insufficient', 'no-cross-cycle-room')
  }
  // Assess against the strongest single room. If even the strongest
  // doesn't meet the room-tendency bar, this tendency is silent —
  // multiple weak rooms do not aggregate into one strong observation.
  const strongest = [...candidates].sort((a, b) => b.returns - a.returns)[0]

  const a = assess('room-tendency', {
    roomReturnsLifetime: strongest.returns,
    cyclesParticipated: strongest.cyclesActive,
    daysActive: e.daysActive,
    daysSinceLastActivity: e.daysSinceLastActivity,
    contradicts: e.contradicts,
  })

  if (!a.eligible) {
    return silent('recurring-rooms', a.confidence, a.reason)
  }

  return {
    kind: 'recurring-rooms',
    confidence: a.confidence,
    line: recurringRoomsLine(),
    reason: a.reason,
  }
}

// ── Detector 2: room-distribution ───────────────────────────────────────────
// Routes through Phase 3G `cross-room-pattern`. Requires meaningful
// engagement across multiple rooms over real time (≥6 rooms AND
// ≥56 days AND ≥3 cycles per the Phase 4A threshold amendment).
// Classifies into "gathering" (returns concentrated) vs "moving"
// (returns spread). Falls silent on ambiguity.
function detectRoomDistribution(e: IdentityEvidence): Tendency {
  const a = assess('cross-room-pattern', {
    distinctRoomsTouched: e.distinctRoomsTouched,
    cyclesParticipated: e.cyclesParticipated,
    daysActive: e.daysActive,
    daysSinceLastActivity: e.daysSinceLastActivity,
    contradicts: e.contradicts,
  })

  if (!a.eligible) {
    return silent('room-distribution', a.confidence, a.reason)
  }

  // Direction: are returns concentrated on a few rooms, or spread?
  // Concentration ratio = (sum of top-3 room returns) / (total returns).
  // > 0.8 = strongly gathered; < 0.5 = clearly moving; else ambiguous.
  const total = e.roomReturnDistribution.reduce((s, r) => s + r.returns, 0)
  if (total === 0) {
    return silent('room-distribution', 'insufficient', 'no-listen-starts')
  }
  const top3 = [...e.roomReturnDistribution]
    .sort((a1, b1) => b1.returns - a1.returns)
    .slice(0, 3)
    .reduce((s, r) => s + r.returns, 0)
  const concentration = top3 / total

  if (concentration > 0.8) {
    return {
      kind: 'room-distribution',
      confidence: a.confidence,
      line: roomDistributionGatheringLine(),
      reason: 'gathered',
    }
  }
  if (concentration < 0.5) {
    return {
      kind: 'room-distribution',
      confidence: a.confidence,
      line: roomDistributionMovingLine(),
      reason: 'moving',
    }
  }
  return silent('room-distribution', 'ambiguous', 'mixed-concentration')
}

// ── Detector 3: marking-style ───────────────────────────────────────────────
// Routes through Phase 3G `cross-room-pattern`. The pattern here is
// "across the listener's archive of moments". Requires both the
// cross-room threshold (to ensure breadth) AND ≥15 total moments
// (to make a ratio meaningful). Falls silent on ambiguity.
const MIN_MOMENTS_FOR_RATIO = 15

function detectMarkingStyle(e: IdentityEvidence): Tendency {
  if (e.totalMoments == null || e.totalMoments < MIN_MOMENTS_FOR_RATIO) {
    return silent('marking-style', 'insufficient', 'too-few-moments-for-ratio')
  }

  const a = assess('cross-room-pattern', {
    distinctRoomsTouched: e.distinctRoomsTouched,
    cyclesParticipated: e.cyclesParticipated,
    daysActive: e.daysActive,
    daysSinceLastActivity: e.daysSinceLastActivity,
    contradicts: e.contradicts,
  })

  if (!a.eligible) {
    return silent('marking-style', a.confidence, a.reason)
  }

  const reflections = e.momentsByType['reflection'] ?? 0
  const marks = e.momentsByType['mark'] ?? 0
  const total = e.totalMoments

  // Only speak when one side is clearly dominant (>50%). Anything
  // less is mixed — the listener has both habits and we say nothing.
  if (reflections / total > 0.5) {
    return {
      kind: 'marking-style',
      confidence: a.confidence,
      line: markingStyleReflectiveLine(),
      reason: 'reflection-dominant',
    }
  }
  if (marks / total > 0.5) {
    return {
      kind: 'marking-style',
      confidence: a.confidence,
      line: markingStyleBriefLine(),
      reason: 'mark-dominant',
    }
  }
  return silent('marking-style', 'ambiguous', 'no-dominant-style')
}

// ── Public detector function ────────────────────────────────────────────────
// Runs all detectors and returns the full list. Surfaces filter to
// non-null lines themselves — this function does not pre-filter, so
// callers can audit the silent tendencies in dev mode.

export function detectTendencies(evidence: IdentityEvidence): Tendency[] {
  return [
    detectRecurringRooms(evidence),
    detectRoomDistribution(evidence),
    detectMarkingStyle(evidence),
  ]
}
