/**
 * lib/enrichment/providers/provider.ts
 *
 * Provider abstraction for the external genre enrichment layer.
 * Mirrors the shape of lib/streaming/provider.ts (StreamingProvider)
 * — both interfaces describe HOW to talk to an upstream, decoupled
 * from WHEN/WHO to ask.
 *
 * New providers (MusicBrainz, Discogs, etc.) implement this and
 * register in providers/index.ts.
 */

import type { EnrichmentProvider, ProviderEnrichmentResult } from '../types'

export class RateLimitedError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number | null,
  ) {
    super(message)
    this.name = 'RateLimitedError'
  }
}

export interface EnrichmentProviderImpl {
  readonly id: EnrichmentProvider

  /**
   * Fetch tags for one artist. Throws on:
   *   - Missing/invalid configuration (env var unset)
   *   - HTTP error from upstream
   *   - RateLimitedError when upstream sends 429
   *
   * Returns a ProviderEnrichmentResult with raw_tags preserved and
   * canonical_genres derived — never invented.
   */
  fetchArtistTags(params: {
    externalArtistId: string
    artistName: string
  }): Promise<ProviderEnrichmentResult>
}
