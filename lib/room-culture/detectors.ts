/**
 * lib/room-culture/detectors.ts — Phase 4C
 *
 * Pure detector functions for room-culture observations. Each one
 * takes the aggregated RoomCultureEvidence and returns either a
 * literary line or silence (line: null).
 *
 * Three detectors only. Each gates through the Phase 3G assess()
 * framework. The thresholds are conservative — most rooms most of
 * the time will produce silence on all three.
 */

import { assess } from '@/lib/interpretation'
import {
  paceShiftQuieterLine,
  paceShiftBusierLine,
  markingCharacterReflectiveLine,
  markingCharacterBriefLine,
  returnCharacterReturningLine,
  returnCharacterPassThroughLine,
} from './language'
import type {
  RoomCultureEvidence,
  RoomObservation,
  RoomObservationKind,
} from './types'

function silent(
  kind: RoomObservationKind,
  confidence: RoomObservation['confidence'],
  reason: string,
): RoomObservation {
  return { kind, confidence, line: null, reason }
}

// ── Detector 1: pace-shift ──────────────────────────────────────────────────
// Routes through Phase 3G `room-pace-shift`. Compares average moments-
// per-cycle in the last 3 archived cycles vs earlier cycles. Direction
// is determined by the ratio: <1 means recent is quieter; >1 means
// busier. The 40% deviation gate is enforced inside the rule, so by
// the time we get here we know the direction is clear.
function detectPaceShift(e: RoomCultureEvidence): RoomObservation {
  const a = assess('room-pace-shift', {
    roomCompletedCycles: e.roomCompletedCycles,
    roomRecentToHistoricalMomentRatio: e.roomRecentToHistoricalMomentRatio,
    daysSinceLastActivity: e.daysSinceLastActivity,
    contradicts: e.contradicts,
  })

  if (!a.eligible) return silent('pace-shift', a.confidence, a.reason)

  const ratio = e.roomRecentToHistoricalMomentRatio ?? 1
  const line = ratio < 1 ? paceShiftQuieterLine() : paceShiftBusierLine()
  return { kind: 'pace-shift', confidence: a.confidence, line, reason: a.reason }
}

// ── Detector 2: marking-character ───────────────────────────────────────────
// Routes through Phase 3G `room-marking-character`. Direction comes
// from the reflection ratio: high (>50%) = reflective; low (<20%) =
// brief. Middle band is genuine mixed activity — silent.
function detectMarkingCharacter(e: RoomCultureEvidence): RoomObservation {
  const a = assess('room-marking-character', {
    roomCompletedCycles: e.roomCompletedCycles,
    roomTotalMoments: e.roomTotalMoments,
    roomReflectionRatio: e.roomReflectionRatio,
    daysSinceLastActivity: e.daysSinceLastActivity,
    contradicts: e.contradicts,
  })

  if (!a.eligible) return silent('marking-character', a.confidence, a.reason)

  const ratio = e.roomReflectionRatio ?? 0
  const line = ratio > 0.5
    ? markingCharacterReflectiveLine()
    : markingCharacterBriefLine()
  return { kind: 'marking-character', confidence: a.confidence, line, reason: a.reason }
}

// ── Detector 3: return-character ────────────────────────────────────────────
// Routes through Phase 3G `room-return-character`. Direction comes
// from the member return ratio. High (>50%) = listeners return; low
// (<20%) = attention passes through. Middle band is silent.
function detectReturnCharacter(e: RoomCultureEvidence): RoomObservation {
  const a = assess('room-return-character', {
    roomCompletedCycles: e.roomCompletedCycles,
    roomMemberReturnRatio: e.roomMemberReturnRatio,
    daysSinceLastActivity: e.daysSinceLastActivity,
    contradicts: e.contradicts,
  })

  if (!a.eligible) return silent('return-character', a.confidence, a.reason)

  const ratio = e.roomMemberReturnRatio ?? 0
  const line = ratio > 0.5
    ? returnCharacterReturningLine()
    : returnCharacterPassThroughLine()
  return { kind: 'return-character', confidence: a.confidence, line, reason: a.reason }
}

// ── Public detector function ────────────────────────────────────────────────
export function detectRoomCulture(evidence: RoomCultureEvidence): RoomObservation[] {
  return [
    detectPaceShift(evidence),
    detectMarkingCharacter(evidence),
    detectReturnCharacter(evidence),
  ]
}
