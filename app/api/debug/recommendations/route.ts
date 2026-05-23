import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { runRecommendationPipeline } from '@/lib/recommendations/pipeline'

/**
 * v2.1 recommendation engine diagnostic route.
 *
 *   GET /api/debug/recommendations[?limit=5]
 *
 * Auth-gated read of the same pipeline that drives
 * getRecommendedRooms(), with the full diagnostic envelope:
 *   - score_version
 *   - all raw recommendation inputs (calibration, snapshot, etc.)
 *   - candidate counts (before/after filter)
 *   - top 25 scored candidates pre-MMR (so we can see what was in
 *     the running but didn't make the final cut)
 *   - final ranked picks with score_pre_diversity, diversity_penalty,
 *     final score, factor breakdown, explanation
 *
 * Surfaces ONLY non-sensitive data: room metadata, the listener's
 * own derived state. Never tokens, never API keys.
 */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const url = new URL(request.url)
  const rawLimit = url.searchParams.get('limit')
  const parsed = rawLimit ? Number(rawLimit) : 5
  const limit =
    Number.isFinite(parsed) && parsed > 0 && parsed <= 20 ? Math.floor(parsed) : 5

  try {
    const result = await runRecommendationPipeline(supabase, user.id, limit)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      {
        error: 'pipeline_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
