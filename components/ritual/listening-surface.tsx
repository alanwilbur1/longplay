'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  InRoomSpotifyPlayer,
  type InitialAlbumTrack,
} from '@/components/ritual/in-room-spotify-player'
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
 * components/ritual/listening-surface.tsx — Phase 6B.4 / 6B.4A
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
 *      → Authenticated in-room playback via <InRoomSpotifyPlayer>
 *        (Phase 6B.4A). This replaced the old public embed iframe,
 *        which only ever offered 30s previews and a "Get Spotify"
 *        wall. The player drives the Spotify Web Playback SDK using
 *        the listener's own connection and handles all its own
 *        gating + honest fallbacks (connect / reconnect-for-scopes /
 *        non-Premium / browser-unsupported). Below it, the ceremonial
 *        continuity caption ("since Jun 5") when the mark is warm.
 *
 *   3. No Spotify ID but Apple Music URL present
 *      → A single ceremonial line: "Listen via Apple Music." with
 *        the URL as an editorial link. No oversized button.
 *
 * Tone target: a quiet record-shelf affordance, not a player clone —
 * restrained controls, no dashboard chrome.
 *
 * Continuity state: lib/listening-continuity.ts tracks ONLY whether
 * the listener began listening in this browser for this room + album
 * combination. The player calls onPlaybackStarted the first time
 * audio begins, which sets the mark. It is a ceremonial threshold —
 * a "I have arrived at this record" signal — not playback telemetry.
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
  /** Active ritual cycle id (active.id) when a cycle is running.
   *  Passed through to the player so the first play can mark ritual
   *  participation as 'listening'. Null when there is no cycle. */
  ritualCycleId: string | null
  /** DB album_tracks (with Spotify track ids) for the artifact album.
   *  Forwarded to the player as its fast-path tracklist. Empty → the
   *  player hydrates from Spotify with the user token. */
  playerTracks?: ReadonlyArray<InitialAlbumTrack>
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
  ritualCycleId,
  playerTracks,
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

  // Path 2: authenticated in-room Spotify playback (Phase 6B.4A).
  // Replaces the old public embed iframe — which only ever offered
  // 30s previews + a "Get Spotify" wall — with the Web Playback SDK
  // driven InRoomSpotifyPlayer. The player handles its own gating
  // (connect / reconnect-for-scopes / Premium / browser support) and
  // renders honest fallbacks; we just frame it and keep the
  // ceremonial continuity caption beneath. The player calls
  // onPlaybackStarted the first time audio begins, which sets the
  // "began listening" mark exactly like the old manual button did.
  return (
    <div className={cn('border-t pt-6 mt-6', aesthetics.borderTint)}>
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-3">
        {mark ? 'Continue listening' : 'Listen'}
      </p>

      <InRoomSpotifyPlayer
        spotifyAlbumId={spotifyAlbumId}
        initialTracks={playerTracks}
        ritualCycleId={ritualCycleId}
        roomSlug={roomSlug}
        onPlaybackStarted={handleBegin}
        aesthetics={aesthetics}
      />

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {mark && (
          <p className="text-[11px] text-muted-foreground/50 italic">
            since {formatDate(mark.startedAt)}.
          </p>
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
