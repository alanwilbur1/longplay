import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { pickDefaultProvider } from '@/lib/enrichment/providers'

/**
 * Phase 4.5 enrichment lifecycle inspector.
 *
 *   GET /api/debug/enrichment-status
 *
 * Auth-gated read of artist_genre_enrichments for the signed-in
 * listener. Tells the operator EXACTLY where in the lifecycle the
 * enrichment pipeline stopped:
 *
 *   - table_query_failed → migration 0011 likely not applied
 *   - total=0            → enqueue never ran (or sync's outer
 *                          try/catch swallowed)
 *   - counts.queued > 0  → enqueued but the round runner isn't
 *                          executing or backoff is suppressing them
 *   - counts.succeeded>0 → pipeline working; check canonical_genres
 *                          sample to see what Last.fm returned
 *
 * Also surfaces:
 *   - env_lastfm_key_present (boolean, not the key)
 *   - default_provider_resolved ('lastfm' | null)
 *   - last_attempted_at / last_succeeded_at — to see if jobs are
 *     stuck in the past or actively running
 *   - top_canonical_genres — what's actually landing in the DB
 *
 * Returns ONLY safe diagnostics. Never the API key, never tokens,
 * never raw_tags (which can include free-text URLs).
 */

interface EnrichmentRow {
  status: string
  canonical_genres: string[] | null
  artist_name: string
  provider: string | null
  attempt_count: number
  last_attempted_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { data: rows, error } = await supabase
    .from('artist_genre_enrichments')
    .select(
      'status, canonical_genres, artist_name, provider, attempt_count, last_attempted_at, last_error, created_at, updated_at',
    )
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) {
    const looksLikeMissingTable =
      error.code === 'PGRST205' ||
      error.code === '42P01' ||
      /relation .* does not exist/i.test(error.message) ||
      /could not find the table/i.test(error.message)
    return NextResponse.json(
      {
        success: false,
        error: 'table_query_failed',
        code: error.code ?? null,
        message: error.message,
        hint: looksLikeMissingTable
          ? 'Migration 0011_artist_genre_enrichments.sql is probably not applied to this database. Apply it via the Supabase dashboard or `supabase db push`.'
          : 'See code/message for details.',
        env_lastfm_key_present: !!process.env.LASTFM_API_KEY,
        default_provider_resolved: pickDefaultProvider()?.id ?? null,
      },
      { status: 500 },
    )
  }

  const all = (rows ?? []) as unknown as EnrichmentRow[]

  const counts: Record<string, number> = {
    queued: 0,
    in_progress: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  }
  for (const row of all) {
    if (row.status in counts) counts[row.status] += 1
  }

  // Most common canonical genres across succeeded rows.
  const genreTally = new Map<string, number>()
  for (const row of all) {
    if (row.status !== 'succeeded') continue
    for (const g of row.canonical_genres ?? []) {
      genreTally.set(g, (genreTally.get(g) ?? 0) + 1)
    }
  }
  const top_canonical_genres = Array.from(genreTally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([g, n]) => ({ genre: g, artists: n }))

  const attemptedSorted = all
    .map((r) => r.last_attempted_at)
    .filter((t): t is string => !!t)
    .sort()
    .reverse()
  const last_attempted_at = attemptedSorted[0] ?? null

  const succeededSorted = all
    .filter((r) => r.status === 'succeeded' && r.last_attempted_at)
    .map((r) => r.last_attempted_at as string)
    .sort()
    .reverse()
  const last_succeeded_at = succeededSorted[0] ?? null

  const recent_rows = all.slice(0, 10).map((r) => ({
    artist_name: r.artist_name,
    status: r.status,
    provider: r.provider,
    attempt_count: r.attempt_count,
    last_attempted_at: r.last_attempted_at,
    last_error: r.last_error ? r.last_error.slice(0, 200) : null,
    canonical_genres_count: (r.canonical_genres ?? []).length,
    canonical_genres_sample: (r.canonical_genres ?? []).slice(0, 8),
  }))

  return NextResponse.json({
    success: true,
    user_id: user.id,
    counts,
    total: all.length,
    last_attempted_at,
    last_succeeded_at,
    env_lastfm_key_present: !!process.env.LASTFM_API_KEY,
    default_provider_resolved: pickDefaultProvider()?.id ?? null,
    top_canonical_genres,
    recent_rows,
  })
}
