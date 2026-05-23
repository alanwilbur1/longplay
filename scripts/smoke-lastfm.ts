/**
 * scripts/smoke-lastfm.ts
 *
 * Local smoke test for the Last.fm enrichment provider. Mirrors
 * /api/debug/lastfm-smoke but runs without an auth check (intended
 * for CLI use on a dev machine, not deployed traffic).
 *
 * Usage:
 *   tsx scripts/smoke-lastfm.ts            # tests "Radiohead"
 *   tsx scripts/smoke-lastfm.ts "Bon Iver" # custom artist
 *
 * Required env:
 *   LASTFM_API_KEY
 */

const API_BASE = 'https://ws.audioscrobbler.com/2.0/'

interface LastfmTopTagsResponse {
  toptags?: {
    tag?: Array<{ count?: number; name?: string; url?: string }>
  }
  error?: number
  message?: string
}

async function main() {
  const artist = process.argv.slice(2).join(' ').trim() || 'Radiohead'

  const apiKey = process.env.LASTFM_API_KEY
  if (!apiKey) {
    console.log(
      JSON.stringify(
        {
          success: false,
          error: 'LASTFM_API_KEY missing',
          hint: 'Add LASTFM_API_KEY to .env.local',
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }

  const apiUrl = new URL(API_BASE)
  apiUrl.searchParams.set('method', 'artist.getTopTags')
  apiUrl.searchParams.set('artist', artist)
  apiUrl.searchParams.set('api_key', apiKey)
  apiUrl.searchParams.set('format', 'json')
  apiUrl.searchParams.set('autocorrect', '1')

  const startedAt = Date.now()
  let res: Response
  try {
    res = await fetch(apiUrl.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LongPlay/1.0 (+https://longplay.app)',
      },
      cache: 'no-store',
    })
  } catch (err) {
    console.log(
      JSON.stringify(
        {
          success: false,
          artist,
          error: 'fetch_failed',
          message: err instanceof Error ? err.message : String(err),
          latency_ms: Date.now() - startedAt,
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }
  const latency_ms = Date.now() - startedAt
  const status = res.status

  if (status === 429) {
    console.log(
      JSON.stringify(
        {
          success: false,
          artist,
          status,
          error: 'rate_limited',
          retry_after_seconds: res.headers.get('retry-after')
            ? Number(res.headers.get('retry-after'))
            : null,
          latency_ms,
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }

  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as LastfmTopTagsResponse
      detail = body?.message ?? ''
    } catch {
      // ignore
    }
    console.log(
      JSON.stringify(
        {
          success: false,
          artist,
          status,
          error: detail || `HTTP ${status}`,
          latency_ms,
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }

  const body = (await res.json()) as LastfmTopTagsResponse

  if (typeof body.error === 'number') {
    const isRateLimit = body.error === 29
    console.log(
      JSON.stringify(
        {
          success: false,
          artist,
          status,
          error: isRateLimit ? 'rate_limited' : `lastfm_error_${body.error}`,
          message: body.message ?? '',
          latency_ms,
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }

  const tags = (body.toptags?.tag ?? []).filter(
    (t): t is { count?: number; name: string; url?: string } =>
      typeof t?.name === 'string' && t.name.length > 0,
  )

  console.log(
    JSON.stringify(
      {
        success: true,
        artist,
        status,
        raw_tag_count: tags.length,
        first_10_tags: tags.slice(0, 10).map((t) => t.name),
        latency_ms,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error('smoke-lastfm failed:', err)
  process.exit(1)
})
