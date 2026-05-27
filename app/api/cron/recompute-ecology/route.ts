import { NextResponse, type NextRequest } from 'next/server'
import { recomputeRoomEcology } from '@/lib/ecology/recompute'
import { validateCronAuth } from '@/lib/streaming/scheduler-logic'

/**
 * /api/cron/recompute-ecology — Phase 6A.11
 *
 * Daily room ecology + adjacency rebuild. Authenticated via
 * Authorization: Bearer ${CRON_SECRET} (same posture as
 * /api/cron/sync-listening). Vercel Cron invokes via the schedule
 * declared in vercel.json.
 *
 * No per-user work in this route — recomputeRoomEcology iterates
 * all public rooms + bulk-loads active-listener envelopes. Cost is
 * O(rooms × listeners) reads + O(rooms²) adjacency writes,
 * bounded by the size of the rooms catalog.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'cron_secret_unset' },
      { status: 503 },
    )
  }
  const auth = request.headers.get('authorization')
  if (!validateCronAuth(auth, secret)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    )
  }
  try {
    const result = await recomputeRoomEcology()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (process.env.NODE_ENV !== 'production') {
      console.error('[cron/recompute-ecology] failed', { message })
    }
    return NextResponse.json(
      { ok: false, error: 'recompute_threw', message: message.slice(0, 200) },
      { status: 500 },
    )
  }
}
