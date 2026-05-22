import type { StreamingProvider } from './provider'
import type {
  ConnectionTokens,
  ListeningEvent,
  FavoriteAlbum,
  FavoriteArtist,
  FavoriteTrack,
  SyncResult,
} from './types'

/**
 * Spotify provider implementation.
 *
 * Phase 4.1 scope: OAuth URL generation, code exchange shape, token
 * refresh shape, sync() that pulls /me/player/recently-played +
 * /me/top/artists + /me/top/tracks and normalizes the responses. The
 * actual HTTP calls are implemented with `fetch`; no SDK dependency.
 *
 * Env vars required at runtime:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *
 * Endpoints, scopes, and behavior documented inline so the next
 * person doesn't have to re-read Spotify docs.
 */

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_BASE = 'https://api.spotify.com/v1'

const SCOPES = [
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
  'user-library-read',
] as const

function getClientId(): string {
  const v = process.env.SPOTIFY_CLIENT_ID
  if (!v) throw new Error('[spotify] SPOTIFY_CLIENT_ID is not set')
  return v
}

function getClientSecret(): string {
  const v = process.env.SPOTIFY_CLIENT_SECRET
  if (!v) throw new Error('[spotify] SPOTIFY_CLIENT_SECRET is not set')
  return v
}

function basicAuthHeader(): string {
  const creds = `${getClientId()}:${getClientSecret()}`
  return 'Basic ' + Buffer.from(creds, 'utf-8').toString('base64')
}

interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

function expiresAtFromExpiresIn(expires_in: number | undefined): string | null {
  if (!expires_in || expires_in <= 0) return null
  return new Date(Date.now() + expires_in * 1000).toISOString()
}

async function spotifyJson<T>(url: string, accessToken: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Don't cache — these are user-specific.
    cache: 'no-store',
  })
  if (!res.ok) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[spotify] api call failed', { url, status: res.status })
    }
    return null
  }
  return (await res.json()) as T
}

export const spotifyProvider: StreamingProvider = {
  id: 'spotify',
  displayName: 'Spotify',
  capabilities: {
    recent_plays: true,
    top_artists: true,
    top_tracks: true,
    library: true,
  },

  buildAuthorizeUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: getClientId(),
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES.join(' '),
      state,
      show_dialog: 'false',
    })
    return `${AUTHORIZE_URL}?${params.toString()}`
  },

  async exchangeCode({ code, redirectUri }): Promise<ConnectionTokens> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    })
    if (!res.ok) {
      throw new Error(`[spotify] token exchange failed: ${res.status} ${await res.text()}`)
    }
    const tok = (await res.json()) as SpotifyTokenResponse

    // Probe /me to capture external account id + display name for
    // listening_connections. Best-effort; sync can fill these later.
    const me = await spotifyJson<{ id: string; display_name?: string; email?: string }>(
      `${API_BASE}/me`,
      tok.access_token,
    )

    return {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? null,
      expires_at: expiresAtFromExpiresIn(tok.expires_in),
      scopes: tok.scope ? tok.scope.split(' ') : Array.from(SCOPES),
      external_account_id: me?.id ?? null,
      display_name: me?.display_name ?? me?.email ?? null,
    }
  },

  async refreshTokens({ refreshToken }): Promise<ConnectionTokens> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    })
    if (!res.ok) {
      throw new Error(`[spotify] refresh failed: ${res.status} ${await res.text()}`)
    }
    const tok = (await res.json()) as SpotifyTokenResponse
    return {
      access_token: tok.access_token,
      // Spotify often re-uses the existing refresh token (omits from response).
      refresh_token: tok.refresh_token ?? null,
      expires_at: expiresAtFromExpiresIn(tok.expires_in),
      scopes: tok.scope ? tok.scope.split(' ') : Array.from(SCOPES),
      external_account_id: null,
      display_name: null,
    }
  },

  async sync({ accessToken }): Promise<SyncResult> {
    const syncedAt = new Date().toISOString()

    // Recent plays (last 50; Spotify's hard cap).
    const recent = await spotifyJson<{
      items: Array<{
        track: {
          id: string
          name: string
          duration_ms: number
          external_ids?: { isrc?: string }
          album?: { id: string; name: string }
          artists?: Array<{ name: string }>
        }
        played_at: string
        context?: { type?: string }
      }>
    }>(`${API_BASE}/me/player/recently-played?limit=50`, accessToken)

    const events: ListeningEvent[] = (recent?.items ?? []).map((r) => ({
      source_id: 'spotify',
      external_track_id: r.track?.id ?? null,
      track_title: r.track?.name ?? null,
      artist_name: r.track?.artists?.[0]?.name ?? null,
      album_name: r.track?.album?.name ?? null,
      album_external_id: r.track?.album?.id ?? null,
      isrc: r.track?.external_ids?.isrc ?? null,
      played_at: r.played_at,
      duration_ms: r.track?.duration_ms ?? null,
      context_type: normalizeContext(r.context?.type),
      raw: r as unknown as Record<string, unknown>,
    }))

    // Top artists (medium_term ≈ 6 months — the band most reflective of
    // identity without overweighting very recent obsessions).
    const topArtists = await spotifyJson<{
      items: Array<{ id: string; name: string; genres: string[] }>
    }>(`${API_BASE}/me/top/artists?time_range=medium_term&limit=50`, accessToken)

    const artists: FavoriteArtist[] = (topArtists?.items ?? []).map((a, i) => ({
      source_id: 'spotify',
      external_artist_id: a.id,
      name: a.name,
      rank: i + 1,
      genres: a.genres ?? [],
      raw: a as unknown as Record<string, unknown>,
    }))

    // Top tracks (same window).
    const topTracks = await spotifyJson<{
      items: Array<{
        id: string
        name: string
        external_ids?: { isrc?: string }
        album?: { name: string }
        artists?: Array<{ name: string }>
      }>
    }>(`${API_BASE}/me/top/tracks?time_range=medium_term&limit=50`, accessToken)

    const tracks: FavoriteTrack[] = (topTracks?.items ?? []).map((t, i) => ({
      source_id: 'spotify',
      external_track_id: t.id,
      title: t.name,
      artist: t.artists?.[0]?.name ?? null,
      album: t.album?.name ?? null,
      isrc: t.external_ids?.isrc ?? null,
      rank: i + 1,
      raw: t as unknown as Record<string, unknown>,
    }))

    // Saved albums (library; first page).
    const savedAlbums = await spotifyJson<{
      items: Array<{
        album: { id: string; name: string; artists?: Array<{ name: string }> }
      }>
    }>(`${API_BASE}/me/albums?limit=50`, accessToken)

    const albums: FavoriteAlbum[] = (savedAlbums?.items ?? []).map((row, i) => ({
      source_id: 'spotify',
      external_album_id: row.album?.id,
      title: row.album?.name,
      artist: row.album?.artists?.[0]?.name ?? null,
      rank: i + 1,
      raw: row as unknown as Record<string, unknown>,
    }))

    return { events, artists, albums, tracks, syncedAt }
  },
}

function normalizeContext(t: string | undefined): ListeningEvent['context_type'] {
  switch (t) {
    case 'album':
    case 'playlist':
      return t
    case 'artist':
      return 'radio'
    case 'show':
      return 'unknown'
    default:
      return t ? 'unknown' : null
  }
}
