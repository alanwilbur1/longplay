import { NextResponse, type NextRequest } from 'next/server'
import { readRoomAffinityForUser } from '@/lib/actions/room-affinity'

/**
 * GET /api/room-affinity?room=<slug> — Phase 6A.8
 *
 * JSON projection of the calling user's affinity envelope for one
 * room. Mirrors /api/identity and /api/debug/recommendations: cookie-
 * aware, returns 401 when unauthenticated.
 *
 * Used by:
 *   - Operator inspection during cutover ("does this user have a
 *     fresh affinity row for this room?")
 *   - Frontend acceptance / smoke
 *   - The debug surface in IdentityProfileScreen (future)
 *
 * Thin wrapper around the server action — the envelope shape is the
 * same on both sides so there's only one place to maintain.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const slug = url.searchParams.get('room')?.trim() ?? ''
  if (!slug || slug.length > 100 || /[^a-zA-Z0-9-]/.test(slug)) {
    return NextResponse.json(
      { error: 'invalid_slug', detail: 'room must be kebab-case, ≤100 chars' },
      { status: 400 },
    )
  }
  const envelope = await readRoomAffinityForUser(slug)
  if (envelope.state === 'unauthenticated') {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }
  return NextResponse.json(envelope)
}
