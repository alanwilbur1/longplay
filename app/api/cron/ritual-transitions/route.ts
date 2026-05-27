import { NextResponse, type NextRequest } from 'next/server'
import { transitionRitualCycles } from '@/lib/ritual/cycles'
import { validateCronAuth } from '@/lib/streaming/scheduler-logic'

/**
 * /api/cron/ritual-transitions — Phase 6B.2
 *
 * Vercel Cron entry point for the ritual cadence sweep. Mirrors the
 * security + observability posture of /api/cron/sync-listening.
 *
 * What it does
 *   Invokes lib/ritual/cycles.ts:transitionRitualCycles() which
 *   walks every cycle currently in upcoming/active/reflection,
 *   compares the persisted cycle_status to the clock-derived one,
 *   and advances any that are stale (archive-first, promote-second
 *   so the per-room "one live cycle" partial unique index never
 *   conflicts).
 *
 * Idempotency
 *   Running this twice in quick succession is a no-op the second
 *   time. The sweep only writes when a cycle's persisted status
 *   has actually drifted from the time-derived status.
 *
 * Auth
 *   Same posture as the existing crons: CRON_SECRET env var must
 *   be set (otherwise 503); Authorization header must be
 *   `Bearer <CRON_SECRET>` via constant-time compare. Manual
 *   operator hits work the same way.
 *
 * Frequency
 *   Configured in vercel.json. Suggested floor: every 15 minutes.
 *   Cycles transition at hour boundaries (typically), so a 15-min
 *   sweep keeps the materialized status within ~15 min of clock
 *   truth — fine for ritual UX where deadlines are day-scale.
 *
 *   Note for Hobby-plan operators: Vercel Hobby caps at 2 cron
 *   jobs. If you're at the cap, either upgrade or call
 *   transitionRitualCycles() inline at the end of one of your
 *   existing crons. The route below remains usable from a manual
 *   curl hit for diagnostics regardless.
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
    const result = await transitionRitualCycles()
    // Operational logging — gives the audit row some shape without
    // needing to spelunk Postgres for each tick. Errors land here;
    // the route itself still returns 200 with structured results so
    // Vercel doesn't mark the cron unhealthy on per-cycle hiccups.
    if (result.errors.length > 0) {
      console.warn('[cron/ritual-transitions] per-cycle errors', {
        scanned: result.scanned,
        advanced: result.advanced,
        archived: result.archived,
        error_count: result.errors.length,
        first_error: result.errors[0],
      })
    } else {
      console.log('[cron/ritual-transitions] sweep complete', {
        scanned: result.scanned,
        advanced: result.advanced,
        archived: result.archived,
        duration_ms: result.duration_ms,
      })
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/ritual-transitions] unexpected throw', { message })
    return NextResponse.json(
      { ok: false, error: 'sweep_threw', message: message.slice(0, 200) },
      { status: 500 },
    )
  }
}
