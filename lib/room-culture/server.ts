/**
 * lib/room-culture/server.ts — Phase 4C
 *
 * Server helpers for room culture observations. Unlike the per-user
 * server modules in identity-emergence and resonance, room culture
 * is keyed on the room — it returns the same data for any viewer of
 * a given room (anonymity is preserved BY DESIGN: the data is
 * aggregate, the viewer is incidental). Server components on the
 * room profile page can call this directly.
 */

import { gatherRoomCultureEvidence } from './aggregate'
import { detectRoomCulture } from './detectors'
import type { RoomObservation } from './types'

/** Spoken observations for a given room (looked up by slug). Silent
 *  ones are filtered out at this boundary. Returns empty array for
 *  unknown rooms or on any read failure. */
export async function getRoomCultureObservations(
  roomSlug: string,
): Promise<RoomObservation[]> {
  try {
    const evidence = await gatherRoomCultureEvidence(roomSlug)
    if (!evidence) return []
    return detectRoomCulture(evidence).filter(o => o.line !== null)
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[room-culture/server] getRoomCultureObservations failed:', err)
    }
    return []
  }
}
