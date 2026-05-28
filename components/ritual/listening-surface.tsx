'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  getMarkIfFresh,
  setListeningMark,
  type ListeningMark,
} from '@/lib/listening-continuity'

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
  // Compact size (height 152) — gives one row of player chrome plus
  // the cover thumbnail. Larger sizes feel like a player widget; the
  // compact size feels like a record sleeve placed on a shelf.
  const embedSrc = `https://open.spotify.com/embed/album/${spotifyAlbumId}?utm_source=longplay`
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
          height={152}
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

/**
 * Extract the Spotify album ID from a streaming URL.
 *
 *   https://open.spotify.com/album/5vkqYmiPBYLaalcmjujWxK?si=...
 *     → '5vkqYmiPBYLaalcmjujWxK'
 *
 * Returns null for non-album URLs, missing input, or unparseable
 * shapes. Caller (the server panel) uses this to derive the
 * `spotifyAlbumId` prop. Spotify IDs are 22-character base62; we
 * accept the broader [A-Za-z0-9]+ regex because the URL won't ever
 * contain other characters in the album-id slot anyway.
 */
export function extractSpotifyAlbumId(
  url: string | null | undefined,
): string | null {
  if (!url) return null
  const m = url.match(/spotify\.com\/(?:embed\/)?album\/([A-Za-z0-9]+)/i)
  if (!m) return null
  return m[1]
}
