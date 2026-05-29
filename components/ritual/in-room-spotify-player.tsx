'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { initiateConnection } from '@/lib/actions/streaming'
import { markListeningAction } from '@/lib/actions/ritual'
import {
  summarizeWebPlaybackState,
  playbackProgressFraction,
  formatPlaybackPosition,
  trackUriFromId,
  resolveAlbumCurrentUri,
  type RawWebPlaybackState,
  type PlaybackSnapshot,
} from '@/lib/spotify/playback-state'

/**
 * components/ritual/in-room-spotify-player.tsx — Phase 6B.4A / 4B / 4C
 *
 * Authenticated, ROOM-ALBUM-SCOPED in-room playback. The player is a
 * player for THIS room's album — not a global Spotify remote.
 *
 * Three concepts are kept strictly separate (6B.4C):
 *   A. Album identity   — the `spotifyAlbumId` prop. Known instantly,
 *                         never overwritten by playback state.
 *   B. Album tracklist  — fetched independently (DB fast-path, else
 *                         user-token album fetch) with a timeout +
 *                         error state. Renders regardless of device or
 *                         current playback.
 *   C. Current playback — the SDK device state. Used ONLY to highlight
 *                         a track when the currently-playing URI
 *                         belongs to THIS album's tracklist. Playback
 *                         of any other album is ignored by this room.
 *
 * Readiness (6B.4C):
 *   - We initialize the SDK and wait for a device id with a TIMEOUT.
 *     If the device never becomes ready we show a clear error + retry,
 *     never an indefinite spinner.
 *   - We do NOT transfer playback on load (that would adopt/pause
 *     whatever is playing elsewhere). Transfer happens only when the
 *     listener presses Play / a track, so opening a room is inert.
 *   - Play always uses context_uri = spotify:album:{albumId}; a track
 *     click adds an offset. The first play starts track 1.
 */

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js'
const DEVICE_NAME = 'LongPlay'
const SPOTIFY_API = 'https://api.spotify.com/v1'
// Don't leave the listener waiting forever — fail clearly instead.
const TRACKS_TIMEOUT_MS = 10_000
const DEVICE_TIMEOUT_MS = 15_000
// Transfer retry envelope (play-time only) for the registration window.
const TRANSFER_MAX_ATTEMPTS = 4
const TRANSFER_BASE_DELAY_MS = 350

function debugLog(event: string, data: Record<string, unknown>) {
  // Surfaces in the browser console. Intentionally kept for the
  // Illinois/Pitchfork investigation (6B.4C requirement #8).
  // eslint-disable-next-line no-console
  console.log(`[in-room-player] ${event}`, data)
}

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

type TracksStatus = 'loading' | 'ready' | 'error'
type DeviceState = 'connecting' | 'ready' | 'failed'

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

  // Concept B — tracklist (independent of device + playback).
  const initialNormalized = useMemo(
    () => normalizeInitialTracks(initialTracks),
    [initialTracks],
  )
  const [tracks, setTracks] = useState<PlayerTrack[] | null>(initialNormalized)
  const [tracksStatus, setTracksStatus] = useState<TracksStatus>(
    initialNormalized ? 'ready' : 'loading',
  )
  const [tracksAttempt, setTracksAttempt] = useState(0)

  // Concept C — device + playback state.
  const [deviceState, setDeviceState] = useState<DeviceState>('connecting')
  const [deviceAttempt, setDeviceAttempt] = useState(0)
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(null)

  const [startingUri, setStartingUri] = useState<string | null>(null)
  const [playbackError, setPlaybackError] = useState<string | null>(null)

  const playerRef = useRef<SpotifyPlayerInstance | null>(null)
  const deviceIdRef = useRef<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const listeningMarkedRef = useRef(false)
  const openInSpotify = `https://open.spotify.com/album/${spotifyAlbumId}`

  // Concept A — log resolved album identity once (requirement #8).
  useEffect(() => {
    debugLog('album-identity', {
      spotifyAlbumId,
      roomSlug,
      hasInitialTracks: (initialNormalized?.length ?? 0) > 0,
      initialTrackCount: initialNormalized?.length ?? 0,
    })
  }, [spotifyAlbumId, roomSlug, initialNormalized])

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

  // ── 2. Concept B: hydrate the tracklist, independent of device. ──
  // DB initialTracks already populated state. Otherwise fetch from
  // Spotify with the USER token, with a hard timeout → error state.
  // NEVER stays on "Loading album…" indefinitely.
  useEffect(() => {
    if (gate !== 'eligible') return
    // Already have DB tracks → nothing to fetch.
    if (initialNormalized && initialNormalized.length > 0) {
      setTracks(initialNormalized)
      setTracksStatus('ready')
      debugLog('tracks-hydration', {
        spotifyAlbumId,
        source: 'db',
        ok: true,
        count: initialNormalized.length,
      })
      return
    }

    let cancelled = false
    setTracksStatus('loading')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), TRACKS_TIMEOUT_MS)

    ;(async () => {
      const token = tokenRef.current ?? (await getToken())
      if (cancelled) return
      if (!token) {
        setTracksStatus('error')
        debugLog('tracks-hydration', { spotifyAlbumId, source: 'user-token', ok: false, reason: 'no-token' })
        return
      }
      const result = await fetchAlbumTracksWithUserToken(
        spotifyAlbumId,
        token,
        controller.signal,
      )
      if (cancelled) return
      if (result.ok && result.tracks.length > 0) {
        setTracks(result.tracks)
        setTracksStatus('ready')
      } else {
        setTracksStatus('error')
      }
      debugLog('tracks-hydration', {
        spotifyAlbumId,
        source: 'user-token',
        ok: result.ok,
        count: result.ok ? result.tracks.length : 0,
        status: result.ok ? 200 : result.status,
        detail: result.ok ? null : result.detail,
      })
    })()

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [gate, spotifyAlbumId, initialNormalized, tracksAttempt, getToken])

  // ── 3. Concept C: SDK init + device readiness, with timeout. ─────
  // No transfer here — we never adopt global playback on load.
  useEffect(() => {
    if (gate !== 'eligible') return
    let disposed = false
    setDeviceState('connecting')

    // Timeout → clear failure, never an indefinite spinner.
    const readyTimeout = window.setTimeout(() => {
      if (disposed) return
      if (!deviceIdRef.current) {
        setDeviceState('failed')
        debugLog('device-ready', { spotifyAlbumId, ok: false, reason: 'timeout' })
      }
    }, DEVICE_TIMEOUT_MS)

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
        if (!disposed) setDeviceState('ready')
        debugLog('device-ready', { spotifyAlbumId, ok: true, deviceId: device_id })
      })
      player.addListener('not_ready', () => {
        if (!disposed) setDeviceState('connecting')
      })
      player.addListener('initialization_error', (payload) => {
        setDeviceState('failed')
        setPlaybackError((payload as { message: string }).message)
        debugLog('device-ready', { spotifyAlbumId, ok: false, reason: 'init_error' })
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
      window.clearTimeout(readyTimeout)
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
  }, [gate, spotifyAlbumId, deviceAttempt])

  // ── 4. Poll current state (only while device ready). ─────────────
  // getCurrentState returns null unless OUR device is active, so this
  // does not leak another room's playback before the user plays here.
  useEffect(() => {
    if (gate !== 'eligible' || deviceState !== 'ready') return
    const id = window.setInterval(() => {
      const p = playerRef.current
      if (!p) return
      p.getCurrentState()
        .then((state) => setSnapshot(summarizeWebPlaybackState(state)))
        .catch(() => {})
    }, 1000)
    return () => window.clearInterval(id)
  }, [gate, deviceState])

  // Transfer playback to our device (play-time only), with retry.
  const ensureTransfer = useCallback(
    async (deviceId: string, token: string): Promise<boolean> => {
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
        if (res.ok || res.status === 202 || res.status === 204) {
          debugLog('device-transfer', { spotifyAlbumId, ok: true })
          return true
        }
        if (res.status === 401) {
          setGate('reauth')
          return false
        }
        if (res.status === 403) {
          setGate('not_premium')
          return false
        }
        await delay(TRANSFER_BASE_DELAY_MS * (attempt + 1))
      }
      debugLog('device-transfer', { spotifyAlbumId, ok: false })
      return false
    },
    [spotifyAlbumId],
  )

  // ── Playback ─────────────────────────────────────────────────────
  // Always album-context-scoped. `offsetUri` set → start at that track;
  // omitted → start at track 1. Transfers to our device first so we
  // replace (never resume) whatever was playing. Gated on device ready.
  const startPlayback = useCallback(
    async (offsetUri?: string) => {
      const deviceId = deviceIdRef.current
      if (deviceState !== 'ready' || !deviceId) return
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

        // Transfer first so this room's album replaces any unrelated
        // playback, then start the album context.
        await ensureTransfer(deviceId, token)
        let res = await playPut(token)
        if (res.status === 404) {
          // Device dropped active status — re-transfer once and retry.
          const ok = await ensureTransfer(deviceId, tokenRef.current ?? token)
          if (ok) res = await playPut(tokenRef.current ?? token)
        }

        if (!res.ok && res.status !== 202 && res.status !== 204) {
          if (res.status === 403) setGate('not_premium')
          else if (res.status === 401) setGate('reauth')
          else
            setPlaybackError(
              res.status === 404
                ? 'Spotify device did not become ready. Try again.'
                : `Playback could not start (Spotify ${res.status}).`,
            )
          debugLog('play', { spotifyAlbumId, ok: false, status: res.status, offsetUri: offsetUri ?? null })
          return
        }

        debugLog('play', { spotifyAlbumId, ok: true, offsetUri: offsetUri ?? null })
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
    [deviceState, spotifyAlbumId, ritualCycleId, onPlaybackStarted, getToken, ensureTransfer],
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

  const retryDevice = useCallback(() => {
    deviceIdRef.current = null
    const p = playerRef.current
    if (p) {
      try {
        p.disconnect()
      } catch {
        /* ignore */
      }
    }
    playerRef.current = null
    setDeviceState('connecting')
    setDeviceAttempt((n) => n + 1)
  }, [])

  const retryTracks = useCallback(() => {
    setTracksStatus('loading')
    setTracksAttempt((n) => n + 1)
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

  // ── gate === 'eligible' — album-first, room-scoped surface. ──────
  // Concept C filtered through Concept B: only treat the current track
  // as "ours" when its URI is in THIS album's tracklist.
  const albumUris = useMemo(
    () => new Set((tracks ?? []).map((t) => t.uri)),
    [tracks],
  )
  // Room-album scoping: the current URI counts only if it's in THIS
  // album. Anything else (another room's playback) is ignored here.
  const currentUri = resolveAlbumCurrentUri(snapshot?.current?.uri, albumUris)
  const currentInAlbum = currentUri != null
  const showNowPlaying = currentInAlbum
  const isPaused = snapshot?.isPaused ?? true
  const progress = snapshot
    ? playbackProgressFraction(snapshot.positionMs, snapshot.durationMs)
    : 0
  const interactionsReady = deviceState === 'ready' && startingUri === null

  return (
    <Frame aesthetics={aesthetics}>
      <div className="flex flex-col gap-4">
        {/* Now-playing + transport — ONLY when the current track is
            part of this room's album. Otherwise we stay in the album
            ready state and never show another room's track. */}
        {showNowPlaying && (
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
                <ControlButton onClick={handlePrev} disabled={!snapshot!.canSkipPrev} label="Previous track">
                  ‹‹
                </ControlButton>
                <ControlButton onClick={handleToggle} label={isPaused ? 'Resume' : 'Pause'}>
                  {isPaused ? '►' : '❚❚'}
                </ControlButton>
                <ControlButton onClick={handleNext} disabled={!snapshot!.canSkipNext} label="Next track">
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

        {/* Concept B — album tracklist. Renders independently of the
            device + playback state. */}
        {tracksStatus === 'ready' && tracks && tracks.length > 0 ? (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
                Tracklist
              </p>
              {!showNowPlaying && (
                <button
                  type="button"
                  onClick={() => startPlayback()}
                  disabled={!interactionsReady}
                  className={cn(
                    'text-[11px] tracking-wide italic transition-opacity',
                    aesthetics.primaryAccent,
                    !interactionsReady ? 'opacity-40' : 'opacity-80 hover:opacity-100',
                  )}
                >
                  {startingUri === '' ? 'Starting…' : 'Play album'}
                </button>
              )}
            </div>
            <ol className="space-y-0.5">
              {tracks.map((t) => {
                const isCurrent = currentInAlbum && currentUri === t.uri
                const isStarting = startingUri === t.uri
                return (
                  <li key={t.uri}>
                    <button
                      type="button"
                      onClick={() => startPlayback(t.uri)}
                      disabled={!interactionsReady}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={cn(
                        'group flex w-full items-baseline gap-4 rounded-sm px-2 py-1.5 text-left text-sm leading-snug transition-colors',
                        interactionsReady ? 'hover:bg-foreground/5 cursor-pointer' : 'cursor-default',
                        isCurrent ? 'bg-foreground/5' : '',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'shrink-0 w-6 font-mono text-[11px] tabular-nums text-right',
                          isCurrent ? aesthetics.primaryAccent : 'text-muted-foreground/40',
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
            {/* Device readiness line — separate from the tracklist. */}
            {deviceState === 'connecting' && (
              <p className="mt-2 text-[11px] text-muted-foreground/50 italic">
                Preparing the LongPlay player…
              </p>
            )}
            {deviceState === 'failed' && (
              <p className="mt-2 text-[11px] text-muted-foreground/60">
                Spotify device did not become ready.{' '}
                <button type="button" onClick={retryDevice} className={cn('underline', aesthetics.primaryAccent)}>
                  Try again.
                </button>
              </p>
            )}
          </div>
        ) : tracksStatus === 'error' ? (
          <div>
            <p className="text-[12px] text-muted-foreground/70 mb-2">
              Couldn&apos;t load this album&apos;s tracks.
            </p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={retryTracks}
                className={cn('text-[12px] italic underline opacity-80 hover:opacity-100', aesthetics.primaryAccent)}
              >
                Try again
              </button>
              <OpenInSpotify href={openInSpotify} aesthetics={aesthetics} />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/50 italic">Loading album…</p>
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

type FetchTracksResult =
  | { ok: true; tracks: PlayerTrack[] }
  | { ok: false; status: number | null; detail: string | null }

/**
 * Fetch the full album tracklist with the listener's USER token.
 * Paginates /v1/albums/{id}/tracks. Returns a tagged result so the
 * caller can distinguish success from failure (and never fabricate).
 */
async function fetchAlbumTracksWithUserToken(
  albumId: string,
  token: string,
  signal?: AbortSignal,
): Promise<FetchTracksResult> {
  const out: PlayerTrack[] = []
  let url: string | null =
    `${SPOTIFY_API}/albums/${encodeURIComponent(albumId)}/tracks?limit=50`
  try {
    while (url) {
      const res: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal,
      })
      if (!res.ok) {
        let detail: string | null = null
        try {
          const body = (await res.json()) as { error?: { message?: string } }
          detail = body?.error?.message ?? null
        } catch {
          /* ignore */
        }
        return { ok: false, status: res.status, detail }
      }
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
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    return { ok: false, status: aborted ? null : 0, detail: aborted ? 'timeout' : 'network' }
  }
  return { ok: true, tracks: out }
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
        disabled ? 'opacity-25 cursor-default' : 'opacity-70 hover:opacity-100 text-foreground',
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
