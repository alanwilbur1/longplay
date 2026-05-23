import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Phase 4.5 smoke test for the Last.fm enrichment provider.
 *
 *   GET /api/debug/lastfm-smoke[?artist=Radiohead]
 *
 * Self-contained on purpose — does NOT route through
 * lib/enrichment/providers/lastfm.ts because the smoke test needs
 * to surface the raw HTTP status to the operator (the provider
 * helper throws on !ok and the status is lost). Otherwise the
 * request shape, headers, and error-code handling match the
 * provider exactly, so a green smoke here means enrichment in sync
 * will also work.
 *
 * Auth-gated: signed-in users only, so random web traffic doesn't
 * burn our Last.fm quota.
 *
 * Returns ONLY safe diagnostics — never the API key, never tokens,
 * never Spotify access tokens.
 */

const API_BASE = 'https://ws.audioscrobbler.com/2.0/'

interface LastfmTopTagsResponse {
  toptags?: {
    tag?: Array<{ count?: number; name?: string; url?: string }>
  }
  error?: number
  message?: string
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const apiKey = process.env.LASTFM_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        error: 'LASTFM_API_KEY missing',
        hint: 'Set LASTFM_API_KEY in the deployment / .env.local. Restart required for local dev.',
      },
      { status: 503 },
    )
  }

  const url = new URL(request.url)
  const artist = url.searchParams.get('artist')?.trim() || 'Radiohead'

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
    return NextResponse.json(
      {
        success: false,
        artist,
        error: 'fetch_failed',
        message: err instanceof Error ? err.message : String(err),
        latency_ms: Date.now() - startedAt,
      },
      { status: 502 },
    )
  }
  const latency_ms = Date.now() - startedAt
  const status = res.status

  // 429 from Last.fm (HTTP layer or rate-limiter).
  if (status === 429) {
    const retryAfter = res.headers.get('retry-after')
    return NextResponse.json(
      {
        success: false,
        artist,
        status,
        error: 'rate_limited',
        retry_after_seconds: retryAfter ? Number(retryAfter) : null,
        latency_ms,
      },
      { status: 429 },
    )
  }

  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as LastfmTopTagsResponse
      detail = body?.message ?? ''
    } catch {
      // ignore body parse failure
    }
    return NextResponse.json(
      {
        success: false,
        artist,
        status,
        error: detail || `HTTP ${status}`,
        latency_ms,
      },
      { status: 502 },
    )
  }

  let body: LastfmTopTagsResponse
  try {
    body = (await res.json()) as LastfmTopTagsResponse
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        artist,
        status,
        error: 'json_parse_failed',
        message: err instanceof Error ? err.message : String(err),
        latency_ms,
      },
      { status: 502 },
    )
  }

  // Last.fm returns 200 with an error object on logical failures.
  // Code 29 = rate-limited per their docs; 6 = artist not found, etc.
  if (typeof body.error === 'number') {
    const isRateLimit = body.error === 29
    return NextResponse.json(
      {
        success: false,
        artist,
        status,
        error: isRateLimit ? 'rate_limited' : `lastfm_error_${body.error}`,
        message: body.message ?? '',
        latency_ms,
      },
      { status: isRateLimit ? 429 : 502 },
    )
  }

  const tags = (body.toptags?.tag ?? []).filter(
    (t): t is { count?: number; name: string; url?: string } =>
      typeof t?.name === 'string' && t.name.length > 0,
  )

  return NextResponse.json({
    success: true,
    artist,
    status,
    raw_tag_count: tags.length,
    first_10_tags: tags.slice(0, 10).map((t) => t.name),
    latency_ms,
  })
}
