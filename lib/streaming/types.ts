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

/**
 * Provider-specific telemetry safe to expose to the UI: counts and a
 * short error string only. Never contains tokens, scopes, or raw
 * provider response bodies.
 */
export interface SyncMeta {
  artist_ids_collected?: number
  artist_ids_hydrated?: number
  artists_with_genres?: number
  hydration_batches_attempted?: number
  hydration_batches_succeeded?: number
  /** Null when every hydration batch succeeded; otherwise a short
   *  diagnostic like "401: The access token expired".
   *
   *  Phase 6A.12: this is NO LONGER set for catalog restrictions
   *  (Spotify 403 on /v1/artists endpoints). Those are now modeled
   *  as `spotify_catalog_restricted=true` + a `hydration_status` of
   *  'restricted', and the field is left null so the UI doesn't
   *  show a red error for what is actually a known degraded state.
   *  Real errors (token expiry, network blips, parse failures) still
   *  set this. */
  hydration_error?: string | null
  /** Phase 6A.2B: the max(played_at) the provider's incremental
   *  recently-played fetch advanced to during this sync. The orchestrator
   *  persists this back to listening_connections.recently_played_cursor
   *  so the next run only fetches plays after this point. Null when no
   *  new events landed (cursor doesn't move backward). */
  recently_played_cursor?: string | null
  /** Phase 6A.12 catalog restriction telemetry. See
   *  lib/streaming/hydration-policy.ts for the classification rules. */
  hydration_status?: 'ok' | 'restricted' | 'rate_limited' | 'disabled' | 'partial'
  /** True when Spotify's /v1/artists endpoints (both batch and single-id)
   *  returned 403. Genuine "we are not allowed to read this catalog"
   *  state — sync continues via Last.fm enrichment. */
  spotify_catalog_restricted?: boolean
  /** True when the hydration call was not even issued because
   *  SPOTIFY_CATALOG_HYDRATION_MODE=disabled. Different from
   *  spotify_catalog_restricted=true — that's "we tried and were
   *  blocked", this is "we never tried". */
  spotify_artist_hydration_skipped?: boolean
  /** The resolved hydration mode for this sync. Lets the audit log
   *  show whether the operator had it set to enabled/auto/disabled
   *  at the time of the run. */
  spotify_hydration_mode?: 'enabled' | 'auto' | 'disabled'
}

/** What a provider returns from a full sync. */
export interface SyncResult {
  events: ListeningEvent[]
  artists: FavoriteArtist[]
  albums: FavoriteAlbum[]
  tracks: FavoriteTrack[]
  syncedAt: string // ISO
  meta?: SyncMeta
}
