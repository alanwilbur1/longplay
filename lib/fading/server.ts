'use server'

/**
 * lib/fading/server.ts — Phase 5B
 *
 * Server-action wrapper. Surfaces call this to receive the current
 * spoken fading observations for the authenticated user. Returns
 * only observations with a non-null line; silent ones are filtered
 * at this boundary.
 */

import { gatherFadingEvidence } from './aggregate'
import { detectFading } from './detectors'
import type { FadingObservation } from './types'

export async function getSpokenFadingObservations(): Promise<FadingObservation[]> {
  try {
    const evidence = await gatherFadingEvidence()
    if (!evidence) return []
    return detectFading(evidence).filter(o => o.line !== null)
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[fading/server] getSpokenFadingObservations failed:', err)
    }
    return []
  }
}
