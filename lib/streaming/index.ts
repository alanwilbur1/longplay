/**
 * lib/streaming — provider abstraction barrel.
 *
 * Phase 4.1: registers Spotify (real impl) and Apple Music (scaffold).
 * Add a new provider by implementing StreamingProvider and adding it
 * to PROVIDERS below; nothing else in the codebase should grow a
 * provider-specific branch.
 */

import type { StreamingProvider } from './provider'
import type { SourceId } from './types'
import { spotifyProvider } from './spotify'
import { appleMusicProvider } from './apple-music'

export type { StreamingProvider } from './provider'
export type {
  ConnectionStatus,
  ConnectionTokens,
  FavoriteAlbum,
  FavoriteArtist,
  FavoriteTrack,
  ListeningConnection,
  ListeningEvent,
  ListeningSource,
  SourceCapabilities,
  SourceId,
  SyncResult,
} from './types'

const PROVIDERS: Record<SourceId, StreamingProvider> = {
  spotify: spotifyProvider,
  apple_music: appleMusicProvider,
}

export function getProvider(id: SourceId): StreamingProvider {
  return PROVIDERS[id]
}

export function listProviders(): StreamingProvider[] {
  return Object.values(PROVIDERS)
}

/** Predicate for `(string).toLowerCase()` form. */
export function isSourceId(s: string): s is SourceId {
  return s === 'spotify' || s === 'apple_music'
}
