/**
 * lib/memory — Phase 3F Longitudinal Memory Layer
 *
 * The first honest memory infrastructure in LongPlay. Converts real
 * behavior (moments, room entries, cycle joins) into participation
 * events the app can read as quiet observations.
 *
 * Public surface:
 *   Types:
 *     - CycleParticipation, ArchiveSpan
 *   Reads (server-side):
 *     - getMyCycleParticipation(cycleId)
 *     - getMyArchiveSpan()
 *   Writes (server actions — fire-and-forget):
 *     - recordRoomEntry(cycleId, albumId?)
 *     - recordMomentCreated({ momentId, cycleId, albumId, momentType })
 *     - recordCycleJoin(cycleId)
 *   Language (pure):
 *     - roomReturnObservation, cycleMomentObservation,
 *       archiveSpanObservation, identityTracesObservation,
 *       activeRoomMemoryLine
 *
 * All literary copy lives in lib/memory/language.ts — components must
 * not author their own memory phrases. Same discipline as lib/cadence.
 */

export type { CycleParticipation, ArchiveSpan } from './types'

export {
  getMyCycleParticipation,
  getMyArchiveSpan,
} from './read'

export {
  recordRoomEntry,
  recordMomentCreated,
  recordCycleJoin,
  type RecordResult,
  type MomentCreatedInput,
} from './record'

export {
  roomReturnObservation,
  cycleMomentObservation,
  archiveSpanObservation,
  identityTracesObservation,
  activeRoomMemoryLine,
} from './language'
