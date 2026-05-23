import type { EnrichmentProvider } from '../types'
import { lastfmProvider } from './lastfm'
import type { EnrichmentProviderImpl } from './provider'

const REGISTRY: Record<EnrichmentProvider, EnrichmentProviderImpl> = {
  lastfm: lastfmProvider,
}

export function getEnrichmentProvider(id: EnrichmentProvider): EnrichmentProviderImpl {
  return REGISTRY[id]
}

/** Provider priority order — first available with a configured API
 *  key wins. */
export const PROVIDER_PRIORITY: EnrichmentProvider[] = ['lastfm']

/** Returns the first provider whose required env var is set. Null
 *  when nothing is configured — callers should skip enrichment in
 *  that case rather than crash. */
export function pickDefaultProvider(): EnrichmentProviderImpl | null {
  for (const id of PROVIDER_PRIORITY) {
    if (id === 'lastfm' && process.env.LASTFM_API_KEY) {
      return REGISTRY[id]
    }
  }
  return null
}

export { RateLimitedError } from './provider'
export type { EnrichmentProviderImpl } from './provider'
