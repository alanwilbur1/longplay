import { NextResponse } from 'next/server'
import { readMyListenerIdentity } from '@/lib/actions/identity'

/**
 * GET /api/identity — Phase 6A.7
 *
 * JSON projection of the calling user's identity envelope. Mirrors
 * the auth posture of /api/debug/recommendations (and the other
 * /api/debug routes): cookie-aware, returns 401 when unauthenticated.
 *
 * Used by:
 *   - Operator manual inspection during the cutover
 *   - The future identity dev panel
 *   - Frontend acceptance tests
 *
 * Returns the same envelope readMyListenerIdentity produces — the
 * route is a thin JSON wrapper around the server action so neither
 * the action nor the route has to duplicate the projection logic.
 *
 * Surface is narrow on purpose — no aggregations, no joins beyond
 * what the action already returns. The whole envelope is per-user
 * and read through RLS.
 */
export async function GET() {
  const envelope = await readMyListenerIdentity()
  if (envelope.state === 'unauthenticated') {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }
  return NextResponse.json(envelope)
}
