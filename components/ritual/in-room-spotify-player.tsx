'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { initiateConnection } from '@/lib/actions/streaming'
import { markListeningAction } from '@/lib/actions/ritual'
import {
  summarizeWebPlaybackState,
  playbackProgressFraction,
  formatPlaybackPosition,
  type RawWebPlaybackState,
  type PlaybackSnapshot,
} from '@/lib/spotify/playback-state'

/**
 * components/ritual/in-room-spotify-player.tsx — Phase 6B.4A
 *
 * Authenticated in-room Spotify playback. Replaces the public embed
 * iframe (preview-only / "Get Spotify") as the PRIMARY listening
 * surface inside the ritual hero.
 *
 * Architecture:
 *   1. On mount, GET /api/spotify/playback-token. The response gates
 *      everything: not_connected / reauth / non-premium / eligible.
 *      The refresh token never reaches this component — the route
 *      hands back only a short-lived access token.
 *   2. When eligible (connected + scoped + Premium), we load the
 *      Spotify Web Playback SDK, register a "LongPlay" device, and
 *      drive playback from inside the room. The SDK's getOAuthToken
 *      callback re-hits the same route for fresh tokens.
 *   3. "Play album" starts the album context on the LongPlay device
 *      (PUT /me/player/play?device_id=…), which both transfers and
 *      begins playback. Pause/resume/next/previous use the SDK.
 *   4. The first successful play marks ritual participation as
 *      'listening' (never auto-completes) via markListeningAction.
 *
 * Every non-eligible state renders quiet, honest copy — no fake
 * player, no broken iframe. Non-Premium / unscoped listeners get a
 * reconnect path or an open-in-Spotify link.
 */

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js'
const DEVICE_NAME = 'LongPlay'

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

async function fetchPlaybackToken(): Promise<PlaybackTokenResponse> {
  const res = await fetch('/api/spotify/playback-token', {
    cache: 'no-store',
  })
  return (await res.json()) as PlaybackTokenResponse
}

export interface InRoomSpotifyPlayerProps {
  spotifyAlbumId: string
  /** Active ritual cycle id, when there is one. Drives the
   *  'listening' participation mark on first play. Null → no cycle,
   *  playback still works, just no participation write. */
  ritualCycleId: string | null
  /** Room slug — used as the returnTo for the reconnect flow so the
   *  listener lands back in the room. */
  roomSlug: string
  /** Fires once when playback first starts, so the surrounding
   *  surface can set its ceremonial "began listening" continuity mark. */
  onPlaybackStarted?: () => void
  aesthetics: {
    borderTint: string
    primaryAccent: string
  }
}

export function InRoomSpotifyPlayer({
  spotifyAlbumId,
  ritualCycleId,
  roomSlug,
  onPlaybackStarted,
  aesthetics,
}: InRoomSpotifyPlayerProps) {
  const [gate, setGate] = useState<Gate>('loading')
  const [deviceReady, setDeviceReady] = useState(false)
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | null>(null)

  const playerRef = useRef<SpotifyPlayerInstance | null>(null)
  const deviceIdRef = useRef<string | null>(null)
  const listeningMarkedRef = useRef(false)
  const openInSpotify = `https://open.spotify.com/album/${spotifyAlbumId}`

  // ── 1. Gate on the token route. ──────────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetchPlaybackToken()
      .then((r) => {
        if (cancelled) return
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

  // ── 2. Load the SDK + register the device when eligible. ─────────
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
          // The SDK calls this on init and on every token expiry. We
          // re-mint server-side; the refresh token never comes here.
          fetchPlaybackToken()
            .then((r) => cb(r.status === 'ok' ? r.accessToken : ''))
            .catch(() => cb(''))
        },
      })
      playerRef.current = player

      player.addListener('ready', (payload) => {
        const { device_id } = payload as { device_id: string }
        deviceIdRef.current = device_id
        setDeviceReady(true)
      })
      player.addListener('not_ready', () => {
        setDeviceReady(false)
      })
      player.addListener('initialization_error', (payload) => {
        const { message } = payload as { message: string }
        setGate('error')
        setPlaybackError(message)
      })
      player.addListener('authentication_error', () => {
        // Token rejected mid-session → the connection needs re-auth.
        setGate('reauth')
      })
      player.addListener('account_error', () => {
        // SDK refuses to stream for non-Premium accounts.
        setGate('not_premium')
      })
      player.addListener('playback_error', (payload) => {
        const { message } = payload as { message: string }
        setPlaybackError(message)
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
          // ignore
        }
      }
      playerRef.current = null
      deviceIdRef.current = null
    }
  }, [gate])

  // ── 3. Poll current state for live progress while a track is loaded.
  useEffect(() => {
    if (gate !== 'eligible') return
    const id = window.setInterval(() => {
      const p = playerRef.current
      if (!p) return
      p.getCurrentState()
        .then((state) => setSnapshot(summarizeWebPlaybackState(state)))
        .catch(() => {
          /* transient; keep last snapshot */
        })
    }, 1000)
    return () => window.clearInterval(id)
  }, [gate])

  // ── Controls ─────────────────────────────────────────────────────
  const handlePlayAlbum = useCallback(async () => {
    const deviceId = deviceIdRef.current
    if (!deviceId) return
    setBusy(true)
    setPlaybackError(null)
    try {
      const tok = await fetchPlaybackToken()
      if (tok.status !== 'ok') {
        setGate(
          tok.status === 'reauth_required' || tok.status === 'missing_scopes'
            ? 'reauth'
            : tok.status === 'not_connected' || tok.status === 'not_authenticated'
              ? 'not_connected'
              : 'error',
        )
        return
      }
      // Start the album context on the LongPlay device. With
      // device_id set, this transfers playback here AND begins it.
      const res = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${tok.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ context_uri: `spotify:album:${spotifyAlbumId}` }),
        },
      )
      if (!res.ok && res.status !== 202 && res.status !== 204) {
        if (res.status === 403) {
          setGate('not_premium')
        } else if (res.status === 401) {
          setGate('reauth')
        } else {
          setPlaybackError(
            res.status === 404
              ? 'Playback device not ready yet — try again in a moment.'
              : `Playback could not start (Spotify ${res.status}).`,
          )
        }
        return
      }
      // First successful play → mark ritual presence (never completes).
      if (!listeningMarkedRef.current) {
        listeningMarkedRef.current = true
        onPlaybackStarted?.()
        if (ritualCycleId) {
          // Fire-and-forget; presence tracking must not block playback.
          void markListeningAction(ritualCycleId)
        }
      }
    } catch {
      setPlaybackError('Playback could not start. Check your connection.')
    } finally {
      setBusy(false)
    }
  }, [spotifyAlbumId, ritualCycleId, onPlaybackStarted])

  const handleToggle = useCallback(() => {
    playerRef.current?.togglePlay().catch(() => {
      /* ignore — state poll will reconcile */
    })
  }, [])
  const handleNext = useCallback(() => {
    playerRef.current?.nextTrack().catch(() => {})
  }, [])
  const handlePrev = useCallback(() => {
    playerRef.current?.previousTrack().catch(() => {})
  }, [])

  // ── Render ───────────────────────────────────────────────────────
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

  // gate === 'eligible'
  const hasTrack = snapshot?.current != null
  const isPaused = snapshot?.isPaused ?? true
  const progress = snapshot
    ? playbackProgressFraction(snapshot.positionMs, snapshot.durationMs)
    : 0

  return (
    <Frame aesthetics={aesthetics}>
      {!deviceReady ? (
        <p className="text-[11px] text-muted-foreground/50 italic">
          Connecting the LongPlay player…
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Current track / prompt */}
          <div className="min-h-[2.25rem]">
            {hasTrack ? (
              <>
                <p className="text-sm text-foreground/90 leading-tight">
                  {snapshot!.current!.title}
                </p>
                {snapshot!.current!.artist && (
                  <p className="text-[11px] text-muted-foreground/60">
                    {snapshot!.current!.artist}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground/60 italic">
                Ready to play this album, in full, here.
              </p>
            )}
          </div>

          {/* Progress */}
          {hasTrack && snapshot!.durationMs > 0 && (
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

          {/* Controls */}
          <div className="flex items-center gap-4">
            {!hasTrack ? (
              <button
                type="button"
                onClick={handlePlayAlbum}
                disabled={busy}
                className={cn(
                  'text-[12px] tracking-wide italic transition-opacity',
                  aesthetics.primaryAccent,
                  busy ? 'opacity-40' : 'opacity-80 hover:opacity-100',
                )}
              >
                {busy ? 'Starting…' : 'Play album'}
              </button>
            ) : (
              <>
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
              </>
            )}
          </div>

          {playbackError && (
            <p className="text-[11px] text-muted-foreground/60">{playbackError}</p>
          )}
        </div>
      )}
    </Frame>
  )
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
