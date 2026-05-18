/**
 * lib/interpretation/thresholds.ts — Phase 3G
 *
 * The complete table of eligibility rules. ONE rule per ObservationKind.
 * No threshold value may appear anywhere else in the codebase.
 *
 * Each rule is a pure function (Evidence → Assessment). Reading this
 * file should answer the question "when is the system allowed to say
 * X?" for every X the product can currently or eventually surface.
 *
 * Discipline: rules default to insufficient. Bump a threshold up is
 * cheap; bump it down requires a deliberate edit here.
 *
 * Two structural defenses against drift:
 *   - The two `*-trait` and `compatibility-*` rules ALWAYS return
 *     `insufficient` regardless of evidence. They are wired in so
 *     future surfaces can call them, but their bar cannot be lowered
 *     without rewriting this file. Until the inference engine exists,
 *     these stay silent.
 *   - The dormancy and contradiction signals demote eligibility for
 *     all kinds, including facts. A listener absent for 60+ days has
 *     accumulated facts; those facts can still be restated, but the
 *     framework downgrades confidence to `dormant` so future surfaces
 *     can choose softer language.
 */

import type {
  Evidence,
  ObservationKind,
  ThresholdRule,
  Assessment,
} from './types'

// ── Helpers ──────────────────────────────────────────────────────────────────

const DORMANT_DAYS = 60

function isDormant(e: Evidence): boolean {
  return (e.daysSinceLastActivity ?? 0) >= DORMANT_DAYS
}

function makeAssessment(
  confidence: Assessment['confidence'],
  eligible: boolean,
  reason: string,
  hint?: string,
): Assessment {
  return { confidence, eligible, reason, hint }
}

// ── FACTS ───────────────────────────────────────────────────────────────────
// Eligible at lower confidence because the data exists and is being
// restated, not interpreted. Each rule still gates the minimum count
// needed for the fact to be worth surfacing at all.

const cycleMomentCountRule: ThresholdRule = (e) => {
  const n = e.cycleMomentCount ?? 0
  if (n < 1) return makeAssessment('insufficient', false, 'no-moments-this-cycle')
  if (isDormant(e)) return makeAssessment('dormant', true, 'dormant-listener', 'time-passed')
  return makeAssessment('emerging-pattern', true, 'count-available')
}

const cycleReturnCountRule: ThresholdRule = (e) => {
  // One return is "just being here". Two returns starts to mean
  // something. Spec: "one room preference means nothing".
  const n = e.cycleReturnCount ?? e.roomReturnsThisCycle ?? 0
  if (n < 2) return makeAssessment('insufficient', false, 'too-few-returns')
  if (isDormant(e)) return makeAssessment('dormant', true, 'dormant-listener', 'time-passed')
  return makeAssessment('emerging-pattern', true, 'returns-recurring')
}

const archiveTimespanRule: ThresholdRule = (e) => {
  if ((e.totalMoments ?? 0) < 1) return makeAssessment('insufficient', false, 'no-archive-yet')
  return makeAssessment('weak-signal', true, 'archive-has-marks')
}

const archiveTraceCountRule: ThresholdRule = (e) => {
  // The "traces" line is allowed even at zero — the zero state is
  // its own honest line. The rule reports confidence so future
  // surfaces can decide how to render.
  const n = e.totalEvents ?? 0
  if (n === 0) return makeAssessment('insufficient', true, 'no-traces-yet')
  if (n < 10) return makeAssessment('weak-signal', true, 'few-traces')
  if (n < 50) return makeAssessment('emerging-pattern', true, 'traces-accumulating')
  return makeAssessment('recurring-tendency', true, 'archive-accumulating')
}

// ── INTERPRETATIONS ─────────────────────────────────────────────────────────
// Require strong evidence: multiple cycles, repetition, longitudinal
// consistency. The default is silence. Lifting these thresholds
// requires editing this file.

const roomTendencyRule: ThresholdRule = (e) => {
  // A "tendency" for a room requires the user to have returned across
  // cycle boundaries — within a single cycle is just engagement.
  // Conservative gate: at least 5 lifetime returns AND at least 2
  // distinct cycles participated in.
  const lifetime = e.roomReturnsLifetime ?? 0
  const cycles = e.cyclesParticipated ?? 0
  if (lifetime < 5 || cycles < 2) return makeAssessment('insufficient', false, 'cross-cycle-required')
  if (e.contradicts) return makeAssessment('contradictory', false, 'signals-conflict')
  if (isDormant(e)) return makeAssessment('dormant', false, 'listener-absent')
  if (lifetime < 10 || cycles < 3) return makeAssessment('emerging-pattern', false, 'too-faint-still')
  return makeAssessment('recurring-tendency', true, 'cross-cycle-recurrence')
}

const crossRoomPatternRule: ThresholdRule = (e) => {
  // Cross-room patterns ("favours rooms with X atmosphere", "your
  // listening is moving across rooms") require the user to have
  // meaningfully engaged with multiple rooms over real time. The bar
  // is intentionally high.
  //
  // Phase 4A amendment: escalates to recurring-tendency (the
  // interpretation eligibility floor) only when evidence is strong:
  // ≥6 distinct rooms AND ≥56 days active AND ≥3 cycles. Below that
  // the rule still returns emerging-pattern, which surfaces stay
  // silent on (the framework default).
  const rooms = e.distinctRoomsTouched ?? 0
  const days = e.daysActive ?? 0
  const cycles = e.cyclesParticipated ?? 0
  if (rooms < 3 || days < 28) return makeAssessment('insufficient', false, 'too-few-rooms-or-time')
  if (e.contradicts) return makeAssessment('contradictory', false, 'signals-conflict')
  if (isDormant(e)) return makeAssessment('dormant', false, 'listener-absent')
  if (rooms >= 6 && days >= 56 && cycles >= 3) {
    return makeAssessment('recurring-tendency', true, 'strong-cross-room-evidence')
  }
  return makeAssessment('emerging-pattern', false, 'pattern-faint')
}

const temporalPatternRule: ThresholdRule = (e) => {
  // Time-of-day patterns ("listens after midnight") need enough
  // events for the distribution to be meaningful AND multi-cycle
  // continuity so single-week binges don't read as habits.
  const events = e.totalEvents ?? 0
  const cycles = e.cyclesParticipated ?? 0
  if (events < 10 || cycles < 2) return makeAssessment('insufficient', false, 'too-few-events-or-cycles')
  if (e.contradicts) return makeAssessment('contradictory', false, 'signals-conflict')
  if (isDormant(e)) return makeAssessment('dormant', false, 'listener-absent')
  if (events < 30 || cycles < 4) return makeAssessment('emerging-pattern', false, 'pattern-faint')
  return makeAssessment('recurring-tendency', true, 'temporal-consistency')
}

// Identity traits and compatibility observations are intentionally
// hardwired to insufficient. The infrastructure exists so future
// surfaces can call them; the bar is set so they always stay silent
// until the inference engine lands. This is the structural defense
// against premature surfacing.
const identityTraitRule: ThresholdRule = (_e) =>
  makeAssessment('insufficient', false, 'inference-engine-not-built')

const compatibilityObservationRule: ThresholdRule = (e) => {
  const connections = e.connectionCount ?? 0
  if (connections < 1) return makeAssessment('insufficient', false, 'no-connections')
  // Even with connections, this remains deferred until the comparison
  // engine exists.
  return makeAssessment('insufficient', false, 'comparison-engine-not-built')
}

const resurfacingCandidateRule: ThresholdRule = (e) => {
  // A moment "still resonating" implies time has passed (otherwise
  // it's just a recent moment). Conservative bar: a moment older
  // than 30 days, and the listener still active (not dormant).
  if ((e.totalMoments ?? 0) < 5) return makeAssessment('insufficient', false, 'archive-too-small')
  if (isDormant(e)) return makeAssessment('dormant', false, 'listener-absent')
  // The actual "is this moment a candidate?" requires per-moment
  // age data the framework can't see at this level; this rule
  // guards the *capability* — the surface still has to do its own
  // per-candidate filtering.
  return makeAssessment('weak-signal', false, 'surface-must-filter')
}

const roomCultureEvolutionRule: ThresholdRule = (e) => {
  // Claims about how a room itself has changed need many cycles of
  // observation. Conservative gate to prevent the "this room has
  // become more reflective lately" pattern.
  const cycles = e.totalCyclesObservedSoFar ?? 0
  if (cycles < 8) return makeAssessment('insufficient', false, 'too-few-cycles-observed')
  if (e.contradicts) return makeAssessment('contradictory', false, 'signals-conflict')
  return makeAssessment('emerging-pattern', false, 'evolution-faint')
}

// ── Rule table ──────────────────────────────────────────────────────────────

export const RULES: Record<ObservationKind, ThresholdRule> = {
  // Facts
  'cycle-moment-count': cycleMomentCountRule,
  'cycle-return-count': cycleReturnCountRule,
  'archive-timespan': archiveTimespanRule,
  'archive-trace-count': archiveTraceCountRule,
  // Interpretations
  'room-tendency': roomTendencyRule,
  'cross-room-pattern': crossRoomPatternRule,
  'temporal-pattern': temporalPatternRule,
  'identity-trait': identityTraitRule,
  'compatibility-observation': compatibilityObservationRule,
  'resurfacing-candidate': resurfacingCandidateRule,
  'room-culture-evolution': roomCultureEvolutionRule,
}
