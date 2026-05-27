import type { StreamingProvider } from './provider'
import type {
  ConnectionTokens,
  ListeningEvent,
  FavoriteAlbum,
  FavoriteArtist,
  FavoriteTrack,
  SyncResult,
} from './types'
import {
  classifyHydrationOutcome,
  parseHydrationMode,
  shouldAttemptHydration,
  type HydrationMode,
  type HydrationStatus,
} from './hydration-policy'

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

  async sync({ accessToken, recentlyPlayedAfter }): Promise<SyncResult> {
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
    //
    // Phase 6A.2B incremental cursor: if `recentlyPlayedAfter` is set,
    // we ask Spotify for plays AFTER that timestamp via the `after`
    // query param (milliseconds since epoch). Spotify caps recently-
    // played at 50 items total, so for high-volume listeners we still
    // lose plays past 50 — that's an upstream limitation, not a cursor
    // bug. Without `after`, Spotify returns the 50 most recent plays.
    const recentlyPlayedAfterMs = recentlyPlayedAfter
      ? Date.parse(recentlyPlayedAfter)
      : NaN
    const recentParams = new URLSearchParams({ limit: '50' })
    if (Number.isFinite(recentlyPlayedAfterMs)) {
      recentParams.set('after', String(recentlyPlayedAfterMs))
    }
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
      }>(`${API_BASE}/me/player/recently-played?${recentParams.toString()}`, accessToken),
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
    //
    // Phase 6A.12: governed by SPOTIFY_CATALOG_HYDRATION_MODE.
    //   enabled / auto  → attempt
    //   disabled        → skip the network call entirely; rely on Last.fm
    // 403 on the call is now classified as 'restricted' (not 'error') so
    // it does not surface as a user-facing failure.
    const hydrationMode = parseHydrationMode(
      process.env.SPOTIFY_CATALOG_HYDRATION_MODE,
    )
    const allIds = Array.from(seeds.keys())
    const hydration = await hydrateSpotifyArtists(allIds, accessToken, hydrationMode)
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

    // Phase 6A.2B: report the new cursor (max played_at across this
    // sync's events). The orchestrator persists it to
    // listening_connections.recently_played_cursor.
    let maxPlayedAtMs = recentlyPlayedAfterMs
    for (const e of events) {
      if (!e.played_at) continue
      const t = Date.parse(e.played_at)
      if (Number.isFinite(t) && (!Number.isFinite(maxPlayedAtMs) || t > maxPlayedAtMs)) {
        maxPlayedAtMs = t
      }
    }
    const recently_played_cursor = Number.isFinite(maxPlayedAtMs)
      ? new Date(maxPlayedAtMs).toISOString()
      : null

    // Phase 6A.12: catalog restriction is an internal degraded state,
    // not a user-facing error. When the policy classifies the outcome
    // as 'restricted' (or 'disabled'), suppress hydration_error so the
    // UI stays calm — Last.fm enrichment will populate genres in the
    // recompute step. Internal restriction signal lives on its own
    // fields so operators retain full visibility via the audit log.
    const hydrationStatus: HydrationStatus = classifyHydrationOutcome({
      mode: hydrationMode,
      skipped: hydration.diagnostics.skipped_reason !== null,
      collected: allIds.length,
      hydrated: hydrated.size,
      rate_limited: hydration.diagnostics.rate_limited,
      last_status: hydration.diagnostics.last_status,
      probe_single_status: hydration.diagnostics.probe_single_status,
      fully_recovered_via_fallback:
        hydration.diagnostics.fallback_mode === 'batch_to_single' &&
        hydrated.size >= allIds.length,
    })
    const isInternalDegradedState =
      hydrationStatus === 'restricted' ||
      hydrationStatus === 'disabled' ||
      hydrationStatus === 'rate_limited'
    const userFacingHydrationError = isInternalDegradedState
      ? null
      : hydration.lastError

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
        hydration_error: userFacingHydrationError,
        recently_played_cursor,
        hydration_status: hydrationStatus,
        spotify_catalog_restricted: hydrationStatus === 'restricted',
        spotify_artist_hydration_skipped:
          hydration.diagnostics.skipped_reason !== null,
        spotify_hydration_mode: hydrationMode,
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
   *  when every batch succeeded — including when the batch path 403s
   *  but the per-id fallback fully recovered the hydration map. */
  lastError: string | null
  /** Temporary Phase 4.4 diagnostics. Surfaced through SyncMeta into
   *  the UI so we can see whether the 403 came from a bad ID, a bad
   *  URL shape, or token-side issues. Never contains the token. */
  diagnostics: {
    first_id: string | null
    batch_size: number
    /** Length only — never the token itself. */
    token_prefix_len: number
    /** Pathname + truncated query (first 80 chars). */
    sample_url_path: string | null
    last_status: number | null
    /** Spotify body's `error.message` (already safe — no token). */
    last_body_message: string | null
    /** IDs filtered out because they didn't match Spotify's
     *  22-char base62 shape. */
    ids_filtered_out: number
    /** Status of a single-id probe (GET /v1/artists/{firstId}) when the
     *  first batch fails. Tells us whether the catalog endpoint is
     *  blocked globally or just the comma-list form. */
    probe_single_status: number | null
    /** Set to 'batch_to_single' when at least one batch fell back to
     *  per-id hydration. Null when the fast batch path worked end to
     *  end. */
    fallback_mode: 'batch_to_single' | null
    fallback_singles_attempted: number
    fallback_singles_succeeded: number
    fallback_singles_failed: number
    /** True when a per-id fallback bailed early because Spotify
     *  returned 429. Successes captured BEFORE the 429 are preserved
     *  in `map` regardless. */
    rate_limited: boolean
    /** Spotify's Retry-After header value in seconds, when sent. */
    retry_after_seconds: number | null
    /** Phase 6A.12: set to 'mode:disabled' when SPOTIFY_CATALOG_HYDRATION_MODE
     *  caused us to skip the call. Null when we attempted (regardless of
     *  outcome). Distinct from `rate_limited` (transient skip after
     *  attempt) and `restricted` (attempted, got 403). */
    skipped_reason: 'mode:disabled' | null
  }
}

/**
 * Batch-hydrate Spotify artist IDs via `/v1/artists?ids=…`.
 *
 * Self-instrumenting: returns telemetry (attempted/succeeded counts,
 * last failing status + Spotify's safe error message, plus
 * Phase-4.4 diagnostics) so the caller can surface "hydration 403
 * on this exact URL" diagnostics instead of silently writing
 * genres: [].
 *
 * Spotify allows up to 50 IDs per call. IDs are URL-safe base62
 * (22-char [A-Za-z0-9]); we hard-filter to that shape before joining
 * so a single local-file pseudo-id can't poison a whole batch.
 *
 * Headers: Authorization + Accept only. A custom User-Agent
 * (`LongPlay/1.0 (+https://longplay.app)`) was added in an earlier
 * phase to work around a Cloudflare rule that 403'd catalog
 * endpoints under undici's default User-Agent. As of the Phase 6A
 * production validation, Spotify's edge now does the opposite: it
 * 403s catalog endpoints when the request carries a bot-format UA
 * (`Name/1.0 (+url)` matches CF's bot fingerprint), while still
 * permitting the same call under undici's default. Removing the
 * explicit UA puts hydration on the same call posture as the
 * `/me/*` requests via spotifyJson(), which work in production.
 * The original workaround comment is preserved here as the rationale
 * for why we don't reintroduce it.
 *
 * Does NOT throw — every batch failure is captured into the outcome.
 */
async function hydrateSpotifyArtists(
  ids: string[],
  accessToken: string,
  mode: HydrationMode = 'auto',
): Promise<HydrationOutcome> {
  // Spotify IDs are exactly 22 chars of base62. Anything else (local
  // files, malformed entries from old syncs, empty strings) gets
  // dropped — they'd make Spotify reject the whole batch.
  const VALID_ID = /^[A-Za-z0-9]{22}$/
  const filtered: string[] = []
  let ids_filtered_out = 0
  for (const id of ids) {
    if (typeof id === 'string' && VALID_ID.test(id)) filtered.push(id)
    else ids_filtered_out += 1
  }

  const out: HydrationOutcome = {
    map: new Map(),
    attempted: 0,
    succeeded: 0,
    lastStatus: null,
    lastError: null,
    diagnostics: {
      first_id: filtered[0] ?? null,
      batch_size: 0,
      token_prefix_len: accessToken?.length ?? 0,
      sample_url_path: null,
      last_status: null,
      last_body_message: null,
      ids_filtered_out,
      probe_single_status: null,
      fallback_mode: null,
      fallback_singles_attempted: 0,
      fallback_singles_succeeded: 0,
      fallback_singles_failed: 0,
      rate_limited: false,
      retry_after_seconds: null,
      skipped_reason: null,
    },
  }
  if (filtered.length === 0) return out

  // Phase 6A.12: operator-controlled opt-out. When SPOTIFY_CATALOG_HYDRATION_MODE
  // is 'disabled', skip the network call entirely. The recommendation
  // pipeline runs on /me/* (already fetched above) + Last.fm enrichment.
  // Logged so the audit row shows the skip cause.
  if (!shouldAttemptHydration(mode)) {
    out.diagnostics.skipped_reason = 'mode:disabled'
    console.log('[spotify/hydrate] skipped — mode=disabled', {
      collected: filtered.length,
    })
    return out
  }

  const REQUEST_HEADERS: HeadersInit = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  }

  for (let i = 0; i < filtered.length; i += 50) {
    // Stop trying further batches once Spotify has rate-limited us.
    // Already-hydrated entries from earlier batches stay in out.map
    // and will still flow through to favorite_artists. Continuing
    // would just spend latency racking up more 429s.
    if (out.diagnostics.rate_limited) break

    const batch = filtered.slice(i, i + 50)
    const url = `${API_BASE}/artists?ids=${batch.join(',')}`
    out.attempted += 1
    if (i === 0) {
      out.diagnostics.batch_size = batch.length
      // Safe: just path + truncated query (no token, no user data).
      const pathPart = url.slice(API_BASE.length)
      out.diagnostics.sample_url_path =
        pathPart.length > 80 ? pathPart.slice(0, 80) + '…' : pathPart
    }

    let res: Response
    try {
      res = await fetch(url, {
        headers: REQUEST_HEADERS,
        cache: 'no-store',
      })
    } catch (err) {
      out.lastStatus = 0
      out.lastError = `fetch failed: ${
        err instanceof Error ? err.message : String(err)
      }`
      out.diagnostics.last_status = 0
      out.diagnostics.last_body_message = out.lastError
      console.warn('[spotify/hydrate] fetch threw', {
        batch_index: i / 50,
        message: out.lastError,
      })
      continue
    }

    if (!res.ok) {
      out.lastStatus = res.status
      let detail = ''
      try {
        const body = (await res.json()) as { error?: { message?: string } }
        detail = body?.error?.message ?? ''
      } catch {
        // ignore body parse failure
      }
      out.lastError = detail ? `${res.status}: ${detail}` : `HTTP ${res.status}`
      out.diagnostics.last_status = res.status
      out.diagnostics.last_body_message = detail || null
      console.warn('[spotify/hydrate] batch failed', {
        batch_index: i / 50,
        batch_size: batch.length,
        status: res.status,
        detail,
        first_id: batch[0],
      })

      // On the FIRST batch failure, probe a single artist via the
      // path-form endpoint. If that returns 200 we know it's the
      // ids-list form that's blocked; if it also 403s, the entire
      // /v1/artists catalog is gated for this token. Result lands
      // in diagnostics.probe_single_status.
      if (out.diagnostics.probe_single_status === null) {
        try {
          const probeRes = await fetch(`${API_BASE}/artists/${batch[0]}`, {
            headers: REQUEST_HEADERS,
            cache: 'no-store',
          })
          out.diagnostics.probe_single_status = probeRes.status
          console.warn('[spotify/hydrate] single-id probe', {
            id: batch[0],
            status: probeRes.status,
          })
        } catch {
          out.diagnostics.probe_single_status = 0
        }
      }

      // Phase-4.4 graceful fallback: if the batch endpoint is 403'd
      // but the single-id probe came back ok (or we haven't probed
      // yet — first batch's probe is on this same iteration), drop
      // to per-id hydration for THIS batch. Concurrency-limited so
      // we don't hammer Spotify with 50 simultaneous requests.
      const singleEndpointWorks =
        out.diagnostics.probe_single_status === 200 ||
        (out.diagnostics.probe_single_status === null && res.status === 403)
      if (res.status === 403 && singleEndpointWorks) {
        out.diagnostics.fallback_mode = 'batch_to_single'
        const fb = await hydrateBatchAsSingles(batch, REQUEST_HEADERS)
        out.diagnostics.fallback_singles_attempted += fb.attempted
        out.diagnostics.fallback_singles_succeeded += fb.succeeded
        out.diagnostics.fallback_singles_failed += fb.failed
        // CRITICAL: merge whatever the fallback hydrated into our
        // outcome map FIRST, regardless of whether it stopped early.
        // A late 429 cannot poison the entries that already came back
        // with full payloads — they're persisted via the upsert that
        // reads from out.map at the end.
        for (const [k, v] of fb.map) out.map.set(k, v)
        if (fb.stopped_for_rate_limit) {
          out.diagnostics.rate_limited = true
          out.diagnostics.retry_after_seconds = fb.retry_after_seconds
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log('[spotify/hydrate] fallback ran', {
            batch_index: i / 50,
            attempted: fb.attempted,
            succeeded: fb.succeeded,
            failed: fb.failed,
            map_size_after_merge: out.map.size,
            stopped_for_rate_limit: fb.stopped_for_rate_limit,
          })
        }
      }
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

  // Phase 4.4: if the batch endpoint failed but the per-id fallback
  // fully recovered the hydration map, clear lastError so the UI's
  // burgundy "hydration: …" line stays quiet. The diagnostic strip
  // still shows "0/N batches" — which is honest documentation that
  // the catalog endpoint is blocked — but the headline error goes
  // away because we ARE actually hydrated.
  const d = out.diagnostics
  const fullyRecovered =
    out.lastError !== null &&
    d.fallback_mode === 'batch_to_single' &&
    out.map.size >= filtered.length

  if (fullyRecovered) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[spotify/hydrate] fully recovered via single-id fallback', {
        hydrated: out.map.size,
        collected: filtered.length,
        fallback_attempted: d.fallback_singles_attempted,
        fallback_succeeded: d.fallback_singles_succeeded,
      })
    }
    out.lastError = null
    out.lastStatus = null
    return out
  }

  // Otherwise enrich the user-visible lastError with the safe
  // diagnostics gathered above. Lets us see exactly which input shape
  // Spotify is rejecting and how the fallback fared, without adding
  // any new UI plumbing.
  if (out.lastError) {
    const firstId = d.first_id ? d.first_id.slice(0, 8) + '…' : '∅'
    const probe = d.probe_single_status === null ? '?' : String(d.probe_single_status)
    const fb =
      d.fallback_mode === 'batch_to_single'
        ? ` fb=${d.fallback_singles_succeeded}/${d.fallback_singles_attempted}`
        : ''
    const rl = d.rate_limited
      ? ` rl=429${d.retry_after_seconds !== null ? ` retry=${d.retry_after_seconds}s` : ''}`
      : ''
    out.lastError =
      `${out.lastError}` +
      ` | bs=${d.batch_size}` +
      ` first=${firstId}` +
      ` tpl=${d.token_prefix_len}` +
      ` filt=${d.ids_filtered_out}` +
      ` url=${d.sample_url_path ?? '∅'}` +
      ` probe=${probe}` +
      fb +
      rl +
      ` map=${out.map.size}`
  }

  return out
}

/**
 * Per-id hydration fallback for a single batch when the
 * /v1/artists?ids=… form is blocked by Spotify's WAF but the
 * /v1/artists/{id} form works (single-id probe confirmed it).
 *
 * Concurrency capped at 2 — low enough to stay under Spotify's
 * per-IP rate limit while still finishing a 50-id batch in
 * reasonable time. Workers share a cursor + a stop flag.
 *
 * 429 handling:
 *   - First worker to see a 429 sets the shared stop flag and
 *     captures Spotify's Retry-After header (seconds, when present).
 *   - All workers (including the one in flight) bail BEFORE issuing
 *     the next request. Already-hydrated entries in the local map
 *     are preserved and returned to the caller — a late 429 does NOT
 *     erase the work that already succeeded.
 *   - The caller is responsible for not invoking another fallback
 *     after stopped_for_rate_limit becomes true.
 *
 * Errors on individual ids beyond 429 are counted (`failed += 1`)
 * and skipped — no retries, no poisoning of siblings.
 */
async function hydrateBatchAsSingles(
  ids: string[],
  headers: HeadersInit,
): Promise<{
  map: Map<string, HydratedArtist>
  attempted: number
  succeeded: number
  failed: number
  stopped_for_rate_limit: boolean
  retry_after_seconds: number | null
}> {
  const map = new Map<string, HydratedArtist>()
  let attempted = 0
  let succeeded = 0
  let failed = 0
  let stopped_for_rate_limit = false
  let retry_after_seconds: number | null = null
  const CONCURRENCY = 2
  let cursor = 0

  async function worker() {
    while (true) {
      // Bail BEFORE issuing the next request if any worker has seen
      // a 429. This is what guarantees partial successes survive.
      if (stopped_for_rate_limit) return
      const i = cursor
      cursor += 1
      if (i >= ids.length) return
      const id = ids[i]
      attempted += 1
      try {
        const res = await fetch(`${API_BASE}/artists/${id}`, {
          headers,
          cache: 'no-store',
        })
        if (res.status === 429) {
          // Capture Retry-After once. Spotify returns it in seconds
          // (per RFC 7231 §7.1.3). Parse defensively.
          if (retry_after_seconds === null) {
            const raw = res.headers.get('retry-after')
            const parsed = raw ? Number(raw) : NaN
            retry_after_seconds = Number.isFinite(parsed) ? parsed : null
          }
          stopped_for_rate_limit = true
          failed += 1
          console.warn('[spotify/hydrate] 429 — stopping fallback', {
            id,
            retry_after_seconds,
            map_size_at_stop: map.size,
          })
          return
        }
        if (!res.ok) {
          failed += 1
          continue
        }
        const body = (await res.json()) as HydratedArtist
        if (body?.id) {
          map.set(body.id, body)
          succeeded += 1
        } else {
          failed += 1
        }
      } catch {
        failed += 1
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  return { map, attempted, succeeded, failed, stopped_for_rate_limit, retry_after_seconds }
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
