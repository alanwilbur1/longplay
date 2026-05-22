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

    // ── Pull all four data streams in parallel. ─────────────────────────
    // Recent plays, top artists, top tracks, saved albums — each capped
    // at Spotify's 50-item per-page limit.
    //
    // IMPORTANT shape note: only /me/top/artists returns a FULL artist
    // object (with `genres`). Tracks/albums/recently-played return
    // SimplifiedArtist (id + name only). To get genres + popularity +
    // image for those artists, we collect their IDs and batch-hydrate
    // via /v1/artists?ids=... below.
    const [recent, topArtists, topTracks, savedAlbums] = await Promise.all([
      spotifyJson<{
        items: Array<{
          track: {
            id: string
            name: string
            duration_ms: number
            external_ids?: { isrc?: string }
            album?: { id: string; name: string; artists?: Array<{ id: string; name: string }> }
            artists?: Array<{ id: string; name: string }>
          }
          played_at: string
          context?: { type?: string }
        }>
      }>(`${API_BASE}/me/player/recently-played?limit=50`, accessToken),
      spotifyJson<{
        items: Array<{ id: string; name: string; genres: string[] }>
      }>(`${API_BASE}/me/top/artists?time_range=medium_term&limit=50`, accessToken),
      spotifyJson<{
        items: Array<{
          id: string
          name: string
          external_ids?: { isrc?: string }
          album?: { id: string; name: string; artists?: Array<{ id: string; name: string }> }
          artists?: Array<{ id: string; name: string }>
        }>
      }>(`${API_BASE}/me/top/tracks?time_range=medium_term&limit=50`, accessToken),
      spotifyJson<{
        items: Array<{
          album: {
            id: string
            name: string
            artists?: Array<{ id: string; name: string }>
          }
        }>
      }>(`${API_BASE}/me/albums?limit=50`, accessToken),
    ])

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

    const albums: FavoriteAlbum[] = (savedAlbums?.items ?? []).map((row, i) => ({
      source_id: 'spotify',
      external_album_id: row.album?.id,
      title: row.album?.name,
      artist: row.album?.artists?.[0]?.name ?? null,
      rank: i + 1,
      raw: row as unknown as Record<string, unknown>,
    }))

    // ── Collect all artist IDs to hydrate ───────────────────────────────
    // Source priority: top-artists (rank from list order), then the
    // primary artist of each top-track / saved-album / recent-play.
    // Dedupe by id; first encounter wins for rank (so a track-only
    // artist stays unranked).
    type ArtistSeed = { id: string; name: string; rank: number | null }
    const seeds = new Map<string, ArtistSeed>()

    ;(topArtists?.items ?? []).forEach((a, i) => {
      if (!a?.id) return
      seeds.set(a.id, { id: a.id, name: a.name, rank: i + 1 })
    })
    const addUnranked = (id: string | undefined, name: string | undefined) => {
      if (!id || !name) return
      if (seeds.has(id)) return
      seeds.set(id, { id, name, rank: null })
    }
    for (const t of topTracks?.items ?? []) {
      for (const a of t.artists ?? []) addUnranked(a.id, a.name)
    }
    for (const row of savedAlbums?.items ?? []) {
      for (const a of row.album?.artists ?? []) addUnranked(a.id, a.name)
    }
    for (const r of recent?.items ?? []) {
      for (const a of r.track?.artists ?? []) addUnranked(a.id, a.name)
    }

    // ── Batch hydrate via /v1/artists?ids=... ───────────────────────────
    // Up to 50 IDs per call. Failure is observable (see returned `meta`)
    // — we don't silently throw the result away anymore.
    const allIds = Array.from(seeds.keys())
    const hydration = await hydrateSpotifyArtists(allIds, accessToken)
    const hydrated = hydration.map

    const artists: FavoriteArtist[] = Array.from(seeds.values()).map((seed) => {
      const h = hydrated.get(seed.id)
      const image_url = h?.images?.length
        ? [...h.images].sort((x, y) => (y.width ?? 0) - (x.width ?? 0))[0]?.url ?? null
        : null
      return {
        source_id: 'spotify',
        external_artist_id: seed.id,
        name: h?.name ?? seed.name,
        rank: seed.rank,
        genres: h?.genres ?? [],
        popularity: typeof h?.popularity === 'number' ? h.popularity : null,
        followers: typeof h?.followers?.total === 'number' ? h.followers.total : null,
        image_url,
        // CRITICAL FIX: when hydration succeeded for this artist, persist
        // the FULL hydrated payload as `raw` (genres+popularity+images),
        // NOT the shallow seed object. The previous version was
        // `(h ?? seed)` which is right, but the column-level fields
        // above already capture what we need. Keep the merge so
        // downstream readers of `raw` get the rich payload too.
        raw: (h ?? { id: seed.id, name: seed.name }) as unknown as Record<string, unknown>,
      }
    })

    const artists_with_genres = artists.reduce(
      (n, a) => n + (a.genres.length > 0 ? 1 : 0),
      0,
    )

    return {
      events,
      artists,
      albums,
      tracks,
      syncedAt,
      meta: {
        artist_ids_collected: allIds.length,
        artist_ids_hydrated: hydrated.size,
        artists_with_genres,
        hydration_batches_attempted: hydration.attempted,
        hydration_batches_succeeded: hydration.succeeded,
        hydration_error: hydration.lastError,
      },
    }
  },
}

interface HydratedArtist {
  id: string
  name: string
  genres?: string[]
  popularity?: number
  followers?: { total?: number }
  images?: Array<{ url: string; width?: number; height?: number }>
}

interface HydrationOutcome {
  map: Map<string, HydratedArtist>
  attempted: number
  succeeded: number
  /** Last batch HTTP status when a batch failed. */
  lastStatus: number | null
  /** Safe one-line error (status + Spotify's `error.message`), or null
   *  when every batch succeeded. Never contains tokens. */
  lastError: string | null
}

/**
 * Batch-hydrate Spotify artist IDs via `/v1/artists?ids=…`.
 *
 * Self-instrumenting: returns telemetry (attempted/succeeded counts,
 * last failing status + Spotify's safe error message) so the caller
 * can surface "hydration not running" / "hydration 401" diagnostics
 * instead of silently writing `genres: []`.
 *
 * Spotify allows up to 50 IDs per call. IDs are URL-safe base62 so
 * we don't encode the comma separator (Spotify accepts both, but
 * unencoded is the form their docs use most often).
 *
 * Does NOT throw — every batch failure is captured into the outcome.
 */
async function hydrateSpotifyArtists(
  ids: string[],
  accessToken: string,
): Promise<HydrationOutcome> {
  const out: HydrationOutcome = {
    map: new Map(),
    attempted: 0,
    succeeded: 0,
    lastStatus: null,
    lastError: null,
  }
  if (ids.length === 0) return out

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const url = `${API_BASE}/artists?ids=${batch.join(',')}`
    out.attempted += 1

    let res: Response
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      })
    } catch (err) {
      out.lastStatus = 0
      out.lastError = `fetch failed: ${
        err instanceof Error ? err.message : String(err)
      }`
      // Always log — this is genuinely diagnostic and contains no token.
      console.warn('[spotify/hydrate] fetch threw', {
        batch_index: i / 50,
        message: out.lastError,
      })
      continue
    }

    if (!res.ok) {
      out.lastStatus = res.status
      // Spotify error bodies look like { error: { status, message } }.
      // Pull just `message` so we surface "The access token expired"
      // instead of a generic HTTP code. Never includes tokens.
      let detail = ''
      try {
        const body = (await res.json()) as { error?: { message?: string } }
        detail = body?.error?.message ?? ''
      } catch {
        // ignore body parse failure
      }
      out.lastError = detail ? `${res.status}: ${detail}` : `HTTP ${res.status}`
      console.warn('[spotify/hydrate] batch failed', {
        batch_index: i / 50,
        batch_size: batch.length,
        status: res.status,
        detail,
      })
      continue
    }

    let body: { artists?: Array<HydratedArtist | null> }
    try {
      body = (await res.json()) as { artists?: Array<HydratedArtist | null> }
    } catch (err) {
      out.lastStatus = res.status
      out.lastError = `json parse: ${
        err instanceof Error ? err.message : String(err)
      }`
      console.warn('[spotify/hydrate] json parse failed', {
        batch_index: i / 50,
        message: out.lastError,
      })
      continue
    }

    let added = 0
    for (const a of body?.artists ?? []) {
      if (a?.id) {
        out.map.set(a.id, a)
        added += 1
      }
    }
    out.succeeded += 1
    if (process.env.NODE_ENV !== 'production') {
      console.log('[spotify/hydrate] batch ok', {
        batch_index: i / 50,
        batch_size: batch.length,
        added,
      })
    }
  }

  return out
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
