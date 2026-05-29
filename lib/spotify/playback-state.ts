/**
 * lib/spotify/playback-state.ts — Phase 6B.4A
 *
 * Pure helpers for the in-room Spotify Web Playback SDK surface. NO
 * DOM, NO fetch, NO React — just shape-normalization + formatting so
 * the client player component stays thin and these can be unit-tested
 * in isolation (scripts/test-spotify-playback.ts).
 *
 * The Web Playback SDK emits a `player_state_changed` event with a
 * `WebPlaybackState` object. Its shape is large and partially
 * undocumented; we narrow it to the fields the restrained in-room
 * surface actually renders.
 */

/** The subset of the SDK's WebPlaybackState we read. All optional —
 *  the SDK occasionally emits partial states. */
export interface RawWebPlaybackState {
  paused?: boolean
  position?: number
  duration?: number
  disallows?: {
    skipping_next?: boolean
    skipping_prev?: boolean
    pausing?: boolean
    resuming?: boolean
  }
  track_window?: {
    current_track?: {
      name?: string
      uri?: string
      artists?: Array<{ name?: string }>
      album?: { name?: string }
    } | null
  }
}

/** Normalized snapshot the UI binds to. Null `current` means the SDK
 *  has no active track yet (device idle / nothing transferred). */
export interface PlaybackSnapshot {
  isPaused: boolean
  positionMs: number
  durationMs: number
  current: {
    title: string
    artist: string | null
    /** Full Spotify track URI ('spotify:track:…') of the playing
     *  track, when the SDK reports it. Used to highlight the matching
     *  row in the album tracklist. Null when unavailable. */
    uri: string | null
  } | null
  /** Whether next/previous controls should be enabled. Derived from
   *  the SDK's `disallows` map (true in disallows == NOT allowed). */
  canSkipNext: boolean
  canSkipPrev: boolean
}

/**
 * Narrow a raw SDK state (or null) into a PlaybackSnapshot. Returns
 * null when the input is null/undefined (player not ready / idle) so
 * the caller can distinguish "no playback" from "paused playback".
 */
export function summarizeWebPlaybackState(
  raw: RawWebPlaybackState | null | undefined,
): PlaybackSnapshot | null {
  if (!raw) return null
  const track = raw.track_window?.current_track ?? null
  const artist =
    track?.artists && track.artists.length > 0
      ? track.artists
          .map((a) => a?.name)
          .filter((n): n is string => typeof n === 'string' && n.length > 0)
          .join(', ') || null
      : null
  return {
    isPaused: raw.paused ?? true,
    positionMs: clampNonNegative(raw.position),
    durationMs: clampNonNegative(raw.duration),
    current: track?.name
      ? { title: track.name, artist, uri: track.uri ?? null }
      : null,
    // `disallows.skipping_*` true means the action is NOT allowed.
    canSkipNext: !(raw.disallows?.skipping_next ?? false),
    canSkipPrev: !(raw.disallows?.skipping_prev ?? false),
  }
}

/**
 * Fraction in [0, 1] of how far playback has progressed. Returns 0
 * when duration is unknown/zero so a progress bar never divides by
 * zero or overflows.
 */
export function playbackProgressFraction(
  positionMs: number,
  durationMs: number,
): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0
  const f = positionMs / durationMs
  if (!Number.isFinite(f)) return 0
  return Math.min(1, Math.max(0, f))
}

/**
 * Format a millisecond position as "M:SS" (or "H:MM:SS" past an
 * hour). Mirrors lib/album-tracks-format formatTrackDuration's output
 * shape so progress + track durations read consistently. Negative /
 * non-finite input formats as "0:00".
 */
export function formatPlaybackPosition(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Spotify account product → whether full in-room playback is possible.
 *  Only 'premium' can stream via the Web Playback SDK; 'free' / 'open'
 *  trigger the SDK's `account_error`. */
export function isPremiumProduct(
  product: string | null | undefined,
): boolean {
  return product === 'premium'
}

/**
 * Build a full Spotify track URI from a bare track id. The
 * album_tracks substrate stores bare ids (provider_track_id); the
 * Web API play `offset` and the SDK's current_track.uri use the
 * 'spotify:track:<id>' form. Passing an already-prefixed value
 * through is a no-op so callers can be careless about the source.
 */
export function trackUriFromId(idOrUri: string): string {
  if (!idOrUri) return idOrUri
  return idOrUri.startsWith('spotify:track:')
    ? idOrUri
    : `spotify:track:${idOrUri}`
}

/**
 * Room-album scoping rule (Phase 6B.4C). Given the Spotify
 * currently-playing track URI and the set of track URIs that make up
 * THIS room's album, return the current URI only when it belongs to
 * the album — otherwise null. This is what keeps a room player from
 * showing/highlighting another album's playback (e.g. Jason Isbell
 * playing elsewhere must not surface inside the Illinois room).
 */
export function resolveAlbumCurrentUri(
  currentUri: string | null | undefined,
  albumTrackUris: ReadonlySet<string>,
): string | null {
  if (!currentUri) return null
  return albumTrackUris.has(currentUri) ? currentUri : null
}

function clampNonNegative(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return 0
  return n
}
