import { NextResponse, type NextRequest } from 'next/server'
import { getCompatibilityWith } from '@/lib/actions/compatibility'

/**
 * GET /api/compatibility?with=<target-user-id> — Phase 6A.10
 *
 * JSON projection of the caller's compatibility envelope with the
 * target user. Mirrors /api/identity / /api/identity-history /
 * /api/room-affinity: cookie-aware, 401 on unauthenticated, soft
 * input validation, lazy recompute on cache miss.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const target = url.searchParams.get('with')?.trim() ?? ''
  if (!target) {
    return NextResponse.json(
      { error: 'missing_target', detail: 'pass ?with=<user-id>' },
      { status: 400 },
    )
  }
  const envelope = await getCompatibilityWith(target)
  if (envelope.state === 'unauthenticated') {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }
  return NextResponse.json(envelope)
}
