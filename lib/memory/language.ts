/**
 * lib/memory/language.ts — Phase 3F (refactored in Phase 3G)
 *
 * Pure copy generators for memory observations. Same discipline as
 * lib/cadence/language.ts: every literary phrase the product can say
 * about a listener's history lives in one module. No phase or memory
 * copy may live in component files.
 *
 * Phase 3G refactor: threshold checks now route through the
 * interpretation framework (lib/interpretation). Each helper consults
 * `isEligible(...)` instead of inlining its own `if (n < N)` guard.
 * This makes the threshold values introspectable and centrally edited.
 *
 * Tone:
 *   - Literary, restrained, second-person where intimacy belongs.
 *   - Factual, not promotional. Never imperative.
 *   - Returns null when the data does not yet support an observation —
 *     callers should render nothing rather than apologise for the
 *     absence.
 */

import type { ArchiveSpan, CycleParticipation } from './types'
import { isEligible } from '@/lib/interpretation'

// ── Active room: returns observation ────────────────────────────────────────
// "You've returned to this room three times this cycle."
// Only fires when the count is meaningful (≥ 2). One return is just being
// here; two starts to mean something.

const RETURN_WORDS = ['', '', 'twice', 'three times', 'four times', 'five times', 'six times', 'seven times']

export function roomReturnObservation(returnCount: number): string | null {
  if (!Number.isFinite(returnCount)) return null
  if (!isEligible('cycle-return-count', { cycleReturnCount: returnCount })) return null
  if (returnCount < RETURN_WORDS.length) {
    return `You've returned to this room ${RETURN_WORDS[returnCount]} this cycle.`
  }
  if (returnCount <= 12) {
    return `You've returned to this room ${returnCount} times this cycle.`
  }
  return "You've returned to this room many times this cycle."
}

// ── Active room: cycle-moments observation ──────────────────────────────────
// "Two moments are beginning to mark this room for you."
// Personal, never gamified. "Beginning to mark" is the spec's phrasing.

export function cycleMomentObservation(momentCount: number): string | null {
  if (!Number.isFinite(momentCount)) return null
  if (!isEligible('cycle-moment-count', { cycleMomentCount: momentCount })) return null
  if (momentCount === 1) {
    return 'One moment is beginning to mark this room for you.'
  }
  if (momentCount === 2) {
    return 'Two moments are beginning to mark this room for you.'
  }
  if (momentCount <= 8) {
    return `${momentCount} moments are marking this room for you.`
  }
  return 'Several moments are marking this room for you.'
}

// ── Archive: span observation ──────────────────────────────────────────────
// Used by /archive (and /listening-life alias). When the archive has at
// least one moment, surface the literal first/last dates as a quiet
// timespan. When it has none, surface the patient "still quiet" line.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function archiveSpanObservation(span: ArchiveSpan): string {
  // The archive-timespan rule requires >=1 moment for the literal-span
  // branch. Zero-state is also a literary line, returned by this
  // helper for callers that always render something.
  if (!isEligible('archive-timespan', { totalMoments: span.totalMoments })) {
    return 'Your archive is still quiet. It begins the first time you mark something.'
  }
  if (span.totalMoments === 1 && span.firstMomentAt) {
    return `Your archive has begun. The first mark was on ${formatDate(span.firstMomentAt)}.`
  }
  if (span.firstMomentAt && span.lastMomentAt) {
    if (span.firstMomentAt === span.lastMomentAt) {
      return `Your archive holds ${span.totalMoments} moments, all from ${formatDate(span.firstMomentAt)}.`
    }
    return `Your archive holds ${span.totalMoments} moments, from ${formatDate(span.firstMomentAt)} to ${formatDate(span.lastMomentAt)}.`
  }
  return `Your archive holds ${span.totalMoments} moments so far.`
}

// ── Identity: real-traces observation ───────────────────────────────────────
// Sits below the "still forming" framing on /identity. A single factual
// line counting participation events. No inference, no claims of
// emotional patterns — just the count of real listening traces.

export function identityTracesObservation(eventCount: number): string {
  // archive-trace-count tolerates zero (the zero state is itself an
  // honest literary line). We assess only to keep the threshold
  // logic centralized and to receive the (future) dormant signal
  // when one is added to evidence.
  if (!Number.isFinite(eventCount) || eventCount <= 0) {
    // assess() is informational here; eligibility doesn't gate the
    // zero-state line — it's the honest reading of zero data.
    return 'No real listening traces yet.'
  }
  if (eventCount === 1) {
    return 'One listening trace so far.'
  }
  if (eventCount < 10) {
    return `${eventCount} listening traces so far.`
  }
  if (eventCount < 50) {
    return 'Dozens of listening traces so far.'
  }
  if (eventCount < 200) {
    return 'Many listening traces so far.'
  }
  return 'Hundreds of listening traces so far.'
}

// ── Combined: active-room memory line ───────────────────────────────────────
// The active room shows at most ONE memory observation, never both at
// the same time. Returns/moments are different axes; surfacing both
// would feel like a dashboard. This helper picks the more meaningful
// line for the current state.

export function activeRoomMemoryLine(participation: CycleParticipation): string | null {
  // Prefer the moment observation when the listener has been making
  // marks — that's the more durable signal of presence.
  const momentLine = cycleMomentObservation(participation.momentCount)
  if (momentLine) return momentLine
  // Otherwise surface the return observation if it's meaningful.
  return roomReturnObservation(participation.returnCount)
}
