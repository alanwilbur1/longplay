'use server'

/**
 * lib/identity-emergence/server.ts — Phase 4A
 *
 * Server-action surface for the identity-emergence module. The
 * identity profile screen is a client component; it calls this
 * function via useEffect to receive the current tendencies for the
 * authenticated user.
 *
 * Returns only the tendencies whose line is non-null. The full set
 * (including silent tendencies and their reasons) is available via
 * the pure detector in tendencies.ts if dev-mode introspection is
 * needed.
 */

import { gatherIdentityEvidence } from './aggregate'
import { detectTendencies } from './tendencies'
import type { Tendency } from './types'

/** Spoken tendencies for the current user. Silent tendencies are
 *  filtered out — the caller renders nothing for them. Returns an
 *  empty array on any failure or for unauthenticated callers. */
export async function getSpokenTendencies(): Promise<Tendency[]> {
  try {
    const evidence = await gatherIdentityEvidence()
    if (!evidence) return []
    return detectTendencies(evidence).filter(t => t.line !== null)
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[identity-emergence/server] getSpokenTendencies failed:', err)
    }
    return []
  }
}
