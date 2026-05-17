/**
 * lib/cadence — Phase 3C.1 Ritual Cadence Engine
 *
 * The listener-side rhythm of the week. Distinct from cycle phase
 * (room-side, per-room) — see lib/weekly-cadence.ts for that older
 * concern, which 3C does NOT touch.
 *
 * Public surface:
 *   - getCurrentRitualPhase()  — pure, server-safe
 *   - getRitualPhaseForDay()   — pure, day-specific
 *   - useRitualPhase()         — client hook with midnight refresh
 *   - roomToneLine(), emptyStateLine(), presenceFraming(),
 *     ritualPrompt(), ritualObservation(), ritualTitle()
 *                              — all phase-driven copy lives here
 *
 * Components MUST consume copy through these helpers. Do not embed
 * phase-derived strings directly — it scatters tone across the codebase.
 */

export type {
  RitualPhase,
  RitualPhaseInfo,
  EmotionalTone,
  ListeningBehavior,
  SpacingRhythm,
} from './types'

export { PHASE_DEFINITIONS } from './phases'

export {
  getCurrentRitualPhase,
  getRitualPhaseForDay,
  msUntilNextDayBoundary,
} from './resolve'

export {
  roomToneLine,
  emptyStateLine,
  presenceFraming,
  ritualPrompt,
  ritualObservation,
  ritualTitle,
} from './language'

export type { EmptyStateSurface } from './language'

export { useRitualPhase } from './use-ritual-phase'
