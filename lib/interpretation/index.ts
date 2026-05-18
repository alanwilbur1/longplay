/**
 * lib/interpretation — Phase 3G Interpretive Restraint Layer
 *
 * The gatekeeper between data and meaning. Every observation the
 * product surfaces about a listener — fact or interpretation — passes
 * through `assess(kind, evidence)`. The framework decides whether the
 * surface may speak.
 *
 * Public surface:
 *
 *   Types:
 *     - Confidence, Evidence, Assessment, ObservationKind,
 *       FactKind, InterpretationKind, ThresholdRule
 *
 *   The gatekeeper:
 *     - assess(kind, evidence)               returns Assessment
 *     - isEligible(kind, evidence)           sugar
 *     - isFactKind(kind), isInterpretationKind(kind)
 *
 *   The rules (read-only export):
 *     - RULES (the complete threshold table)
 *
 *   Uncertainty language:
 *     - insufficientEvidenceLine, dormantLine, contradictoryLine,
 *       emergingPatternLine, recurringTendencyLine,
 *       strongLongitudinalLine, timeStillPassingLine,
 *       phraseForConfidence
 *
 * Composition principles (read this before adding a new surface):
 *
 *   1. Default to silence. If `assess(...).eligible === false`, render
 *      nothing. No skeleton, no apology, no "still forming" copy.
 *
 *   2. Facts can speak at weak signal; interpretations may not.
 *      The FactKind / InterpretationKind distinction is enforced by
 *      the rules themselves, not by callers.
 *
 *   3. Never display the confidence label or the reason string to a
 *      user. They are internal. Telemetry / dev-mode debug only.
 *
 *   4. Adding a new observation kind requires adding a rule. The rule
 *      should default conservative ('insufficient' or higher minimum).
 *
 *   5. Do not introduce a second threshold mechanism elsewhere in the
 *      codebase. Memory's existing inline `if (n < 2)` checks were
 *      refactored to consume this module — no new ad-hoc gating.
 */

export type {
  Confidence,
  Evidence,
  Assessment,
  ObservationKind,
  FactKind,
  InterpretationKind,
  ThresholdRule,
} from './types'

export {
  FACT_MIN_CONFIDENCE,
  INTERPRETATION_MIN_CONFIDENCE,
} from './types'

export { RULES } from './thresholds'

export {
  assess,
  isEligible,
  isFactKind,
  isInterpretationKind,
} from './assess'

export {
  insufficientEvidenceLine,
  timeStillPassingLine,
  dormantLine,
  contradictoryLine,
  emergingPatternLine,
  recurringTendencyLine,
  strongLongitudinalLine,
  phraseForConfidence,
} from './language'
