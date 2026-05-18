/**
 * lib/interpretation/types.ts — Phase 3G Interpretive Restraint Layer
 *
 * The internal epistemic vocabulary that gates every observation the
 * product will ever make about a listener. Surfaces never see these
 * type names; they receive an Assessment and render (or stay silent)
 * accordingly.
 *
 * The framework's job is to make restraint the structurally easier
 * path. A future inference module that wants to surface a tendency
 * must justify itself through `assess(kind, evidence)` and accept
 * the answer it gets back.
 */

// ── Confidence: internal epistemic state ─────────────────────────────────────
// Never a user-facing label. Composable across observation kinds.
//
// The ordering below is meaningful: each higher level subsumes the
// trustworthiness of those below it.
export type Confidence =
  | 'insufficient'         // The data does not yet support any claim.
  | 'weak-signal'          // A faint signal exists but is not stable.
  | 'emerging-pattern'     // Recurrence visible; not yet a tendency.
  | 'recurring-tendency'   // The pattern has held across cycles.
  | 'strong-longitudinal'  // The pattern is stable across many cycles.
  | 'contradictory'        // Signals oppose; the system should not interpret.
  | 'dormant'              // Listener absent long enough that prior signals are stale.
  | 'ambiguous'            // Signals present but multivalent; do not interpret.

// Confidence levels that *permit* a fact to be restated (lower bar).
export const FACT_MIN_CONFIDENCE: Confidence = 'weak-signal'

// Confidence levels that *permit* an interpretation (higher bar).
export const INTERPRETATION_MIN_CONFIDENCE: Confidence = 'recurring-tendency'

// ── Observation kinds ────────────────────────────────────────────────────────
// Two categories with different epistemic bars.

/** FACTS: restate data that exists. Eligible at lower confidence. */
export type FactKind =
  | 'cycle-moment-count'        // "N moments in this cycle"
  | 'cycle-return-count'        // "returned N times this cycle"
  | 'archive-timespan'          // "from {first} to {last}"
  | 'archive-trace-count'       // "N listening traces"

/** INTERPRETATIONS: claim a pattern or meaning. Require strong evidence. */
export type InterpretationKind =
  | 'room-tendency'             // "tends to return to this room"
  | 'cross-room-pattern'        // "favours rooms with X atmosphere"
  | 'temporal-pattern'          // "listens most after midnight"
  | 'identity-trait'            // "drawn to restraint" — deferred indefinitely
  | 'compatibility-observation' // "shares gravitational pull with X" — deferred indefinitely
  | 'resurfacing-candidate'     // "this passage still resonates"
  | 'room-culture-evolution'    // "this room has become more reflective"
  | 'album-recurrence'          // Phase 4B — "an album keeps returning across cycles"
  | 'room-persistence'          // Phase 4B — "this room has remained close to listening life"

export type ObservationKind = FactKind | InterpretationKind

// ── Evidence: the unified shape consumed by every assessment ────────────────
// Optional fields throughout. Callers populate what they have; rules
// require what they need and return `insufficient` when fields are
// missing. This avoids per-kind evidence shapes while keeping each
// rule explicit about its inputs.

export interface Evidence {
  // Time-based
  /** Days since the user's first recorded event. */
  daysActive?: number
  /** Days since the user's most recent recorded activity. */
  daysSinceLastActivity?: number

  // All-time volume
  totalMoments?: number
  totalEvents?: number
  /** Number of distinct cycles the user has participated in. */
  cyclesParticipated?: number

  // Longitudinal continuity
  /** Longest consecutive run of active cycles. */
  consecutiveActiveCycles?: number
  /** Total cycles the platform has observed for this user (whether they participated or not). */
  totalCyclesObservedSoFar?: number

  // Cycle-scoped
  cycleMomentCount?: number
  cycleReturnCount?: number

  // Room-scoped
  roomReturnsThisCycle?: number
  roomReturnsLifetime?: number
  distinctRoomsTouched?: number

  // Future / cross-listener
  connectionCount?: number

  // ── Resonance signals (Phase 4B) ──────────────────────────────────────────
  // Aggregated from the user's moments joined to cycles. Each pair
  // (count + span) captures both "how many cycles" and "how spread
  // out in time" — the time-spread guard prevents a single-week binge
  // from reading as recurrence.

  /** Maximum number of distinct cycles ANY single album has moments in. */
  maxAlbumRecurrence?: number
  /** Span (in days) between earliest and latest cycle of the
   *  most-recurrent album. */
  maxAlbumRecurrenceDays?: number
  /** Maximum number of distinct cycles ANY single room has user-moments in. */
  maxRoomPersistence?: number
  /** Span (in days) between earliest and latest cycle of the
   *  most-persistent room. */
  maxRoomPersistenceDays?: number
  /** Count of albums that meet the album-recurrence threshold. */
  recurringAlbumCount?: number
  /** Count of rooms that meet the room-persistence threshold. */
  persistentRoomCount?: number

  // Variance / contradiction signal — populated by future analyses
  /** True when the most recent signals contradict earlier patterns. */
  contradicts?: boolean
}

// ── Assessment: the return shape of every gatekeeper call ───────────────────
export interface Assessment {
  /** Internal confidence label. Not user-facing. */
  confidence: Confidence

  /** Whether the surface is permitted to publish the observation. */
  eligible: boolean

  /** Short machine-readable reason. Used for telemetry / audit logs / dev mode.
   *  e.g. 'too-few-moments', 'needs-cross-cycle', 'deferred'. */
  reason: string

  /** Optional human-readable hint for surfaces that want to render an
   *  uncertainty line in place of silence. The default behavior is
   *  silence — surfaces opt in to soft language by passing this string
   *  to language helpers. */
  hint?: string
}

// ── Threshold rule shape ────────────────────────────────────────────────────
// Each ObservationKind has exactly one rule. The rule is a pure
// function: given evidence, return an Assessment. Rules live in
// lib/interpretation/thresholds.ts and are the only place a threshold
// value should appear in the codebase.
export type ThresholdRule = (evidence: Evidence) => Assessment
