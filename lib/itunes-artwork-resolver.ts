/**
 * iTunes Album Artwork Resolver
 * 
 * Uses the public iTunes Search API (no API key required) to resolve
 * album artwork at runtime. Results are cached in localStorage.
 */

interface ITunesSearchResult {
  wrapperType: string
  collectionType: string
  artistName: string
  collectionName: string
  artworkUrl100: string
  collectionId: number
}

interface ITunesSearchResponse {
  resultCount: number
  results: ITunesSearchResult[]
}

interface CachedArtwork {
  url: string
  resolvedAt: number
  artist: string
  album: string
}

const CACHE_KEY = 'longplay_artwork_cache'
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Get the artwork cache from localStorage
 */
function getCache(): Record<string, CachedArtwork> {
  if (typeof window === 'undefined') return {}
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    return cached ? JSON.parse(cached) : {}
  } catch {
    return {}
  }
}

/**
 * Save to artwork cache
 */
function setCache(cache: Record<string, CachedArtwork>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage might be full or unavailable
  }
}

/**
 * Generate a cache key from artist and album
 */
function getCacheKey(artist: string, album: string): string {
  return `${artist.toLowerCase().trim()}::${album.toLowerCase().trim()}`
}

/**
 * Normalize strings for comparison (remove special chars, lowercase)
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses multiple techniques for robust matching
 */
function similarity(a: string, b: string): number {
  const aNorm = normalize(a)
  const bNorm = normalize(b)
  
  // Exact match
  if (aNorm === bNorm) return 1
  
  // Check if one fully contains the other (high confidence)
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
    // Penalize if length difference is too large (e.g. "Blue" in "Abbey Road (Remastered Edition Deluxe Blue)")
    const lengthRatio = Math.min(aNorm.length, bNorm.length) / Math.max(aNorm.length, bNorm.length)
    return 0.7 + (lengthRatio * 0.25)
  }
  
  // Word-based overlap score
  const aWords = aNorm.split(' ').filter(w => w.length > 1) // Filter out single chars
  const bWords = bNorm.split(' ').filter(w => w.length > 1)
  
  if (aWords.length === 0 || bWords.length === 0) return 0
  
  const aWordSet = new Set(aWords)
  const bWordSet = new Set(bWords)
  const intersection = [...aWordSet].filter(w => bWordSet.has(w))
  
  // Calculate Jaccard similarity
  const union = new Set([...aWordSet, ...bWordSet])
  const jaccardScore = intersection.length / union.size
  
  // Bonus for matching important words (first word of each)
  const firstWordMatch = aWords[0] === bWords[0] ? 0.15 : 0
  
  return Math.min(jaccardScore + firstWordMatch, 1)
}

/**
 * Upgrade iTunes artwork URL to higher resolution
 * Changes 100x100bb.jpg to 600x600bb.jpg
 */
function upgradeArtworkUrl(url: string): string {
  return url.replace(/100x100bb/, '600x600bb')
}

/**
 * Resolve album artwork from iTunes Search API
 * 
 * @param artist - Artist name
 * @param album - Album title
 * @returns Promise resolving to artwork URL or null
 */
export async function resolveAlbumArtwork(
  artist: string,
  album: string
): Promise<string | null> {
  const cacheKey = getCacheKey(artist, album)
  const cache = getCache()
  
  // Check cache first
  const cached = cache[cacheKey]
  if (cached && Date.now() - cached.resolvedAt < CACHE_DURATION) {
    return cached.url
  }
  
  try {
    const searchTerm = `${artist} ${album}`
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=album&limit=5`
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`iTunes API error: ${response.status}`)
    }
    
    const data: ITunesSearchResponse = await response.json()
    
    if (data.resultCount === 0) {
      return null
    }
    
    // Find best match by comparing artist and album names
    // Prioritize exact matches heavily
    let bestMatch: ITunesSearchResult | null = null
    let bestScore = 0
    
    for (const result of data.results) {
      if (result.wrapperType !== 'collection') continue
      
      const artistScore = similarity(artist, result.artistName)
      const albumScore = similarity(album, result.collectionName)
      
      // Require minimum artist match to even consider
      if (artistScore < 0.5) continue
      
      // Weight album title more heavily (it's what distinguishes albums by same artist)
      const combinedScore = (artistScore * 0.35) + (albumScore * 0.65)
      
      // Bonus for exact artist match
      const exactArtistBonus = normalize(artist) === normalize(result.artistName) ? 0.1 : 0
      const finalScore = Math.min(combinedScore + exactArtistBonus, 1)
      
      if (finalScore > bestScore) {
        bestScore = finalScore
        bestMatch = result
      }
    }
    
    // Require high minimum match quality to avoid wrong albums
    if (!bestMatch || bestScore < 0.6) {
      return null
    }
    
    const artworkUrl = upgradeArtworkUrl(bestMatch.artworkUrl100)
    
    // Cache the result
    cache[cacheKey] = {
      url: artworkUrl,
      resolvedAt: Date.now(),
      artist: bestMatch.artistName,
      album: bestMatch.collectionName,
    }
    setCache(cache)
    
    return artworkUrl
  } catch (error) {
    console.error('[v0] iTunes artwork resolution failed:', error)
    return null
  }
}

/**
 * Check if artwork is cached for an album
 */
export function isArtworkCached(artist: string, album: string): boolean {
  const cacheKey = getCacheKey(artist, album)
  const cache = getCache()
  const cached = cache[cacheKey]
  return cached && Date.now() - cached.resolvedAt < CACHE_DURATION
}

/**
 * Clear the artwork cache
 */
export function clearArtworkCache(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(CACHE_KEY)
}

/**
 * Get cache stats
 */
export function getArtworkCacheStats(): { count: number; oldestEntry: number | null } {
  const cache = getCache()
  const entries = Object.values(cache)
  return {
    count: entries.length,
    oldestEntry: entries.length > 0 
      ? Math.min(...entries.map(e => e.resolvedAt))
      : null,
  }
}
