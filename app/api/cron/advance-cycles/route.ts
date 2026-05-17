/**
 * GET /api/cron/advance-cycles
 *
 * External-scheduler entry point for the cycle progression engine.
 * Calls advance_cycle_phases() and returns a summary. Idempotent —
 * safe to hit on any cadence (Vercel cron, GitHub Actions, manual curl).
 *
 * Authentication:
 *   - If CRON_SECRET is set in env, callers must present it as
 *     `Authorization: Bearer ${CRON_SECRET}`. This is how Vercel cron
 *     and external schedulers gate the endpoint.
 *   - If CRON_SECRET is not set (typical local dev), the route accepts
 *     unauthenticated requests so a developer can curl it freely.
 *
 * The engine itself runs as service_role inside Postgres, so the only
 * thing CRON_SECRET protects is who can trigger an advance; it cannot
 * cause data loss or expose user data.
 */

import { advanceCyclePhases } from '@/lib/cycles/progression'

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  if (expected) {
    const auth = request.headers.get('Authorization')
    if (auth !== `Bearer ${expected}`) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const result = await advanceCyclePhases()
  if (!result) {
    return Response.json(
      { ok: false, error: 'advance_cycle_phases unreachable' },
      { status: 500 },
    )
  }

  return Response.json({
    ok: true,
    at: new Date().toISOString(),
    ...result,
  })
}

// Some schedulers issue POST instead of GET; accept both.
export const POST = GET
