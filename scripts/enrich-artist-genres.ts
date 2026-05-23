/**
 * scripts/enrich-artist-genres.ts
 *
 * Manual driver for the Phase 4.5 enrichment layer. Runs one
 * enrichment job end-to-end for a given (user_id, external_artist_id,
 * artist_name) tuple, printing the upserted DB row.
 *
 * Use this to:
 *   - Sanity-check LASTFM_API_KEY before triggering a sync
 *   - Test normalization on a specific artist
 *   - Force a re-fetch on a single artist without sync
 *
 * Usage (from project root):
 *
 *   tsx scripts/enrich-artist-genres.ts \
 *     <userId> <externalArtistId> "<artist name>"
 *
 *   # Example:
 *   tsx scripts/enrich-artist-genres.ts \
 *     11111111-1111-1111-1111-111111111111 \
 *     4tZwfgrHOc3mvqYlEYSvVi \
 *     "Bon Iver"
 *
 * Required env:
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LASTFM_API_KEY
 */

import {
  enqueueArtistGenreEnrichment,
  runArtistGenreEnrichmentJob,
} from '@/lib/enrichment'

async function main() {
  const [userId, externalArtistId, ...nameParts] = process.argv.slice(2)
  const artistName = nameParts.join(' ').trim()

  if (!userId || !externalArtistId || !artistName) {
    console.error(
      'Usage: tsx scripts/enrich-artist-genres.ts <userId> <externalArtistId> "<artist name>"',
    )
    process.exit(1)
  }

  if (!process.env.LASTFM_API_KEY) {
    console.error(
      'LASTFM_API_KEY is not set. Add it to .env.local before running.',
    )
    process.exit(1)
  }

  console.log('Enqueueing enrichment job:', {
    userId,
    externalArtistId,
    artistName,
  })

  const job = await enqueueArtistGenreEnrichment({
    userId,
    sourceId: 'spotify',
    externalArtistId,
    artistName,
    force: true,
  })

  if (!job) {
    console.error('Failed to enqueue job (check service-role key + RLS).')
    process.exit(1)
  }

  console.log('Job enqueued:', { id: job.id, status: job.status })

  const result = await runArtistGenreEnrichmentJob(job.id, { force: true })

  if (!result) {
    console.error('Job run returned null — check DB for failure details.')
    process.exit(1)
  }

  console.log('Result:')
  console.log(
    JSON.stringify(
      {
        id: result.id,
        status: result.status,
        provider: result.provider,
        canonical_genres: result.canonical_genres,
        confidence: result.confidence,
        raw_tags_count: Array.isArray(result.raw_tags)
          ? result.raw_tags.length
          : null,
        attempt_count: result.attempt_count,
        last_error: result.last_error,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
