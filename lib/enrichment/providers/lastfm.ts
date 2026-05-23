import 'server-only'

import { normalizeGenreTags } from '../normalize'
import type { ProviderEnrichmentResult, RawTag } from '../types'
import { RateLimitedError, type EnrichmentProviderImpl } from './provider'

/**
 * Last.fm provider for artist genre enrichment.
 *
 * Endpoint: artist.getTopTags
 *   GET https://ws.audioscrobbler.com/2.0/?method=artist.getTopTags
 *       &artist=NAME&api_key=KEY&format=json&autocorrect=1
 *
 * Response shape (success):
 *   {
 *     "toptags": {
 *       "tag": [{ "count": 100, "name": "indie folk", "url": "..." }, ...],
 *       "@attr": { "artist": "Bon Iver" }
 *     }
 *   }
 *
 * Response shape (error):
 *   {
 *     "error": 6,                 -- numeric error code
 *     "message": "The artist you supplied could not be found"
 *   }
 *
 * Required env: LASTFM_API_KEY (read-only public key from Last.fm).
 * Last.fm publishes a stable rate limit of ~5 req/sec per account
 * and no auth header beyond api_key in the query string.
 */

const API_BASE = 'https://ws.audioscrobbler.com/2.0/'

interface LastfmTopTagsResponse {
  toptags?: {
    tag?: Array<{ count?: number; name?: string; url?: string }>
  }
  error?: number
  message?: string
}

function getApiKey(): string {
  const key = process.env.LASTFM_API_KEY
  if (!key) throw new Error('LASTFM_API_KEY is not set')
  return key
}

export const lastfmProvider: EnrichmentProviderImpl = {
  id: 'lastfm',

  async fetchArtistTags({
    artistName,
  }): Promise<ProviderEnrichmentResult> {
    const url = new URL(API_BASE)
    url.searchParams.set('method', 'artist.getTopTags')
    url.searchParams.set('artist', artistName)
    url.searchParams.set('api_key', getApiKey())
    url.searchParams.set('format', 'json')
    url.searchParams.set('autocorrect', '1')

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LongPlay/1.0 (+https://longplay.app)',
      },
      cache: 'no-store',
    })

    if (res.status === 429) {
      const raw = res.headers.get('retry-after')
      const parsed = raw ? Number(raw) : NaN
      throw new RateLimitedError(
        '429 from Last.fm',
        Number.isFinite(parsed) ? parsed : null,
      )
    }

    if (!res.ok) {
      throw new Error(`Last.fm HTTP ${res.status}`)
    }

    let body: LastfmTopTagsResponse
    try {
      body = (await res.json()) as LastfmTopTagsResponse
    } catch (err) {
      throw new Error(
        `Last.fm json parse: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // Last.fm returns 200 with an error object on logical failures
    // (unknown artist, throttling, etc). Surface those as real errors.
    if (typeof body.error === 'number') {
      // Code 29 = "Rate limit exceeded" per Last.fm docs.
      if (body.error === 29) {
        throw new RateLimitedError(`Last.fm error 29: ${body.message ?? ''}`, null)
      }
      throw new Error(`Last.fm error ${body.error}: ${body.message ?? ''}`)
    }

    const raw_tags: RawTag[] = (body.toptags?.tag ?? [])
      .filter((t): t is { count?: number; name: string; url?: string } =>
        typeof t?.name === 'string' && t.name.length > 0,
      )
      .map((t) => ({
        name: t.name,
        count: typeof t.count === 'number' ? t.count : undefined,
        url: t.url,
      }))

    const { canonical, confidence } = normalizeGenreTags(raw_tags)

    return {
      provider: 'lastfm',
      raw_tags,
      canonical_genres: canonical,
      confidence,
    }
  },
}
