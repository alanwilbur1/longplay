/**
 * lib/resonance — Phase 4B Resonance & Return
 *
 * The substrate for noticing what continues returning to a listener
 * across cycles. Distinct from identity (which observes the listener)
 * and from memory (which restates facts). Each resonance:
 *   - routes through Phase 3G assess()
 *   - requires multi-cycle evidence AND substantial time spread
 *   - never names specific rooms, albums, curators, or listeners
 *   - defaults to silence
 *
 * Public surface:
 *
 *   Types:
 *     - ResonanceKind, Resonance, ResonanceEvidence,
 *       AlbumRecurrenceRecord, RoomPersistenceRecord
 *
 *   Pure helpers (for testing / dev introspection):
 *     - detectResonances(evidence)         all detectors, including silent
 *
 *   Server-action (for UI consumption):
 *     - getSpokenResonances()              filtered to non-null lines
 *
 *   Language:
 *     - recurringAlbumsLine, persistentRoomsLine
 *     - resonanceSectionHeader, resonanceFootnote
 */

export type {
  ResonanceKind,
  Resonance,
  ResonanceEvidence,
  AlbumRecurrenceRecord,
  RoomPersistenceRecord,
} from './types'

export { detectResonances } from './detectors'

export { getSpokenResonances } from './server'

export {
  recurringAlbumsLine,
  persistentRoomsLine,
  resonanceSectionHeader,
  resonanceFootnote,
} from './language'
