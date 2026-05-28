/**
 * lib/streaming/spotify-tracks.ts — Phase 6B.5
 *
 * Catalog-side track hydration for an album. Mirrors the
 * editorial restraint of the artist genre enrichment in
 * lib/streaming/spotify.ts:hydrateSpotifyArtists — best-effort,
 * tagged failures, no throws.
 *
 * The /v1/albums/{id}/tracks endpoint is in the SAME catalog
 * family as /v1/artists?ids=… that Phase 6A.12 modeled as
 * "restricted" for our app tier. A 403 here is a known degraded
 * state, not a bug. Callers respond by:
 *   · Recording the failure shape in their own observability
 *     (the hydrate script logs counts; the future sync-time
 *     integration would mark the cycle's `spotify_artist_hydration_status`
 *     analogue).
 *   · Leaving the album_tracks table empty for this album.
 *   · Letting the UI's TracklistSurface render its restrained
 *     fallback line.
 *
 * Pure of the DB layer. No persistence here.
 */

const API_BASE = 'https://api.spotify.com/v1'
const ACCOUNTS_TOKEN_URL = 'https://accounts.spotify.com/api/token'

export interface SpotifyAlbumTrack {
  id: string
  name: string
  track_number: number
  disc_number: number
  duration_ms: number | null
  explicit: boolean
  preview_url: string | null
  external_url: string | null
  isrc: string | null
}

export type FetchAlbumTracksOutcome =
  | { ok: true; tracks: SpotifyAlbumTrack[] }
  | { ok: false; reason: 'restricted' | 'rate_limited' | 'network' | 'parse'; status: number | null; detail: string | null }

interface SpotifyTrackItem {
  id: string
  name: string
  track_number: number
  disc_number?: number
  duration_ms?: number
  explicit?: boolean
  preview_url?: string | null
  external_urls?: { spotify?: string }
  external_ids?: { isrc?: string }
}

/**
 * Fetch the full track list for a Spotify album. Paginated under
 * the hood (Spotify caps at 50 per page; long compilations span
 * multiple pages). Returns ordered tracks across all pages.
 *
 *   ok: true         → tracks array (may be empty for an album
 *                      with no tracks, though that's rare).
 *   ok: false        → tagged reason. Caller decides logging.
 *
 *      restricted    → 403. Catalog blocked. Same outcome as the
 *                      6A.12 artist hydration policy.
 *      rate_limited  → 429. Spotify is throttling us.
 *      network       → fetch threw (DNS, TLS, transient).
 *      parse         → JSON parse error on a 200 (rare; usually
 *                      indicates a Cloudflare interstitial).
 */
export async function fetchAlbumTracks(
  spotifyAlbumId: string,
  accessToken: string,
  options: { pageLimit?: number; maxPages?: number } = {},
): Promise<FetchAlbumTracksOutcome> {
  if (!spotifyAlbumId || typeof spotifyAlbumId !== 'string') {
    return { ok: false, reason: 'parse', status: null, detail: 'empty album id' }
  }
  const pageLimit = Math.max(1, Math.min(options.pageLimit ?? 50, 50))
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 4, 20))

  const items: SpotifyTrackItem[] = []
  let offset = 0
  for (let page = 0; page < maxPages; page += 1) {
    const url = `${API_BASE}/albums/${spotifyAlbumId}/tracks?limit=${pageLimit}&offset=${offset}`
    let res: Response
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        cache: 'no-store',
      })
    } catch (err) {
      return {
        ok: false,
        reason: 'network',
        status: null,
        detail: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      }
    }
    if (res.status === 403) {
      let detail: string | null = null
      try {
        const body = (await res.json()) as { error?: { message?: string } }
        detail = body?.error?.message ?? null
      } catch {
        // ignore
      }
      return { ok: false, reason: 'restricted', status: 403, detail }
    }
    if (res.status === 429) {
      return {
        ok: false,
        reason: 'rate_limited',
        status: 429,
        detail: res.headers.get('retry-after'),
      }
    }
    if (!res.ok) {
      let detail: string | null = null
      try {
        const body = (await res.json()) as { error?: { message?: string } }
        detail = body?.error?.message ?? null
      } catch {
        // ignore
      }
      return {
        ok: false,
        reason: 'parse',
        status: res.status,
        detail,
      }
    }

    let body: { items?: SpotifyTrackItem[]; next?: string | null }
    try {
      body = (await res.json()) as { items?: SpotifyTrackItem[]; next?: string | null }
    } catch (err) {
      return {
        ok: false,
        reason: 'parse',
        status: res.status,
        detail: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      }
    }

    const pageItems = body?.items ?? []
    items.push(...pageItems)

    if (!body?.next || pageItems.length < pageLimit) {
      // No more pages.
      break
    }
    offset += pageLimit
  }

  return { ok: true, tracks: items.map(toSpotifyAlbumTrack) }
}

function toSpotifyAlbumTrack(item: SpotifyTrackItem): SpotifyAlbumTrack {
  return {
    id: item.id,
    name: item.name,
    track_number: item.track_number,
    disc_number:
      typeof item.disc_number === 'number' && item.disc_number >= 1
        ? item.disc_number
        : 1,
    duration_ms:
      typeof item.duration_ms === 'number' && item.duration_ms >= 0
        ? item.duration_ms
        : null,
    explicit: !!item.explicit,
    preview_url: item.preview_url ?? null,
    external_url: item.external_urls?.spotify ?? null,
    isrc: item.external_ids?.isrc ?? null,
  }
}

// ── Client Credentials token (no user) ────────────────────────────

interface ClientCredentialsResponse {
  access_token: string
  expires_in: number
  token_type: 'Bearer'
}

/**
 * Mint a Spotify Client Credentials token. Server-only token, no
 * user context — meant for catalog-only reads (album/track metadata)
 * from offline scripts. The /me/* endpoints reject this token, so
 * never substitute it for a sync token.
 *
 * Requires SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET in env.
 *
 * Returns the raw token + expires_in seconds. Caller is responsible
 * for caching across short-lived processes; for a single-shot
 * hydration script no caching is needed.
 */
export async function mintClientCredentialsToken(): Promise<{
  access_token: string
  expires_in: number
}> {
  const id = process.env.SPOTIFY_CLIENT_ID
  const secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) {
    throw new Error(
      '[spotify-tracks] SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set',
    )
  }
  const basic = Buffer.from(`${id}:${secret}`, 'utf-8').toString('base64')
  const res = await fetch(ACCOUNTS_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(
      `[spotify-tracks] client credentials failed: ${res.status} ${(await res.text()).slice(0, 200)}`,
    )
  }
  const tok = (await res.json()) as ClientCredentialsResponse
  return { access_token: tok.access_token, expires_in: tok.expires_in }
}
