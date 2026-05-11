/**
 * Album Resolver System
 * 
 * A centralized system for resolving album metadata and artwork.
 * Designed for easy replacement with a backend API in production.
 * 
 * Resolution priority:
 * 1. Spotify API (most reliable artwork)
 * 2. Apple Music API
 * 3. MusicBrainz / Cover Art Archive
 * 4. Local LongPlay fallback
 */

import { ALBUMS, type Album } from './albums'

// ============================================
// TYPES
// ============================================

export interface AlbumResolverResult {
  success: boolean
  album: Album | null
  source: 'cache' | 'spotify' | 'apple-music' | 'musicbrainz' | 'local-fallback'
  error?: string
}

export interface AlbumQuery {
  artist: string
  title: string
  spotifyId?: string
  musicBrainzId?: string
}

export interface AlbumResolverConfig {
  enableCache?: boolean
  cacheTTL?: number // milliseconds
  fallbackToLocal?: boolean
}

// ============================================
// ALBUM RESOLVER CLASS
// ============================================

class AlbumResolver {
  private cache: Map<string, { album: Album; timestamp: number }> = new Map()
  private config: AlbumResolverConfig

  constructor(config: AlbumResolverConfig = {}) {
    this.config = {
      enableCache: true,
      cacheTTL: 24 * 60 * 60 * 1000, // 24 hours
      fallbackToLocal: true,
      ...config,
    }
  }

  /**
   * Generate cache key from artist and title
   */
  private getCacheKey(artist: string, title: string): string {
    return `${artist.toLowerCase().trim()}::${title.toLowerCase().trim()}`
  }

  /**
   * Check if cached entry is still valid
   */
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < (this.config.cacheTTL || 86400000)
  }

  /**
   * Resolve album by artist and title
   * In production, this would make API calls to Spotify, Apple Music, etc.
   * For now, uses local data.
   */
  async resolve(query: AlbumQuery): Promise<AlbumResolverResult> {
    const { artist, title, spotifyId } = query
    const cacheKey = this.getCacheKey(artist, title)

    // Check cache first
    if (this.config.enableCache) {
      const cached = this.cache.get(cacheKey)
      if (cached && this.isCacheValid(cached.timestamp)) {
        return {
          success: true,
          album: cached.album,
          source: 'cache',
        }
      }
    }

    // In production, this would be:
    // 1. Try Spotify API
    // 2. Try Apple Music API
    // 3. Try MusicBrainz
    // 4. Fall back to local

    // For prototype: search local data
    const localAlbum = this.findLocalAlbum(artist, title, spotifyId)
    
    if (localAlbum) {
      // Update cache
      if (this.config.enableCache) {
        this.cache.set(cacheKey, { album: localAlbum, timestamp: Date.now() })
      }

      return {
        success: true,
        album: localAlbum,
        source: 'local-fallback',
      }
    }

    // No album found
    return {
      success: false,
      album: null,
      source: 'local-fallback',
      error: `Album not found: ${artist} - ${title}`,
    }
  }

  /**
   * Resolve album by Spotify ID (more reliable)
   */
  async resolveBySpotifyId(spotifyId: string): Promise<AlbumResolverResult> {
    // In production: direct Spotify API call
    // For prototype: search local data
    const album = Object.values(ALBUMS).find(a => a.spotifyId === spotifyId)

    if (album) {
      return {
        success: true,
        album,
        source: 'local-fallback',
      }
    }

    return {
      success: false,
      album: null,
      source: 'local-fallback',
      error: `Album not found for Spotify ID: ${spotifyId}`,
    }
  }

  /**
   * Resolve multiple albums in batch
   */
  async resolveMany(queries: AlbumQuery[]): Promise<AlbumResolverResult[]> {
    // In production: batch API calls for efficiency
    return Promise.all(queries.map(q => this.resolve(q)))
  }

  /**
   * Search local album data
   */
  private findLocalAlbum(artist: string, title: string, spotifyId?: string): Album | null {
    const normalizeString = (s: string) => 
      s.toLowerCase().trim().replace(/[^\w\s]/g, '')

    // First try spotifyId if provided
    if (spotifyId) {
      const bySpotify = Object.values(ALBUMS).find(a => a.spotifyId === spotifyId)
      if (bySpotify) return bySpotify
    }

    // Then try exact match
    const normalizedArtist = normalizeString(artist)
    const normalizedTitle = normalizeString(title)

    const exactMatch = Object.values(ALBUMS).find(a => 
      normalizeString(a.artist) === normalizedArtist &&
      normalizeString(a.title) === normalizedTitle
    )
    if (exactMatch) return exactMatch

    // Then try fuzzy match
    const fuzzyMatch = Object.values(ALBUMS).find(a => 
      normalizeString(a.artist).includes(normalizedArtist) ||
      normalizedArtist.includes(normalizeString(a.artist))
    )
    if (fuzzyMatch && normalizeString(fuzzyMatch.title) === normalizedTitle) {
      return fuzzyMatch
    }

    return null
  }

  /**
   * Get album by internal ID (fastest, for known albums)
   */
  getById(id: string): Album | null {
    return Object.values(ALBUMS).find(a => a.id === id) || null
  }

  /**
   * Get all albums (for browsing/discovery)
   */
  getAll(): Album[] {
    return Object.values(ALBUMS)
  }

  /**
   * Get albums by room association
   */
  getByRoom(roomId: string): Album[] {
    return Object.values(ALBUMS).filter(a => 
      a.roomAssociations?.includes(roomId)
    )
  }

  /**
   * Get albums by emotional tag
   */
  getByTag(tag: string): Album[] {
    return Object.values(ALBUMS).filter(a => 
      a.emotionalTags?.includes(tag)
    )
  }

  /**
   * Clear cache (useful for forcing refresh)
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Verify artwork URL is still valid
   * In production: HEAD request to check if image exists
   */
  async verifyArtwork(url: string): Promise<boolean> {
    // For prototype, assume all URLs are valid
    // In production: 
    // try {
    //   const response = await fetch(url, { method: 'HEAD' })
    //   return response.ok
    // } catch {
    //   return false
    // }
    return Boolean(url)
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const albumResolver = new AlbumResolver()

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Resolve a single album (convenience wrapper)
 */
export async function resolveAlbum(artist: string, title: string): Promise<Album | null> {
  const result = await albumResolver.resolve({ artist, title })
  return result.album
}

/**
 * Get album by known key (synchronous, for static data)
 */
export function getAlbum(key: keyof typeof ALBUMS): Album {
  return ALBUMS[key]
}

/**
 * Get albums by room association
 */
export function getAlbumsByRoom(roomId: string): Album[] {
  return albumResolver.getByRoom(roomId)
}

/**
 * Get albums by emotional tag
 */
export function getAlbumsByTag(tag: string): Album[] {
  return albumResolver.getByTag(tag)
}

/**
 * Safe album getter with fallback
 */
export function safeGetAlbum(key: string): Album {
  const album = ALBUMS[key as keyof typeof ALBUMS]
  if (album) return album
  
  // Return a fallback album
  return {
    id: 'unknown',
    title: 'Unknown Album',
    artist: 'Unknown Artist',
    year: '',
    cover: '',
    fallbackGradient: 'from-charcoal to-card',
    albumArtSource: 'local-fallback',
    lastVerifiedAt: new Date().toISOString(),
  }
}
