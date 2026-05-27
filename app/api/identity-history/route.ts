import { NextResponse, type NextRequest } from 'next/server'
import { readMyIdentityHistory } from '@/lib/actions/identity-history'

/**
 * GET /api/identity-history?limit=<n> — Phase 6A.9
 *
 * JSON projection of the calling user's history envelope. Mirrors
 * /api/identity / /api/room-affinity auth posture: cookie-aware,
 * 401 on unauthenticated, capped limit to keep response bounded.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const rawLimit = url.searchParams.get('limit')
  const parsed = rawLimit ? Number(rawLimit) : 20
  const limit =
    Number.isFinite(parsed) && parsed > 0 && parsed <= 200
      ? Math.floor(parsed)
      : 20
  const envelope = await readMyIdentityHistory(limit)
  if (envelope.state === 'unauthenticated') {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }
  return NextResponse.json(envelope)
}
