/**
 * lib/streaming/types.ts
 *
 * Provider-agnostic types for the listening substrate. Concrete
 * provider modules (spotify.ts, apple-music.ts) translate from their
 * native shapes into these. The data layer and recommendation engine
 * speak only this dialect.
 */

export type SourceId = 'spotify' | 'apple_music'

export type ConnectionStatus = 'active' | 'revoked' | 'error' | 'reauth_required'

/** Public capabilities a source declares it supports. */
export interface SourceCapabilities {
  recent_plays: boolean
  top_artists: boolean
  top_tracks: boolean
  library: boolean
}

export interface ListeningSource {
  id: SourceId
  display_name: string
  capabilities: SourceCapabilities
}

export interface ListeningConnection {
  id: string
  user_id: string
  source_id: SourceId
  external_account_id: string | null
  display_name: string | null
  scopes: string[]
  status: ConnectionStatus
  connected_at: string
  last_sync_at: string | null
  last_error: string | null
}

/** A single normalized play event. */
export interface ListeningEvent {
  source_id: SourceId
  external_track_id: string | null
  track_title: string | null
  artist_name: string | null
  album_name: string | null
  album_external_id: string | null
  isrc: string | null
  played_at: string // ISO
  duration_ms: number | null
  context_type: 'album' | 'playlist' | 'radio' | 'search' | 'library' | 'unknown' | null
  raw: Record<string, unknown>
}

export interface FavoriteArtist {
  source_id: SourceId
  external_artist_id: string
  name: string
  /** Position in the listener's top-artists list. Null when the artist
   *  was discovered through a track/album/event rather than a top-artists
   *  call — they're still relevant for genre signal, just not ranked. */
  rank: number | null
  genres: string[]
  /** Spotify's 0-100 popularity score, when available. */
  popularity?: number | null
  /** Total followers, when available. */
  followers?: number | null
  /** Best (largest) artist image URL, when available. */
  image_url?: string | null
  raw: Record<string, unknown>
}

export interface FavoriteAlbum {
  source_id: SourceId
  external_album_id: string
  title: string
  artist: string | null
  rank: number | null
  raw: Record<string, unknown>
}

export interface FavoriteTrack {
  source_id: SourceId
  external_track_id: string
  title: string
  artist: string | null
  album: string | null
  isrc: string | null
  rank: number | null
  raw: Record<string, unknown>
}

/** What an OAuth callback hands back to the platform. */
export interface ConnectionTokens {
  access_token: string
  refresh_token: string | null
  expires_at: string | null // ISO
  scopes: string[]
  external_account_id: string | null
  display_name: string | null
}

/** What a provider returns from a full sync. */
export interface SyncResult {
  events: ListeningEvent[]
  artists: FavoriteArtist[]
  albums: FavoriteAlbum[]
  tracks: FavoriteTrack[]
  syncedAt: string // ISO
}
