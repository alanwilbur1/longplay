/**
 * lib/fading/detectors.ts — Phase 5B
 *
 * Pure detectors. Each takes FadingEvidence and returns a
 * FadingObservation: either a literary line or silence. Each gates
 * through Phase 3G assess(). No detector overlaps another in scope:
 *
 *   archive-softening   — the WHOLE archive has settled with age
 *   persistent-traces   — SPECIFIC moments have survived long arcs
 *   room-drift          — SPECIFIC rooms have gone quiet for the user
 *
 * The selector pattern (Phase 5A continuity) is NOT used here.
 * Multiple fading observations can coexist on the archive surface
 * because they describe orthogonal axes of fading.
 */

import { assess } from '@/lib/interpretation'
import {
  archiveSofteningLine,
  persistentTracesLine,
  roomDriftLine,
} from './language'
import type { FadingEvidence, FadingObservation, FadingState } from './types'

function silent(
  state: FadingState,
  confidence: FadingObservation['confidence'],
  reason: string,
): FadingObservation {
  return { state, confidence, line: null, reason }
}

// ── Detector 1: archive-softening ───────────────────────────────────────────
// Routes through Phase 3G `archive-softening`. The whole archive has
// settled when there's meaningful history, much of it is old, and
// recent activity has gone quiet. All three conditions must hold —
// each alone is something else (history, recency).
function detectArchiveSoftening(e: FadingEvidence): FadingObservation {
  const a = assess('archive-softening', {
    fadingTotalMoments: e.totalMoments,
    totalMoments: e.totalMoments,
    fadingOldMomentCount: e.oldMomentCount,
    daysSinceLastActivity: e.daysSinceLastActivity,
    contradicts: e.contradicts,
  })

  if (!a.eligible) return silent('archive-softening', a.confidence, a.reason)

  return {
    state: 'archive-softening',
    confidence: a.confidence,
    line: archiveSofteningLine(),
    reason: a.reason,
  }
}

// ── Detector 2: persistent-traces ───────────────────────────────────────────
// Routes through Phase 3G `persistent-traces`. Fires when ≥3 moments
// in the user's archive are both old (≥60 days) AND have continued
// album-relevance (a same-album moment in a cycle ≥30 days later).
// This is the strongest temporal claim the system makes.
function detectPersistentTraces(e: FadingEvidence): FadingObservation {
  const a = assess('persistent-traces', {
    fadingPersistentMomentCount: e.persistentMomentCount,
    daysSinceLastActivity: e.daysSinceLastActivity,
    contradicts: e.contradicts,
  })

  if (!a.eligible) return silent('persistent-traces', a.confidence, a.reason)

  return {
    state: 'persistent-traces',
    confidence: a.confidence,
    line: persistentTracesLine(),
    reason: a.reason,
  }
}

// ── Detector 3: room-drift ──────────────────────────────────────────────────
// Routes through Phase 3G `room-drift`. Fires when ≥1 room shows
// investment (span ≥30 days) AND stepping-away (most recent ≥21
// days ago). Phrased to honor the natural rhythm — drift is not
// failure.
function detectRoomDrift(e: FadingEvidence): FadingObservation {
  const a = assess('room-drift', {
    fadingDriftedRoomCount: e.driftedRoomCount,
    daysSinceLastActivity: e.daysSinceLastActivity,
    contradicts: e.contradicts,
  })

  if (!a.eligible) return silent('room-drift', a.confidence, a.reason)

  return {
    state: 'room-drift',
    confidence: a.confidence,
    line: roomDriftLine(e.driftedRoomCount),
    reason: a.reason,
  }
}

// ── Public detector function ────────────────────────────────────────────────
export function detectFading(evidence: FadingEvidence): FadingObservation[] {
  return [
    detectArchiveSoftening(evidence),
    detectPersistentTraces(evidence),
    detectRoomDrift(evidence),
  ]
}
