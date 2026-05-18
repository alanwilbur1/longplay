/**
 * lib/resonance/detectors.ts — Phase 4B
 *
 * Pure detectors for resonance observations. Each detector takes the
 * aggregated ResonanceEvidence and returns either a literary line or
 * silence (line: null).
 *
 * Two detectors. Resist adding more before the evidence substrate
 * matures (no view events on archived moments yet, no cross-listener
 * gravity data). The two we have are honest and conservative.
 */

import { assess } from '@/lib/interpretation'
import {
  recurringAlbumsLine,
  persistentRoomsLine,
} from './language'
import type { Resonance, ResonanceEvidence, ResonanceKind } from './types'

function silent(kind: ResonanceKind, confidence: Resonance['confidence'], reason: string): Resonance {
  return { kind, confidence, line: null, reason }
}

// ── Detector 1: album-recurrence ────────────────────────────────────────────
// Routes through Phase 3G `album-recurrence`. Triggers only when the
// listener has marked moments on the same album across ≥3 cycles with
// a time span ≥56 days. The line never names the album.

function detectAlbumRecurrence(e: ResonanceEvidence): Resonance {
  const a = assess('album-recurrence', {
    maxAlbumRecurrence: e.maxAlbumRecurrence,
    maxAlbumRecurrenceDays: e.maxAlbumRecurrenceDays,
    daysSinceLastActivity: e.daysSinceLastActivity,
    contradicts: e.contradicts,
  })

  if (!a.eligible) return silent('album-recurrence', a.confidence, a.reason)

  return {
    kind: 'album-recurrence',
    confidence: a.confidence,
    line: recurringAlbumsLine(e.recurringAlbumCount ?? 1),
    reason: a.reason,
  }
}

// ── Detector 2: room-persistence ────────────────────────────────────────────
// Routes through Phase 3G `room-persistence`. A higher bar than
// album-recurrence: ≥5 cycles AND ≥84-day span. The claim "this room
// has remained close" is structurally stronger than "this album keeps
// returning" — it requires sustained, not just repeating, attention.

function detectRoomPersistence(e: ResonanceEvidence): Resonance {
  const a = assess('room-persistence', {
    maxRoomPersistence: e.maxRoomPersistence,
    maxRoomPersistenceDays: e.maxRoomPersistenceDays,
    daysSinceLastActivity: e.daysSinceLastActivity,
    contradicts: e.contradicts,
  })

  if (!a.eligible) return silent('room-persistence', a.confidence, a.reason)

  return {
    kind: 'room-persistence',
    confidence: a.confidence,
    line: persistentRoomsLine(e.persistentRoomCount ?? 1),
    reason: a.reason,
  }
}

// ── Public detector function ────────────────────────────────────────────────
export function detectResonances(evidence: ResonanceEvidence): Resonance[] {
  return [
    detectAlbumRecurrence(evidence),
    detectRoomPersistence(evidence),
  ]
}
