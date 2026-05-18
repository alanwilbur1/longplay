'use server'

/**
 * lib/resonance/server.ts — Phase 4B
 *
 * Server-action surface for the resonance module. The archive page
 * and other surfaces call this to receive the current resonances
 * for the authenticated user. Returns only spoken (line !== null)
 * resonances; silent ones are filtered out at this boundary.
 */

import { gatherResonanceEvidence } from './aggregate'
import { detectResonances } from './detectors'
import type { Resonance } from './types'

export async function getSpokenResonances(): Promise<Resonance[]> {
  try {
    const evidence = await gatherResonanceEvidence()
    if (!evidence) return []
    return detectResonances(evidence).filter(r => r.line !== null)
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[resonance/server] getSpokenResonances failed:', err)
    }
    return []
  }
}
