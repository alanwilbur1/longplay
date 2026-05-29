'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { initiateConnection } from '@/lib/actions/streaming'
import { markListeningAction } from '@/lib/actions/ritual'
import {
  summarizeWebPlaybackState,
  playbackProgressFraction,
  formatPlaybackPosition,
  trackUriFromId,
  type RawWebPlaybackState,
  type PlaybackSnapshot,
} from '@/lib/spotify/playback-state'

/**
 * components/ritual/in-room-spotify-player.tsx — Phase 6B.4A / 6B.4B
 *
 * Authenticated, ALBUM-FIRST in-room Spotify playback. The listening
 * surface is the album: the full tracklist is rendered, any track is
 * clickable, and the currently-playing track is highlighted. Playback
 * always runs from the album context (spotify:album:…) so it plays as
 * a record, not a single.
 *
 * Readiness (6B.4B fix for the "device not ready" race):
 *   1. GET /api/spotify/playback-token gates everything (connect /
 *      reconnect / Premium). Refresh token never reaches the client.
 *   2. The Web Playback SDK registers a "LongPlay" device. The SDK
 *      'ready' event gives a device_id, but the device is not yet the
 *      ACTIVE device on Spotify's backend — playing immediately 404s.
 *   3. So on 'ready' we EXPLICITLY transfer playback to the device
 *      (PUT /me/player), retrying through the propagation window, and
 *      only mark `transferReady` once it succeeds. Play / track-clicks
 *      are disabled until then — no play request can fire early.
 *   4. Play starts the album context (optionally with a per-track
 *      `offset` for click-to-play). The first successful play marks
 *      ritual participation 'listening' (never auto-completes).
 *
 * Tracklist source (6B.4B fix for empty tracklists):
 *   - DB album_tracks, when present, arrive as `initialTracks` (fast
 *     path; no network).
 *   - Otherwise we hydrate from Spotify using the listener's USER
 *     token (/v1/albums/{id}/tracks). Unlike the client-credentials
 *     catalog token, the user token is not subject to the app-tier
 *     catalog restriction, so this reliably returns the full list.
 *   - Never fabricated.
 */

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js'
const DEVICE_NAME = 'LongPlay'
const SPOTIFY_API = 'https://api.spotify.com/v1'
// Transfer retry envelope — covers the device-registration propagation
// window without hanging the UI.
const TRANSFER_MAX_ATTEMPTS = 6
const TRANSFER_BASE_DELAY_MS = 400

// ── Minimal Spotify Web Playback SDK typings ───────────────────────
interface SpotifyPlayerInstance {
  connect: () => Promise<boolean>
  disconnect: () => void
  addListener: (event: string, cb: (payload: unknown) => void) => boolean
  removeListener: (event: string) => boolean
  getCurrentState: () => Promise<RawWebPlaybackState | null>
  togglePlay: () => Promise<void>
  nextTrack: () => Promise<void>
  previousTrack: () => Promise<void>
}
interface SpotifyNamespace {
  Player: new (opts: {
    name: string
    getOAuthToken: (cb: (token: string) => void) => void
    volume?: number
  }) => SpotifyPlayerInstance
}
declare global {
  interface Window {
    Spotify?: SpotifyNamespace
    onSpotifyWebPlaybackSDKReady?: () => void
  }
}

// ── Token route response shape ─────────────────────────────────────
type PlaybackTokenResponse =
  | { status: 'not_authenticated' }
  | { status: 'not_connected' }
  | { status: 'reauth_required' }
  | { status: 'missing_scopes'; missing: string[] }
  | { status: 'error'; message?: string }
  | {
      status: 'ok'
      accessToken: string
      expiresAt: string | null
      product: string | null
      premium: boolean
      scopes: string[]
    }

type Gate =
  | 'loading'
  | 'not_connected'
  | 'reauth'
  | 'not_premium'
  | 'eligible'
  | 'error'

/** Normalized track the album surface renders + plays. */
interface PlayerTrack {
  number: number
  title: string
  durationMs: number | null
  /** Full 'spotify:track:…' URI for offset playback + highlight. */
  uri: string
}

/** DB-sourced track shape passed in by the server (album_tracks). */
export interface InitialAlbumTrack {
  number: number
  title: string
  durationMs: number | null
  spotifyTrackId: string
}

async function fetchPlaybackToken(): Promise<PlaybackTokenResponse> {
  const res = await fetch('/api/spotify/playback-token', { cache: 'no-store' })
  return (await res.json()) as PlaybackTokenResponse
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface InRoomSpotifyPlayerProps {
  spotifyAlbumId: string
  /** DB album_tracks for this album, when already hydrated. Empty/omitted
   *  → the player hydrates from Spotify with the user token. */
  initialTracks?: ReadonlyArray<InitialAlbumTrack>
  /** Active ritual cycle id, when there is one. Drives the
   *  'listening' participation mark on first play. */
  ritualCycleId: string | null
  /** Room slug — returnTo for the reconnect flow. */
  roomSlug: string
  /** Fires once when playback first starts (continuity mark). */
  onPlaybackStarted?: () => void
  aesthetics: {
    borderTint: string
    primaryAccent: string
  }
}

export function InRoomSpotifyPlayer({
  spotifyAlbumId,
  initialTracks,
  ritualCycleId,
  roomSlug,
  onPlaybackStarted,
  aesthetics,
}: InRoomSpotifyPlayerProps) {
  const [gate, setGate] = useState<Gate>('loading')
  const [deviceReady, setDeviceReady] = useState(false)
  const [transferReady, setTransferReady] = useState(false)
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(null)
  const [tracks, setTracks] = useState<PlayerTrack[] | null>(
    normalizeInitialTracks(initialTracks),
  )
  const [startingUri, setStartingUri] = useState<string | null>(null)
  const [playbackError, setPlaybackError] = useState<string | null>(null)

  const playerRef = useRef<SpotifyPlayerInstance | null>(null)
  const deviceIdRef = useRef<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const listeningMarkedRef = useRef(false)
  const openInSpotify = `https://open.spotify.com/album/${spotifyAlbumId}`

  // Resolve a fresh token, caching it, and map non-ok statuses onto the
  // gate so the UI degrades honestly. Returns null when no token.
  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      const r = await fetchPlaybackToken()
      if (r.status === 'ok') {
        tokenRef.current = r.accessToken
        return r.accessToken
      }
      setGate(
        r.status === 'reauth_required' || r.status === 'missing_scopes'
          ? 'reauth'
          : r.status === 'not_connected' || r.status === 'not_authenticated'
            ? 'not_connected'
            : 'error',
      )
      return null
    } catch {
      setGate('error')
      return null
    }
  }, [])

  // ── 1. Gate on the token route. ──────────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetchPlaybackToken()
      .then((r) => {
        if (cancelled) return
        if (r.status === 'ok') tokenRef.current = r.accessToken
        switch (r.status) {
          case 'ok':
            setGate(r.premium ? 'eligible' : 'not_premium')
            break
          case 'not_connected':
          case 'not_authenticated':
            setGate('not_connected')
            break
          case 'reauth_required':
          case 'missing_scopes':
            setGate('reauth')
            break
          default:
            setGate('error')
        }
      })
      .catch(() => {
        if (!cancelled) setGate('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── 2. Hydrate the tracklist (album-first). ──────────────────────
  // DB tracks (initialTracks) already populated state synchronously.
  // When absent, fetch from Spotify with the USER token once eligible.
  useEffect(() => {
    if (gate !== 'eligible') return
    if (tracks && tracks.length > 0) return
    let cancelled = false
    ;(async () => {
      const token = tokenRef.current ?? (await getToken())
      if (!token || cancelled) return
      const fetched = await fetchAlbumTracksWithUserToken(spotifyAlbumId, token)
      if (!cancelled && fetched.length > 0) setTracks(fetched)
    })()
    return () => {
      cancelled = true
    }
  }, [gate, spotifyAlbumId, tracks, getToken])

  // ── 3. Transfer playback to the LongPlay device, with retry. ─────
  // The single source of the "device not ready" race: a freshly-ready
  // device isn't yet active on Spotify's backend. We transfer (play
  // paused) and retry through the propagation window; only then is
  // playback allowed.
  const ensureTransfer = useCallback(
    async (deviceId: string): Promise<boolean> => {
      const token = tokenRef.current ?? (await getToken())
      if (!token) return false
      for (let attempt = 0; attempt < TRANSFER_MAX_ATTEMPTS; attempt++) {
        let res: Response
        try {
          res = await fetch(`${SPOTIFY_API}/me/player`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ device_ids: [deviceId], play: false }),
          })
        } catch {
          await delay(TRANSFER_BASE_DELAY_MS * (attempt + 1))
          continue
        }
        if (res.ok || res.status === 202 || res.status === 204) return true
        if (res.status === 401) {
          setGate('reauth')
          return false
        }
        if (res.status === 403) {
          setGate('not_premium')
          return false
        }
        // 404 (device not registered yet) / 5xx → wait and retry.
        await delay(TRANSFER_BASE_DELAY_MS * (attempt + 1))
      }
      return false
    },
    [getToken],
  )

  // ── 4. Load the SDK + register the device when eligible. ─────────
  useEffect(() => {
    if (gate !== 'eligible') return
    let disposed = false

    const init = () => {
      if (disposed || playerRef.current) return
      const Spotify = window.Spotify
      if (!Spotify) return
      const player = new Spotify.Player({
        name: DEVICE_NAME,
        volume: 0.8,
        getOAuthToken: (cb) => {
          fetchPlaybackToken()
            .then((r) => {
              if (r.status === 'ok') tokenRef.current = r.accessToken
              cb(r.status === 'ok' ? r.accessToken : '')
            })
            .catch(() => cb(''))
        },
      })
      playerRef.current = player

      player.addListener('ready', (payload) => {
        const { device_id } = payload as { device_id: string }
        deviceIdRef.current = device_id
        setDeviceReady(true)
        // Explicit transfer closes the readiness race before any play.
        ensureTransfer(device_id).then((ok) => {
          if (!disposed) setTransferReady(ok)
        })
      })
      player.addListener('not_ready', () => {
        setDeviceReady(false)
        setTransferReady(false)
      })
      player.addListener('initialization_error', (payload) => {
        setGate('error')
        setPlaybackError((payload as { message: string }).message)
      })
      player.addListener('authentication_error', () => setGate('reauth'))
      player.addListener('account_error', () => setGate('not_premium'))
      player.addListener('playback_error', (payload) => {
        setPlaybackError((payload as { message: string }).message)
      })
      player.addListener('player_state_changed', (payload) => {
        setSnapshot(
          summarizeWebPlaybackState(payload as RawWebPlaybackState | null),
        )
      })

      player.connect()
    }

    if (window.Spotify) {
      init()
    } else {
      window.onSpotifyWebPlaybackSDKReady = init
      if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
        const script = document.createElement('script')
        script.src = SDK_SRC
        script.async = true
        document.body.appendChild(script)
      }
    }

    return () => {
      disposed = true
      const p = playerRef.current
      if (p) {
        try {
          p.disconnect()
        } catch {
          /* ignore */
        }
      }
      playerRef.current = null
      deviceIdRef.current = null
    }
  }, [gate, ensureTransfer])

  // ── 5. Poll current state for live progress + highlight. ─────────
  useEffect(() => {
    if (gate !== 'eligible') return
    const id = window.setInterval(() => {
      const p = playerRef.current
      if (!p) return
      p.getCurrentState()
        .then((state) => setSnapshot(summarizeWebPlaybackState(state)))
        .catch(() => {})
    }, 1000)
    return () => window.clearInterval(id)
  }, [gate])

  // ── Playback ─────────────────────────────────────────────────────
  // Album-context playback. `offsetUri` set → start from that track;
  // omitted → start from the top. Disabled until transfer is complete,
  // so no request fires into the readiness window.
  const startPlayback = useCallback(
    async (offsetUri?: string) => {
      const deviceId = deviceIdRef.current
      if (!transferReady || !deviceId) return
      setStartingUri(offsetUri ?? '')
      setPlaybackError(null)
      try {
        const token = tokenRef.current ?? (await getToken())
        if (!token) return
        const body: { context_uri: string; offset?: { uri: string } } = {
          context_uri: `spotify:album:${spotifyAlbumId}`,
        }
        if (offsetUri) body.offset = { uri: offsetUri }

        const playPut = (t: string) =>
          fetch(
            `${SPOTIFY_API}/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${t}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
            },
          )

        let res = await playPut(token)
        // Defensive: if the device dropped active status, re-transfer once.
        if (res.status === 404) {
          const ok = await ensureTransfer(deviceId)
          if (ok) res = await playPut(tokenRef.current ?? token)
        }

        if (!res.ok && res.status !== 202 && res.status !== 204) {
          if (res.status === 403) setGate('not_premium')
          else if (res.status === 401) setGate('reauth')
          else
            setPlaybackError(
              res.status === 404
                ? 'Playback device not ready yet — try again in a moment.'
                : `Playback could not start (Spotify ${res.status}).`,
            )
          return
        }

        if (!listeningMarkedRef.current) {
          listeningMarkedRef.current = true
          onPlaybackStarted?.()
          if (ritualCycleId) void markListeningAction(ritualCycleId)
        }
      } catch {
        setPlaybackError('Playback could not start. Check your connection.')
      } finally {
        setStartingUri(null)
      }
    },
    [transferReady, spotifyAlbumId, ritualCycleId, onPlaybackStarted, getToken, ensureTransfer],
  )

  const handleToggle = useCallback(() => {
    playerRef.current?.togglePlay().catch(() => {})
  }, [])
  const handleNext = useCallback(() => {
    playerRef.current?.nextTrack().catch(() => {})
  }, [])
  const handlePrev = useCallback(() => {
    playerRef.current?.previousTrack().catch(() => {})
  }, [])

  // ── Non-eligible fallbacks (unchanged behavior). ─────────────────
  if (gate === 'loading') {
    return (
      <Frame aesthetics={aesthetics}>
        <p className="text-[11px] text-muted-foreground/50 italic">
          Preparing in-room playback…
        </p>
      </Frame>
    )
  }
  if (gate === 'not_connected') {
    return (
      <Frame aesthetics={aesthetics}>
        <p className="text-[12px] text-muted-foreground/70 mb-2">
          Connect Spotify to listen inside the room.
        </p>
        <ReconnectButton roomSlug={roomSlug} aesthetics={aesthetics} label="Connect Spotify" />
      </Frame>
    )
  }
  if (gate === 'reauth') {
    return (
      <Frame aesthetics={aesthetics}>
        <p className="text-[12px] text-muted-foreground/70 mb-2">
          Reconnect Spotify to enable in-room playback.
        </p>
        <ReconnectButton roomSlug={roomSlug} aesthetics={aesthetics} label="Reconnect Spotify" />
      </Frame>
    )
  }
  if (gate === 'not_premium') {
    return (
      <Frame aesthetics={aesthetics}>
        <p className="text-[12px] text-muted-foreground/70 mb-2">
          In-room playback requires Spotify Premium.
        </p>
        <OpenInSpotify href={openInSpotify} aesthetics={aesthetics} />
      </Frame>
    )
  }
  if (gate === 'error') {
    return (
      <Frame aesthetics={aesthetics}>
        <p className="text-[12px] text-muted-foreground/70 mb-2">
          In-room playback isn&apos;t available in this browser right now.
        </p>
        <OpenInSpotify href={openInSpotify} aesthetics={aesthetics} />
      </Frame>
    )
  }

  // ── gate === 'eligible' — album-first surface. ───────────────────
  const currentUri = snapshot?.current?.uri ?? null
  const isPaused = snapshot?.isPaused ?? true
  const hasTrack = snapshot?.current != null
  const progress = snapshot
    ? playbackProgressFraction(snapshot.positionMs, snapshot.durationMs)
    : 0
  const interactionsReady = transferReady

  return (
    <Frame aesthetics={aesthetics}>
      <div className="flex flex-col gap-4">
        {/* Now-playing + transport (only once something is loaded) */}
        {hasTrack && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground/90 leading-tight truncate">
                  {snapshot!.current!.title}
                </p>
                {snapshot!.current!.artist && (
                  <p className="text-[11px] text-muted-foreground/60 truncate">
                    {snapshot!.current!.artist}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <ControlButton
                  onClick={handlePrev}
                  disabled={!snapshot!.canSkipPrev}
                  label="Previous track"
                >
                  ‹‹
                </ControlButton>
                <ControlButton onClick={handleToggle} label={isPaused ? 'Resume' : 'Pause'}>
                  {isPaused ? '►' : '❚❚'}
                </ControlButton>
                <ControlButton
                  onClick={handleNext}
                  disabled={!snapshot!.canSkipNext}
                  label="Next track"
                >
                  ››
                </ControlButton>
              </div>
            </div>
            {snapshot!.durationMs > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] tabular-nums text-muted-foreground/50 w-9 text-right">
                  {formatPlaybackPosition(snapshot!.positionMs)}
                </span>
                <div className="flex-1 h-[3px] rounded-full bg-foreground/10 overflow-hidden">
                  <div
                    className="h-full bg-foreground/40"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground/50 w-9">
                  {formatPlaybackPosition(snapshot!.durationMs)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Album tracklist — album-first listening surface. */}
        {tracks && tracks.length > 0 ? (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
                Tracklist
              </p>
              {!hasTrack && (
                <button
                  type="button"
                  onClick={() => startPlayback()}
                  disabled={!interactionsReady || startingUri !== null}
                  className={cn(
                    'text-[11px] tracking-wide italic transition-opacity',
                    aesthetics.primaryAccent,
                    !interactionsReady || startingUri !== null
                      ? 'opacity-40'
                      : 'opacity-80 hover:opacity-100',
                  )}
                >
                  {startingUri === '' ? 'Starting…' : 'Play album'}
                </button>
              )}
            </div>
            <ol className="space-y-0.5">
              {tracks.map((t) => {
                const isCurrent = currentUri != null && currentUri === t.uri
                const isStarting = startingUri === t.uri
                return (
                  <li key={t.uri}>
                    <button
                      type="button"
                      onClick={() => startPlayback(t.uri)}
                      disabled={!interactionsReady || startingUri !== null}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={cn(
                        'group flex w-full items-baseline gap-4 rounded-sm px-2 py-1.5 text-left text-sm leading-snug transition-colors',
                        interactionsReady && startingUri === null
                          ? 'hover:bg-foreground/5 cursor-pointer'
                          : 'cursor-default',
                        isCurrent ? 'bg-foreground/5' : '',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'shrink-0 w-6 font-mono text-[11px] tabular-nums text-right',
                          isCurrent
                            ? aesthetics.primaryAccent
                            : 'text-muted-foreground/40',
                        )}
                      >
                        {isCurrent ? (isPaused ? '►' : '❚❚') : t.number}
                      </span>
                      <span
                        className={cn(
                          'flex-1 font-serif',
                          isCurrent ? 'text-foreground' : 'text-cream/80',
                        )}
                      >
                        {t.title}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/40">
                        {isStarting ? '…' : formatTrackLength(t.durationMs)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            {!interactionsReady && (
              <p className="mt-2 text-[11px] text-muted-foreground/50 italic">
                Preparing the LongPlay player…
              </p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/50 italic">
            {deviceReady
              ? 'Loading album…'
              : 'Connecting the LongPlay player…'}
          </p>
        )}

        {playbackError && (
          <p className="text-[11px] text-muted-foreground/60">{playbackError}</p>
        )}
      </div>
    </Frame>
  )
}

// ── Helpers ────────────────────────────────────────────────────────

function normalizeInitialTracks(
  initial: ReadonlyArray<InitialAlbumTrack> | undefined,
): PlayerTrack[] | null {
  if (!initial || initial.length === 0) return null
  return initial.map((t) => ({
    number: t.number,
    title: t.title,
    durationMs: t.durationMs,
    uri: trackUriFromId(t.spotifyTrackId),
  }))
}

/** Format a track's millisecond length as "M:SS"; blank when unknown. */
function formatTrackLength(ms: number | null): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return ''
  return formatPlaybackPosition(ms)
}

interface SpotifyAlbumTracksPage {
  items?: Array<{
    id?: string
    uri?: string
    name?: string
    track_number?: number
    duration_ms?: number
  }>
  next?: string | null
}

/**
 * Fetch the full album tracklist with the listener's USER token.
 * Paginates /v1/albums/{id}/tracks. Returns [] on any failure — the
 * caller keeps whatever it had (no fabrication).
 */
async function fetchAlbumTracksWithUserToken(
  albumId: string,
  token: string,
): Promise<PlayerTrack[]> {
  const out: PlayerTrack[] = []
  let url: string | null =
    `${SPOTIFY_API}/albums/${encodeURIComponent(albumId)}/tracks?limit=50`
  try {
    while (url) {
      const res: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) return out.length > 0 ? out : []
      const page = (await res.json()) as SpotifyAlbumTracksPage
      for (const item of page.items ?? []) {
        if (!item?.uri || !item?.name) continue
        out.push({
          number: typeof item.track_number === 'number' ? item.track_number : out.length + 1,
          title: item.name,
          durationMs: typeof item.duration_ms === 'number' ? item.duration_ms : null,
          uri: item.uri,
        })
      }
      url = page.next ?? null
    }
  } catch {
    return out
  }
  return out
}

// ── Presentational helpers ─────────────────────────────────────────

function Frame({
  aesthetics,
  children,
}: {
  aesthetics: { borderTint: string }
  children: React.ReactNode
}) {
  return (
    <div className={cn('overflow-hidden rounded-sm border px-4 py-4', aesthetics.borderTint)}>
      {children}
    </div>
  )
}

function ControlButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'text-sm leading-none transition-opacity',
        disabled
          ? 'opacity-25 cursor-default'
          : 'opacity-70 hover:opacity-100 text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function ReconnectButton({
  roomSlug,
  aesthetics,
  label,
}: {
  roomSlug: string
  aesthetics: { primaryAccent: string }
  label: string
}) {
  return (
    <form action={initiateConnection}>
      <input type="hidden" name="source" value="spotify" />
      <input type="hidden" name="returnTo" value={`/rooms/${roomSlug}`} />
      <button
        type="submit"
        className={cn(
          'text-[12px] tracking-wide italic transition-opacity opacity-80 hover:opacity-100',
          aesthetics.primaryAccent,
        )}
      >
        {label}
      </button>
    </form>
  )
}

function OpenInSpotify({
  href,
  aesthetics,
}: {
  href: string
  aesthetics: { primaryAccent: string }
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'text-[12px] tracking-wide italic transition-opacity opacity-80 hover:opacity-100',
        aesthetics.primaryAccent,
      )}
    >
      Open in Spotify
    </a>
  )
}
