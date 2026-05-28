'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  getMarkIfFresh,
  setListeningMark,
  type ListeningMark,
} from '@/lib/listening-continuity'
// Phase 6B.4 hotfix: re-export from the pure module rather than
// owning the implementation here. A server component imports
// extractSpotifyAlbumId; importing it across the 'use client'
// boundary on THIS file is a runtime trap in Next.js App Router.
export { extractSpotifyAlbumId } from '@/lib/spotify-url'

/**
 * components/ritual/listening-surface.tsx — Phase 6B.4
 *
 * Embedded ritual listening. Renders inside the ritual hero's left
 * column, immediately beneath the album metadata. Three states:
 *
 *   1. No Spotify ID + no Apple Music URL
 *      → Renders nothing. The streaming pills (rendered elsewhere
 *        in the hero) carry the deep-link UX. Don't add a fake
 *        player surface when no embed is possible.
 *
 *   2. Spotify ID available
 *      → Compact dark Spotify embed (80px), edge-borderless,
 *        composed with the room's tinting. Below the embed, a
 *        single ceremonial line: "Begin when you're ready" (cold)
 *        or "Continue listening · since Jun 5" (warm).
 *
 *   3. No Spotify ID but Apple Music URL present
 *      → A single ceremonial line: "Listen via Apple Music." with
 *        the URL as an editorial link. No oversized button.
 *
 * Tone target: a quiet record-shelf affordance, not a player. The
 * embed itself is the player — we just frame it.
 *
 * Continuity state: lib/listening-continuity.ts tracks ONLY whether
 * the listener pressed "Begin listening" in this browser for this
 * room + album combination. It is NOT playback state. The Spotify
 * iframe is cross-origin and we cannot read what's playing inside.
 * The mark is a ceremonial threshold — a "I have arrived at this
 * record" signal — not a metric.
 */

export interface ListeningSurfaceProps {
  /** Room slug. Used as the localStorage key for continuity. */
  roomSlug: string
  /** Spotify album ID extracted from room.streamingLinks.spotify
   *  (the room schema stores the URL; the server panel parses out
   *  the ID before passing it down). Null when no Spotify URL or
   *  no parseable ID. */
  spotifyAlbumId: string | null
  /** Apple Music album URL when present. Fallback when Spotify is
   *  unavailable for this room. */
  appleMusicUrl: string | null
  /** Stable cross-cycle key for the artifact (so continuity resets
   *  when the room moves to a new album). The page passes the
   *  ritual cycle's artifact_album_id (or the room's currentAlbum
   *  id when no cycle). */
  albumKey: string
  /** Room aesthetic tokens — composed with rather than overridden. */
  aesthetics: {
    borderTint: string
    primaryAccent: string
  }
}

export function ListeningSurface({
  roomSlug,
  spotifyAlbumId,
  appleMusicUrl,
  albumKey,
  aesthetics,
}: ListeningSurfaceProps) {
  // Read continuity mark on mount. SSR-safe — the helper bails on
  // missing `window`. The cold/warm state therefore always renders
  // as cold on the server, warm on the client when applicable; the
  // copy swap on hydration is intentional and undisruptive (small
  // caption only).
  const [mark, setMark] = useState<ListeningMark | null>(null)
  useEffect(() => {
    setMark(getMarkIfFresh(roomSlug, albumKey))
  }, [roomSlug, albumKey])

  // TEMPORARY DIAGNOSTIC (6B.5 follow-up #2): logs to the BROWSER
  // console on every mount + prop change so we can confirm from
  // production whether the panel's prop chain delivered a non-null
  // spotifyAlbumId and what render path the surface chose. Remove
  // once the trace confirms the chain.
  useEffect(() => {
    const path = spotifyAlbumId
      ? 'spotify-embed'
      : appleMusicUrl
        ? 'apple-fallback'
        : 'null-noop'
    // eslint-disable-next-line no-console
    console.log('[listening-surface-debug]', {
      roomSlug,
      spotifyAlbumId,
      appleMusicUrl,
      render_path: path,
    })
  }, [roomSlug, spotifyAlbumId, appleMusicUrl])

  const handleBegin = () => {
    const next = setListeningMark(roomSlug, albumKey)
    setMark(next)
  }

  // Path 3: no Spotify, Apple Music fallback as a single line.
  if (!spotifyAlbumId && appleMusicUrl) {
    return (
      <div className={cn('border-t pt-6 mt-6', aesthetics.borderTint)}>
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-3">
          Listen
        </p>
        <a
          href={appleMusicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'font-serif text-base italic transition-colors',
            aesthetics.primaryAccent,
            'opacity-80 hover:opacity-100',
          )}
        >
          Open on Apple Music
        </a>
      </div>
    )
  }

  // Path 1: nothing to render.
  if (!spotifyAlbumId) return null

  // Path 2: Spotify embed.
  // Phase 6B.5 follow-up: height bumped to 352 (Spotify's default
  // "standard" embed). At 352px the iframe exposes the FULL
  // tracklist + per-track play affordances inside Spotify's own
  // chrome — making the embed the actual listening surface, not
  // just a player chip. The brief calls this out: "make it large
  // enough and prominent enough to function as the track/player
  // surface."
  const embedSrc = `https://open.spotify.com/embed/album/${spotifyAlbumId}?utm_source=longplay`

  // TEMPORARY DIAGNOSTIC (Phase 6B continuation). Logs the exact
  // iframe src to the browser console so a "Page not found" embed can
  // be traced back to the resolved album ID. Mirrors the server-side
  // [ritual-spotify-debug] line. Remove once the embed is confirmed
  // playable in production.
  if (typeof window !== 'undefined') {
    console.log('[listening-surface-embed]', { roomSlug, spotifyAlbumId, embedSrc })
  }

  return (
    <div className={cn('border-t pt-6 mt-6', aesthetics.borderTint)}>
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-3">
        {mark ? 'Continue listening' : 'Listen'}
      </p>

      <div
        className={cn(
          // Subtle ambient frame — no card, no shadow. A faint
          // border keeps the iframe from sitting raw on the page.
          'overflow-hidden rounded-sm border',
          aesthetics.borderTint,
        )}
      >
        <iframe
          // The Spotify iframe runs cross-origin. We rely entirely
          // on Spotify's own player chrome inside — no shim, no
          // overlay. `loading="lazy"` keeps the surface cheap when
          // the listener hasn't scrolled to it yet.
          title="Album player"
          src={embedSrc}
          width="100%"
          height={352}
          frameBorder={0}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          // Sandbox is intentionally permissive — Spotify embeds
          // need scripts + same-origin for their own auth flow.
          // Restricting further breaks the player.
          className="bg-card/10"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {mark ? (
          <p className="text-[11px] text-muted-foreground/50 italic">
            since {formatDate(mark.startedAt)}.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleBegin}
            className={cn(
              'text-[11px] tracking-wide italic transition-colors',
              aesthetics.primaryAccent,
              'opacity-70 hover:opacity-100',
            )}
            aria-label="Mark the listening ritual as begun"
          >
            Begin when you’re ready.
          </button>
        )}
        {appleMusicUrl && (
          <a
            href={appleMusicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          >
            Apple Music
          </a>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}
// extractSpotifyAlbumId is re-exported from @/lib/spotify-url at the
// top of this file; its implementation now lives in a pure module so
// server components can import it without crossing the 'use client'
// boundary. See the hotfix note there.
