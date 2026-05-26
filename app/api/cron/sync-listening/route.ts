import { NextResponse, type NextRequest } from 'next/server'
import { runScheduledSync } from '@/lib/streaming/scheduler'
import { validateCronAuth } from '@/lib/streaming/scheduler-logic'

/**
 * /api/cron/sync-listening — Phase 6A.2B
 *
 * Vercel Cron entry point. The cron config (vercel.json) calls this
 * route on a schedule; Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 *
 * Auth:
 *   - CRON_SECRET env var must be set; otherwise the route returns 503
 *     (cron is disabled / mis-configured rather than a misleading 401).
 *   - Authorization header must match `Bearer <CRON_SECRET>` via a
 *     constant-time comparison (lib/streaming/scheduler-logic.ts).
 *   - Any other request — unauth, wrong header, no header — gets 401.
 *
 * Body: structured JSON with batch counts + per-connection summary.
 *
 * Concurrency: the route is idempotent; if two cron ticks ever fire
 * at the same time (very unusual on Vercel), the scheduler's
 * next_sync_after stamps prevent the same connection from being
 * processed by both — whichever wins the SELECT first will have
 * already advanced next_sync_after by the time the second tries.
 */

// Vercel route segment config: run dynamic (we read headers), and
// give cron jobs enough wall-clock to drain a batch. Beware: Hobby
// plan caps at 60s; Pro can go higher. The default 60s is enough for
// a batch of ~25 Spotify syncs at ~2s each + concurrency 4.
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

  // Vercel Cron sets Authorization: Bearer <CRON_SECRET>. Manual
  // operator hits work the same way with curl + -H "Authorization: …".
  const auth = request.headers.get('authorization')
  if (!validateCronAuth(auth, secret)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    )
  }

  try {
    const result = await runScheduledSync()
    return NextResponse.json(result)
  } catch (err) {
    // Top-level catch is belt-and-suspenders — runScheduledSync is
    // designed not to throw, but we don't want a 500 with a stack
    // trace going back to the caller.
    const message = err instanceof Error ? err.message : String(err)
    if (process.env.NODE_ENV !== 'production') {
      console.error('[cron/sync-listening] unexpected throw', { message })
    }
    return NextResponse.json(
      { ok: false, error: 'scheduler_threw', message: message.slice(0, 200) },
      { status: 500 },
    )
  }
}
