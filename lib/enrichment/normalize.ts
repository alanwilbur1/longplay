/**
 * lib/enrichment/normalize.ts
 *
 * Map external provider tags → canonical LongPlay genres.
 *
 * Hard rule: the output is always a strict subset of the input after
 * lowercasing, alias mapping, and non-genre filtering. We do NOT add
 * a canonical genre that wasn't present in the provider's tags. This
 * is enforced by structure: the only way a tag reaches `canonical`
 * is through the input loop.
 *
 * Confidence: derived from the top accepted tag's `count` field
 * (Last.fm scales to 0-100). When no count is present, confidence is
 * a flat 0.5 — present but not weighted.
 */

import type { RawTag } from './types'

/**
 * Tags Last.fm users add that are not genres. Drop on sight.
 * Conservative list — when in doubt, keep (it can still be filtered
 * downstream by the affinity tagger).
 */
const NON_GENRE_TAGS = new Set<string>([
  'seen live',
  'favorite',
  'favorites',
  'favourite',
  'favourites',
  'loved',
  'love',
  'awesome',
  'amazing',
  'cool',
  'best',
  'good',
  'great',
  'perfect',
  'female vocalist',
  'female vocalists',
  'male vocalist',
  'male vocalists',
  'female vocals',
  'male vocals',
  'albums i own',
  'want to see live',
  'check out',
  'beautiful',
  'sexy',
  'fun',
  'all',
  'music',
  'artist',
  'band',
  'singer',
  'songwriter', // overlap with 'singer-songwriter'; canonical is hyphenated below
])

/**
 * Common Last.fm tag variants → LongPlay canonical form. Keep the
 * canonical side aligned with Spotify's lowercase + space format
 * ("indie folk", "hip hop") so the downstream affinity matcher and
 * recommender don't need a separate vocabulary.
 */
const TAG_ALIASES: Record<string, string> = {
  // Punctuation / spacing variants
  'r and b': 'r&b',
  rnb: 'r&b',
  'r n b': 'r&b',
  hiphop: 'hip hop',
  'hip-hop': 'hip hop',
  postrock: 'post-rock',
  'post rock': 'post-rock',
  lofi: 'lo-fi',
  'lo fi': 'lo-fi',
  neosoul: 'neo-soul',
  'neo soul': 'neo-soul',
  altrock: 'alternative rock',
  'alt rock': 'alternative rock',
  'alt-rock': 'alternative rock',
  altcountry: 'alt-country',
  'alt country': 'alt-country',
  // Multi-word singer-songwriter forms
  'singer songwriter': 'singer-songwriter',
  // Country tag clean-ups
  'country music': 'country',
  // Common umbrella → keep as canonical
  electronica: 'electronic',
  edm: 'electronic',
  techno: 'techno',
  // House family (canonicalize spellings)
  'deep house': 'deep house',
}

/**
 * Decade tags: "00s", "10s", "60s", "70s", "1990s", "2000s", etc.
 * Useful as era signal one day, but not genres. Drop.
 */
const DECADE_RE = /^(?:\d{2,4})s?$/

/**
 * Year tags: "1972", "2014". Drop.
 */
const YEAR_RE = /^(?:19|20)\d{2}$/

export interface NormalizeResult {
  canonical: string[]
  confidence: number
}

/**
 * Normalize a provider's tag list into the LongPlay canonical genre
 * vocabulary.
 *
 *   1. Lowercase + trim + collapse whitespace.
 *   2. Drop non-genre tags and decade/year tags.
 *   3. Apply alias map.
 *   4. Drop too-short tags (< 2 chars) — these are almost always noise.
 *   5. Dedupe, preserving first-encounter order (so the highest-count
 *      tag wins position).
 *   6. Cap output at 15 — beyond that is noise / curiosity tags.
 *
 * Returns the canonical array AND a confidence (0..1) derived from
 * the top accepted tag's count.
 */
export function normalizeGenreTags(rawTags: RawTag[]): NormalizeResult {
  const seen = new Set<string>()
  const canonical: string[] = []
  let topConfidence = 0
  let topConfidenceSet = false

  for (const tag of rawTags) {
    if (!tag || typeof tag.name !== 'string') continue
    const lowered = tag.name.toLowerCase().trim().replace(/\s+/g, ' ')
    if (!lowered || lowered.length < 2) continue
    if (NON_GENRE_TAGS.has(lowered)) continue
    if (DECADE_RE.test(lowered)) continue
    if (YEAR_RE.test(lowered)) continue

    const mapped = TAG_ALIASES[lowered] ?? lowered
    if (NON_GENRE_TAGS.has(mapped)) continue
    if (seen.has(mapped)) continue
    seen.add(mapped)
    canonical.push(mapped)

    if (!topConfidenceSet) {
      if (typeof tag.count === 'number' && tag.count > 0) {
        topConfidence = Math.min(tag.count / 100, 1)
      } else {
        topConfidence = 0.5
      }
      topConfidenceSet = true
    }

    if (canonical.length >= 15) break
  }

  return { canonical, confidence: topConfidence }
}
