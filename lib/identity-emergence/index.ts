/**
 * lib/identity-emergence — Phase 4A Identity Emergence
 *
 * The first time the system is permitted to *notice* (never claim)
 * patterns in a listener's longitudinal behavior. Every tendency:
 *   - is gated through the Phase 3G assess() framework
 *   - is observable from real data (no inference of unobserved traits)
 *   - returns either a literary line or silence (null)
 *   - never names specific rooms, albums, curators, or other listeners
 *   - never assigns a personality label
 *
 * Public surface:
 *
 *   Types:
 *     - TendencyKind, Tendency, IdentityEvidence, RoomReturnRecord
 *
 *   Pure helpers (for testing / dev introspection):
 *     - detectTendencies(evidence)         all detectors, including silent
 *
 *   Server-action (for UI consumption):
 *     - getSpokenTendencies()              filtered to non-null lines
 *
 *   Language (literary copy):
 *     - recurringRoomsLine
 *     - roomDistributionGatheringLine / roomDistributionMovingLine
 *     - markingStyleReflectiveLine / markingStyleBriefLine
 *     - emergenceFootnote
 *
 * The aggregator (aggregate.ts) lives behind the server-action; it is
 * not part of the public surface because it uses the request-scoped
 * Supabase server client.
 */

export type {
  TendencyKind,
  Tendency,
  IdentityEvidence,
  RoomReturnRecord,
} from './types'

export { detectTendencies } from './tendencies'

export { getSpokenTendencies } from './server'

export {
  recurringRoomsLine,
  roomDistributionGatheringLine,
  roomDistributionMovingLine,
  markingStyleReflectiveLine,
  markingStyleBriefLine,
  emergenceFootnote,
} from './language'
