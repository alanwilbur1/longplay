import type { StreamingProvider } from './provider'
import type { ConnectionTokens, SyncResult } from './types'

/**
 * Apple Music provider — scaffold only.
 *
 * Phase 4.1 deliberately stops short of a real Apple Music
 * implementation because MusicKit JS requires a developer-side
 * Apple-generated JWT (signed with a private key managed in a
 * separate ENV var). Wiring that up is a Phase 4.1.1 follow-up;
 * for now we expose the provider shape so the rest of the platform
 * can already speak to "apple_music" connections via the same
 * abstraction.
 *
 * What lands when Apple Music is wired up:
 *   - APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, APPLE_MUSIC_PRIVATE_KEY env
 *   - A short-lived MusicKit developer token mint (server-side JWT)
 *   - A music-user-token capture flow (client MusicKit auth)
 *   - sync() pulls /me/library/albums + /me/library/artists
 *     (recent_plays / top_* are not available via the API; capabilities
 *     reflect this honestly)
 */
export const appleMusicProvider: StreamingProvider = {
  id: 'apple_music',
  displayName: 'Apple Music',
  capabilities: {
    recent_plays: false,
    top_artists: false,
    top_tracks: false,
    library: true,
  },

  buildAuthorizeUrl() {
    throw new Error(
      '[apple_music] OAuth-style authorize URL is not how MusicKit works. ' +
        'Wire MusicKit JS on the client + server-side JWT mint before enabling.',
    )
  },

  async exchangeCode(): Promise<ConnectionTokens> {
    throw new Error('[apple_music] exchangeCode not implemented in Phase 4.1')
  },

  async refreshTokens(): Promise<ConnectionTokens> {
    throw new Error('[apple_music] refreshTokens not implemented in Phase 4.1')
  },

  // Accepts the StreamingProvider sync signature (including Phase 6A.2B's
  // `recentlyPlayedAfter`) but ignores both params — capabilities
  // report library-only and the scaffold returns empties until the
  // MusicKit wiring lands.
  async sync(_params: {
    accessToken: string
    recentlyPlayedAfter?: string | null
  }): Promise<SyncResult> {
    return {
      events: [],
      artists: [],
      albums: [],
      tracks: [],
      syncedAt: new Date().toISOString(),
    }
  },
}
