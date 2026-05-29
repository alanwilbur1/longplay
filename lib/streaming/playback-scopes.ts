/**
 * lib/streaming/playback-scopes.ts — Phase 6B.4A
 *
 * Pure scope-gap analysis for authenticated Spotify playback. NO DB,
 * NO fetch — deterministic and unit-testable in isolation.
 *
 * Background: the original connect flow (lib/streaming/spotify.ts)
 * requested only read scopes for identity/sync:
 *   user-read-email, user-top-read, user-read-recently-played,
 *   user-library-read
 *
 * In-room playback via the Spotify Web Playback SDK additionally
 * requires the scopes below. Accounts connected before 6B.4A will
 * NOT have them, so the player surface must detect the gap and route
 * the listener to a reconnect (re-authorize) path rather than failing
 * silently.
 */

/**
 * Scopes the Web Playback SDK + Web API player control endpoints need.
 *
 *   streaming                    — required to instantiate the SDK player
 *                                  and stream audio in the browser.
 *   user-read-playback-state     — read current device / playback state.
 *   user-modify-playback-state   — transfer playback, start album context,
 *                                  play/pause/skip via the Web API.
 *   user-read-currently-playing  — read the currently-playing track.
 *   user-read-private            — read the account's `product` field so
 *                                  we can detect Premium (full playback)
 *                                  vs free (SDK refuses with account_error).
 */
export const PLAYBACK_SCOPES = [
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-private',
] as const

export type PlaybackScope = (typeof PLAYBACK_SCOPES)[number]

/**
 * Returns the playback scopes that are NOT present in the granted set.
 * Empty array means the connection is fully scoped for in-room
 * playback. Order follows PLAYBACK_SCOPES for stable display.
 */
export function missingPlaybackScopes(
  granted: readonly string[] | null | undefined,
): PlaybackScope[] {
  const have = new Set(granted ?? [])
  return PLAYBACK_SCOPES.filter((s) => !have.has(s))
}

/** True when every playback scope is present in the granted set. */
export function hasAllPlaybackScopes(
  granted: readonly string[] | null | undefined,
): boolean {
  return missingPlaybackScopes(granted).length === 0
}
