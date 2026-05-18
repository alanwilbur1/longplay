/**
 * lib/room-culture — Phase 4C Room Culture
 *
 * The substrate for noticing how rooms develop emotional texture
 * over time. Distinct from identity (about the listener) and
 * resonance (about what returns to a listener):
 *
 *   Room Culture: the room itself, observed collectively over many
 *                 cycles. Subject is the room. Listeners appear as
 *                 a plural collective; no individual is ever named
 *                 or exposed.
 *
 * Anonymity is structural. The aggregator returns aggregates only;
 * the language module's grammar makes the room the subject.
 *
 * Public surface:
 *
 *   Types:
 *     - RoomObservationKind, RoomObservation, RoomCultureEvidence
 *
 *   Pure helpers (testing / dev introspection):
 *     - detectRoomCulture(evidence)           all detectors, with silent
 *
 *   Server-side:
 *     - getRoomCultureObservations(id, slug)  filtered to non-null lines
 *
 *   Language:
 *     - paceShiftQuieterLine, paceShiftBusierLine
 *     - markingCharacterReflectiveLine, markingCharacterBriefLine
 *     - returnCharacterReturningLine, returnCharacterPassThroughLine
 *     - roomCultureSectionHeader, roomCultureFootnote
 */

export type {
  RoomObservationKind,
  RoomObservation,
  RoomCultureEvidence,
} from './types'

export { detectRoomCulture } from './detectors'

export { getRoomCultureObservations } from './server'

export {
  paceShiftQuieterLine,
  paceShiftBusierLine,
  markingCharacterReflectiveLine,
  markingCharacterBriefLine,
  returnCharacterReturningLine,
  returnCharacterPassThroughLine,
  roomCultureSectionHeader,
  roomCultureFootnote,
} from './language'
