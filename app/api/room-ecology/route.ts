import { NextResponse, type NextRequest } from 'next/server'
import { readRoomEcology, readRoomAdjacency } from '@/lib/actions/room-ecology'

/**
 * GET /api/room-ecology?room=<slug>[&adjacency=4] — Phase 6A.11
 *
 * JSON projection of a room's ecology + adjacency. No auth gate —
 * room ecology is public-readable (room-scoped, not user-scoped),
 * same as the rooms catalog.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const slug = url.searchParams.get('room')?.trim() ?? ''
  if (!slug) {
    return NextResponse.json(
      { error: 'missing_room', detail: 'pass ?room=<slug>' },
      { status: 400 },
    )
  }
  const adjacencyLimitRaw = url.searchParams.get('adjacency')
  const adjacencyLimit = adjacencyLimitRaw ? Number(adjacencyLimitRaw) : 4
  const adjacencyLimitParsed =
    Number.isFinite(adjacencyLimit) && adjacencyLimit > 0 && adjacencyLimit <= 20
      ? Math.floor(adjacencyLimit)
      : 4

  const [ecology, adjacency] = await Promise.all([
    readRoomEcology(slug),
    readRoomAdjacency(slug, adjacencyLimitParsed),
  ])
  return NextResponse.json({ ecology, adjacency })
}
