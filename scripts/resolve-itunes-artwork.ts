/**
 * scripts/resolve-itunes-artwork.ts
 *
 * Replace empty / placeholder / fabricated album cover URLs in
 * lib/albums.ts with verified artwork URLs sourced from the public
 * iTunes Search API (no auth required).
 *
 * Selection set (default):
 *   - cover === ""
 *   - cover starts with https://placehold.co/
 *
 * Selection set (--validate-existing): the above PLUS any cover
 * whose HEAD request fails (non-200 or non-image content-type).
 * A live, valid cover is never overwritten — verified existing URLs
 * are skipped before we even consult iTunes.
 *
 * Conservative matching (unchanged):
 *   - both artist AND title must score above thresholds
 *     (artist >= 0.85 ratio, title >= 0.75 ratio)
 *   - obvious compilations rejected unless we're searching for one
 *   - top 2 within AMBIGUITY_MARGIN → AMBIGUOUS, logged, skipped
 *
 * Artwork URLs are upgraded from 100x100 to 1000x1000 and HEAD-
 * validated (image/* content-type required) before being written.
 *
 * Flags:
 *   --write              commit changes to lib/albums.ts
 *   --only=<albumId>     process a single album
 *   --validate-existing  HEAD-check live URLs too; queue dead ones
 *
 * Default mode is DRY-RUN. Pass --write to mutate lib/albums.ts.
 *
 *   tsx scripts/resolve-itunes-artwork.ts
 *   tsx scripts/resolve-itunes-artwork.ts --validate-existing
 *   tsx scripts/resolve-itunes-artwork.ts --write
 *   tsx scripts/resolve-itunes-artwork.ts --only=i-comma-i
 *
 * After --write:
 *   tsx scripts/refresh-room-metadata.ts --dry
 *   tsx scripts/refresh-room-metadata.ts
 *
 * No env vars required. No auth. iTunes Search is rate-limited per
 * IP (~20 req/min recommended); the script paces requests at one
 * every PER_REQUEST_DELAY_MS to stay well under.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { ALBUMS, type Album } from '../lib/albums'

interface ITunesResult {
  collectionType?: string
  collectionName?: string
  artistName?: string
  artworkUrl100?: string
  releaseDate?: string
  primaryGenreName?: string
  collectionId?: number
}

interface ITunesSearchResponse {
  resultCount: number
  results: ITunesResult[]
}

const ITUNES_BASE = 'https://itunes.apple.com/search'
const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup'
const PER_REQUEST_DELAY_MS = 3000
// MusicBrainz strict rate limit: 1 req/sec per IP. We use 1100ms
// (extra 100ms buffer) and apply it as a shared throttle for both
// MB and CAA calls since CAA shares MB infra.
const MB_DELAY_MS = 1100
const MB_USER_AGENT = 'LongPlay/1.0 (https://longplay.app)'
const MB_BASE = 'https://musicbrainz.org/ws/2'
const CAA_BASE = 'https://coverartarchive.org'
const HEAD_TIMEOUT_MS = 5000
const ARTIST_THRESHOLD = 0.85
const TITLE_THRESHOLD = 0.75
const AMBIGUITY_MARGIN = 0.1

// ── Which albums need a new cover? ───────────────────────────────────
function needsResolving(album: Album): boolean {
  if (!album.cover || album.cover.length === 0) return true
  if (album.cover.startsWith('https://placehold.co/')) return true
  return false
}

// ── Similarity helpers ───────────────────────────────────────────────
//
// Aggressive normalization is the difference between "Carrie & Lowell"
// matching "Carrie and Lowell" or not, between "Björk" matching "Bjork"
// or not, and between "Kind of Blue (Legacy Edition)" matching "Kind
// of Blue" or not. We do all of this BEFORE scoring — so the score
// thresholds (ARTIST_THRESHOLD / TITLE_THRESHOLD) operate on cleaned
// strings, not raw user data.
//
// Edition-suffix list is conservative — only the patterns we've seen
// inflate scores away from the canonical edition (Remastered, Deluxe,
// Legacy, Monophonic, Expanded, Live, Special Anniversary, Bonus
// Track Version, Reissue). Free-form "(2020)" years and parenthesized
// non-edition phrases also get stripped.
const EDITION_SUFFIX_RE = new RegExp(
  '\\s*[\\(\\[]\\s*(?:' +
    [
      'remastered(?:\\s+\\d{4})?',
      'remaster(?:ed)?(?:\\s+\\d{4})?',
      'deluxe(?:\\s+edition)?',
      'legacy(?:\\s+edition)?',
      'monophonic(?:\\s+edition)?',
      'mono(?:phonic)?\\s*(?:edition|version)?',
      'expanded(?:\\s+edition)?',
      'extended(?:\\s+edition)?',
      'special(?:\\s+edition)?',
      'anniversary(?:\\s+edition)?',
      '\\d+(?:st|nd|rd|th)\\s+anniversary(?:\\s+edition)?',
      'collector\'?s(?:\\s+edition)?',
      'bonus\\s+track\\s+version',
      'with\\s+bonus[^)\\]]*',
      'reissue[^)\\]]*',
      're[\\-\\s]?release',
      'live(?:\\s+at[^)\\]]*|\\s+in[^)\\]]*|\\s+from[^)\\]]*)?',
      'session(?:s)?',
      'demos?',
      'original\\s+(?:soundtrack|recording|version|cast)',
      'soundtrack',
      'edition',
      'version',
    ].join('|') +
    ')\\s*[\\)\\]]\\s*',
  'gi',
)

function normalize(s: string): string {
  return s
    // Unicode NFD decomposition + strip the resulting combining
    // marks (U+0300..U+036F, "Combining Diacritical Marks" block).
    // Turns "Björk" → "Bjork", "Beyoncé" → "Beyonce", "Sigur Rós"
    // → "Sigur Ros".
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Strip edition suffixes first (so subsequent paren-strip doesn't
    // eat them ambiguously).
    .replace(EDITION_SUFFIX_RE, ' ')
    // Drop any remaining parenthesized/bracketed phrases — usually
    // (2020), (Single Version), etc.
    .replace(/[(\[][^)\]]*[)\]]/g, ' ')
    // Normalize ampersand to "and" — common artist/title variance.
    .replace(/\s*&\s*/g, ' and ')
    // Drop apostrophes (curly + straight) before stripping punctuation
    // so "Don't" stays as "dont" (single token), not "don t".
    .replace(/[''’`´‘]/g, '')
    // Drop remaining punctuation / non-alnum.
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = []
  for (let i = 0; i <= m; i++) {
    dp[i] = []
    dp[i][0] = i
  }
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function ratio(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  const maxLen = Math.max(na.length, nb.length)
  if (maxLen === 0) return 0
  return 1 - levenshtein(na, nb) / maxLen
}

/** Returns true iff `a` and `b` are equal after normalize(). Used as
 *  the canonical-title preference signal — exact-normalized matches
 *  short-circuit ambiguity. */
function normalizedExact(a: string, b: string): boolean {
  return normalize(a) === normalize(b)
}

/** Short titles (≤ 3 chars after normalize, e.g. "xo") break
 *  Levenshtein-ratio scoring: a 1-char difference drops the ratio
 *  by 33-50%. For these we require exact normalized title equality.
 *  Slightly longer titles still use ratio() as normal. */
const SHORT_TITLE_MAX = 3
function titleScore(albumTitle: string, candidateTitle: string): number {
  const na = normalize(albumTitle)
  if (na.length <= SHORT_TITLE_MAX) {
    return normalize(candidateTitle) === na ? 1 : 0
  }
  return ratio(albumTitle, candidateTitle)
}

// ── Compilation filter ───────────────────────────────────────────────
const COMPILATION_KEYWORDS = [
  'greatest hits',
  'best of',
  'compilation',
  'anthology',
  'essentials',
  'collected',
  'collection',
  'remixes',
  'live at',
  'live in',
  'live from',
  'concert',
  'sessions',
  'demos',
]
function looksLikeCompilation(name: string): boolean {
  const lower = name.toLowerCase()
  return COMPILATION_KEYWORDS.some((k) => lower.includes(k))
}

// ── iTunes API ───────────────────────────────────────────────────────

/** Build the exact iTunes Search URL we'd send. Exposed so the debug
 *  printer can show it without re-deriving the construction.
 *  When `entity` is null, the entity filter is omitted entirely —
 *  expanded-search fallback for cases where iTunes mis-categorizes
 *  the album under Music/Compilation/etc instead of Album. */
function itunesSearchUrl(term: string, entity: string | null = 'album'): string {
  const url = new URL(ITUNES_BASE)
  url.searchParams.set('term', term)
  if (entity !== null) url.searchParams.set('entity', entity)
  url.searchParams.set('country', 'US')
  url.searchParams.set('limit', '5')
  return url.toString()
}

interface SearchResponse {
  url: string
  resultCount: number
  results: ITunesResult[]
  rawBody: string
}

async function searchITunes(
  term: string,
  entity: string | null = 'album',
): Promise<SearchResponse> {
  const url = itunesSearchUrl(term, entity)
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LongPlay/1.0 (+https://longplay.app)',
    },
  })
  if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`)
  // Read as text first so the debug printer can show the raw body
  // when resultCount is zero (helps the operator see iTunes' actual
  // response shape — sometimes the API returns an empty results array
  // with a non-zero resultCount, or a stray HTML error page, etc).
  const rawBody = await res.text()
  let body: ITunesSearchResponse
  try {
    body = JSON.parse(rawBody) as ITunesSearchResponse
  } catch (err) {
    throw new Error(`iTunes JSON parse failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  return {
    url,
    resultCount: body.resultCount ?? 0,
    results: body.results ?? [],
    rawBody,
  }
}

/** iTunes Lookup API: fetch by exact collectionId. Returns same
 *  shape as search. Used by override path when the operator knows
 *  the specific Apple Music collection they want. */
async function lookupITunes(collectionId: number): Promise<SearchResponse> {
  const url = `${ITUNES_LOOKUP}?id=${encodeURIComponent(String(collectionId))}&entity=album`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LongPlay/1.0 (+https://longplay.app)',
    },
  })
  if (!res.ok) throw new Error(`iTunes lookup HTTP ${res.status}`)
  const rawBody = await res.text()
  let body: ITunesSearchResponse
  try {
    body = JSON.parse(rawBody) as ITunesSearchResponse
  } catch (err) {
    throw new Error(`iTunes lookup JSON parse failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  return {
    url,
    resultCount: body.resultCount ?? 0,
    results: body.results ?? [],
    rawBody,
  }
}

// ── Expanded multi-query search ──────────────────────────────────────
//
// iTunes Search recall is unreliable on a single query. The same album
// can be missing from "Phoebe Bridgers Punisher" but present in
// "Punisher Phoebe Bridgers" — search ranking is fuzzy and ordering
// matters. Strategy: try a series of progressively-broader queries,
// dedupe candidates across all responses by collectionId, and let the
// matcher pick the best from the unified pool.
//
// Early termination: as soon as ANY query produces a canonical exact
// match (normalize(artist) AND normalize(title) both equal), we stop
// firing further queries for this album. Most albums resolve on Q1;
// only the stubborn ones run the full set.
//
// Entity fallback: if all entity=album queries fail to produce a
// canonical match, we retry the most informative queries WITHOUT the
// entity filter — catches iTunes results categorized as Music/
// Compilation/etc that should be Album.
//
// Provenance: each candidate remembers which query produced it. With
// --debug-expanded-search, the operator sees `[from: artist+title]`
// next to each candidate in the pre-filter dump.

interface QueryAttempt {
  label: string
  term: string
  entity: string | null
  resp: SearchResponse
  /** True if a canonical exact match landed in this query's results
   *  (and therefore expanded search terminated here). */
  canonicalHit: boolean
}

interface ExpandedSearchResult {
  queries: QueryAttempt[]
  /** All results across all queries, deduped by collectionId. */
  pooled: ITunesResult[]
  /** Per-collectionId provenance: which query labels produced this
   *  result. A single album frequently appears in 2-3 queries; the
   *  list documents which. */
  provenance: Map<number, string[]>
}

/** Build the ordered list of fallback queries for an album. */
function buildQueryPlan(
  album: { artist: string; title: string },
  primaryOverride: string | null,
): Array<{ label: string; term: string; entity: string | null }> {
  // Tier-1 (entity=album): primary + broadening variants.
  const tier1Term = primaryOverride ?? `${album.artist} ${album.title}`
  const tier1Label = primaryOverride ? 'override' : 'artist+title'
  const plan: Array<{ label: string; term: string; entity: string | null }> = [
    { label: tier1Label, term: tier1Term, entity: 'album' },
  ]
  // The other 4 generated variants are added only if the override
  // didn't already cover that shape — but for simplicity we always
  // add them; dedup happens at the collectionId level downstream.
  const generated: Array<{ label: string; term: string }> = [
    { label: 'title+artist', term: `${album.title} ${album.artist}` },
    { label: 'title-only', term: album.title },
    { label: 'artist-only', term: album.artist },
    { label: 'artist+album+title', term: `${album.artist} album ${album.title}` },
  ]
  for (const g of generated) {
    if (g.term !== tier1Term) plan.push({ ...g, entity: 'album' })
  }
  // Tier-2 (no entity filter): retry the two most informative
  // variants. The matcher's collectionType filter still applies for
  // non-canonical results — only exact-normalized double-matches
  // bypass it.
  plan.push(
    { label: 'artist+title (no-entity)', term: `${album.artist} ${album.title}`, entity: null },
    { label: 'title-only (no-entity)', term: album.title, entity: null },
  )
  return plan
}

async function expandedSearch(
  album: { artist: string; title: string },
  options: { primaryOverride?: string | null; delayMs?: number } = {},
): Promise<ExpandedSearchResult> {
  const plan = buildQueryPlan(album, options.primaryOverride ?? null)
  const delayMs = options.delayMs ?? PER_REQUEST_DELAY_MS
  const queries: QueryAttempt[] = []
  const pooled = new Map<number, ITunesResult>()
  const provenance = new Map<number, string[]>()

  for (let i = 0; i < plan.length; i++) {
    const def = plan[i]
    let resp: SearchResponse
    try {
      resp = await searchITunes(def.term, def.entity)
    } catch (err) {
      // Log the failure as part of the attempt log; downstream debug
      // surface will show it. Other queries may still succeed.
      resp = {
        url: itunesSearchUrl(def.term, def.entity),
        resultCount: 0,
        results: [],
        rawBody: `(error: ${err instanceof Error ? err.message : String(err)})`,
      }
    }

    let canonicalHit = false
    for (const r of resp.results) {
      const id = r.collectionId
      if (id === undefined) continue
      if (!pooled.has(id)) pooled.set(id, r)
      const list = provenance.get(id) ?? []
      if (!list.includes(def.label)) list.push(def.label)
      provenance.set(id, list)
      // Track canonical-hit for early termination.
      if (
        r.collectionName &&
        r.artistName &&
        r.artworkUrl100 &&
        normalizedExact(album.artist, r.artistName) &&
        normalizedExact(album.title, r.collectionName)
      ) {
        canonicalHit = true
      }
    }

    queries.push({ label: def.label, term: def.term, entity: def.entity, resp, canonicalHit })

    // Early termination on canonical match.
    if (canonicalHit) break

    // Polite rate limit between queries (only when we know we'll do
    // more — last iteration skips the sleep).
    if (i < plan.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }

  return {
    queries,
    pooled: Array.from(pooled.values()),
    provenance,
  }
}

// ── MusicBrainz + Cover Art Archive ──────────────────────────────────
//
// Fallback provider for albums iTunes search can't find or can't
// match. MusicBrainz has wider coverage of catalog/independent
// releases; Cover Art Archive (CAA) is the community-curated image
// store hanging off MB release IDs.
//
// Flow per album:
//   1. Query MB release-group endpoint with artist + title
//   2. Filter to primary-type='Album' (drops EP/Single/Compilation)
//   3. Pick the canonical match (lowest first-release-date wins)
//   4. Hit CAA at /release-group/{mbid} for the front image
//   5. Prefer thumbnails.1200 → thumbnails.large → image
//   6. HEAD-validate the image URL as image/* before returning
//
// Rate limit: MB enforces strict 1 req/sec per IP. mbThrottle() is
// a shared timer between every MB and CAA call across the whole run
// — sequential only, no concurrency.

interface MBReleaseGroup {
  id: string
  title?: string
  'primary-type'?: string
  'secondary-types'?: string[]
  'artist-credit'?: Array<{ name?: string; artist?: { name?: string } }>
  'first-release-date'?: string
  score?: number
}

interface MBSearchResponse {
  count?: number
  'release-groups'?: MBReleaseGroup[]
}

interface CAAImage {
  front?: boolean
  back?: boolean
  image?: string
  thumbnails?: {
    small?: string
    large?: string
    '250'?: string
    '500'?: string
    '1200'?: string
  }
  types?: string[]
  approved?: boolean
}

interface CAAResponse {
  images?: CAAImage[]
}

// Shared throttle for every MB/CAA call. Sequential only.
let lastMBCallAt = 0
async function mbThrottle(): Promise<void> {
  const elapsed = Date.now() - lastMBCallAt
  if (elapsed < MB_DELAY_MS) {
    await new Promise((r) => setTimeout(r, MB_DELAY_MS - elapsed))
  }
  lastMBCallAt = Date.now()
}

interface MBSearchResult {
  url: string
  results: MBReleaseGroup[]
  rawBody: string
}

function mbSearchUrl(album: { artist: string; title: string }): string {
  const a = album.artist.replace(/"/g, '')
  const t = album.title.replace(/"/g, '')
  const query = `artist:"${a}" AND releasegroup:"${t}"`
  const url = new URL(`${MB_BASE}/release-group/`)
  url.searchParams.set('query', query)
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('limit', '10')
  return url.toString()
}

async function searchMusicBrainz(album: {
  artist: string
  title: string
}): Promise<MBSearchResult> {
  const url = mbSearchUrl(album)

  await mbThrottle()
  const res = await fetch(url, {
    headers: {
      'User-Agent': MB_USER_AGENT,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`MusicBrainz HTTP ${res.status}`)
  const rawBody = await res.text()
  let body: MBSearchResponse
  try {
    body = JSON.parse(rawBody) as MBSearchResponse
  } catch (err) {
    throw new Error(`MusicBrainz JSON parse failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  return {
    url,
    results: body['release-groups'] ?? [],
    rawBody,
  }
}

interface CAAFetchResult {
  url: string
  imageUrl: string | null
  rawBody: string | null
  /** Non-null only when we found a front-image record. Used by
   *  debug output. */
  pickedFrom?: 'thumbnails.1200' | 'thumbnails.large' | 'thumbnails.500' | 'image'
}

async function fetchCoverArtArchive(mbid: string): Promise<CAAFetchResult> {
  const url = `${CAA_BASE}/release-group/${mbid}`
  await mbThrottle()
  const res = await fetch(url, {
    headers: {
      'User-Agent': MB_USER_AGENT,
      Accept: 'application/json',
    },
    redirect: 'follow',
  })
  if (res.status === 404) {
    // No cover art for this release group — common, not an error.
    return { url, imageUrl: null, rawBody: null }
  }
  if (!res.ok) throw new Error(`Cover Art Archive HTTP ${res.status}`)
  const rawBody = await res.text()
  let body: CAAResponse
  try {
    body = JSON.parse(rawBody) as CAAResponse
  } catch (err) {
    throw new Error(`CAA JSON parse failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  const images = body.images ?? []
  const front = images.find((img) => img.front === true) ?? null
  if (!front) {
    return { url, imageUrl: null, rawBody }
  }
  // Prefer the largest thumbnail. CAA's "thumbnails.1200" is the
  // standard high-res form; fall back through large → 500 → original.
  let pickedFrom: CAAFetchResult['pickedFrom']
  let imageUrl: string | null = null
  if (front.thumbnails?.['1200']) {
    imageUrl = front.thumbnails['1200']
    pickedFrom = 'thumbnails.1200'
  } else if (front.thumbnails?.large) {
    imageUrl = front.thumbnails.large
    pickedFrom = 'thumbnails.large'
  } else if (front.thumbnails?.['500']) {
    imageUrl = front.thumbnails['500']
    pickedFrom = 'thumbnails.500'
  } else if (front.image) {
    imageUrl = front.image
    pickedFrom = 'image'
  }
  // Return CAA's URL as given (typically http://). Don't normalize
  // here — validation needs to try the original scheme because some
  // CAA assets only HEAD-resolve over http. The persistence
  // boundary (writeAlbumCovers) normalizes to https before any URL
  // lands in lib/albums.ts.
  return {
    url,
    imageUrl: imageUrl ?? null,
    rawBody,
    pickedFrom,
  }
}

// MB candidate classification — mirrors selectMatch's structure for
// iTunes but operates on MB release-groups.
interface MBCandidateDebug {
  raw: MBReleaseGroup
  exactArtist: boolean
  exactTitle: boolean
  artistScore: number
  titleScore: number
  status: 'accepted-canonical' | 'accepted' | 'rejected'
  rejectionReason?: string
}

function mbArtistName(rg: MBReleaseGroup): string {
  // Concatenate all artist-credit names so collaborations match.
  const credits = rg['artist-credit'] ?? []
  return credits.map((c) => c.name ?? c.artist?.name ?? '').filter(Boolean).join(' ')
}

function selectMBMatch(
  album: { artist: string; title: string },
  results: MBReleaseGroup[],
): {
  match: MBReleaseGroup | null
  ambiguous: boolean
  reason?: string
  debug: MBCandidateDebug[]
} {
  const wantsCompilation = looksLikeCompilation(album.title)
  const candidates: MBReleaseGroup[] = []
  const debug: MBCandidateDebug[] = []

  for (const rg of results) {
    if (!rg.title) {
      debug.push({
        raw: rg,
        exactArtist: false,
        exactTitle: false,
        artistScore: 0,
        titleScore: 0,
        status: 'rejected',
        rejectionReason: 'missing title',
      })
      continue
    }
    const rgArtist = mbArtistName(rg)
    if (!rgArtist) {
      debug.push({
        raw: rg,
        exactArtist: false,
        exactTitle: false,
        artistScore: 0,
        titleScore: 0,
        status: 'rejected',
        rejectionReason: 'missing artist-credit',
      })
      continue
    }

    const exactArtist = normalizedExact(album.artist, rgArtist)
    const exactTitle = normalizedExact(album.title, rg.title)
    const artistScore = ratio(album.artist, rgArtist)
    const titleScoreVal = titleScore(album.title, rg.title)

    // Canonical exact match bypasses all other filters (same rule
    // as the iTunes matcher — we trust normalized double-match
    // more than MB's own taxonomy).
    if (exactArtist && exactTitle) {
      candidates.push(rg)
      debug.push({
        raw: rg,
        exactArtist: true,
        exactTitle: true,
        artistScore: 1,
        titleScore: 1,
        status: 'accepted-canonical',
      })
      continue
    }

    // Non-canonical: enforce primary-type=Album.
    if (rg['primary-type'] !== 'Album') {
      debug.push({
        raw: rg,
        exactArtist,
        exactTitle,
        artistScore,
        titleScore: titleScoreVal,
        status: 'rejected',
        rejectionReason: `primary-type="${rg['primary-type'] ?? 'unknown'}" (not Album)`,
      })
      continue
    }
    // Reject obvious compilations / live releases via secondary-types.
    const secondary = rg['secondary-types'] ?? []
    const isLiveOrComp = secondary.some((s) =>
      ['compilation', 'live', 'remix', 'soundtrack'].includes(s.toLowerCase()),
    )
    if (!wantsCompilation && isLiveOrComp) {
      debug.push({
        raw: rg,
        exactArtist,
        exactTitle,
        artistScore,
        titleScore: titleScoreVal,
        status: 'rejected',
        rejectionReason: `secondary-types=[${secondary.join(',')}]`,
      })
      continue
    }
    if (!exactArtist && artistScore < ARTIST_THRESHOLD) {
      debug.push({
        raw: rg,
        exactArtist,
        exactTitle,
        artistScore,
        titleScore: titleScoreVal,
        status: 'rejected',
        rejectionReason: `artistScore=${artistScore.toFixed(3)} < ${ARTIST_THRESHOLD}`,
      })
      continue
    }
    if (!exactTitle && titleScoreVal < TITLE_THRESHOLD) {
      debug.push({
        raw: rg,
        exactArtist,
        exactTitle,
        artistScore,
        titleScore: titleScoreVal,
        status: 'rejected',
        rejectionReason: `titleScore=${titleScoreVal.toFixed(3)} < ${TITLE_THRESHOLD}`,
      })
      continue
    }
    candidates.push(rg)
    debug.push({
      raw: rg,
      exactArtist,
      exactTitle,
      artistScore,
      titleScore: titleScoreVal,
      status: 'accepted',
    })
  }

  if (candidates.length === 0) {
    return {
      match: null,
      ambiguous: false,
      reason: 'no MB candidate above thresholds',
      debug,
    }
  }

  // Tier 1: canonical exact matches → pick earliest first-release-date.
  const canonical = candidates.filter(
    (c) => normalizedExact(album.artist, mbArtistName(c)) && normalizedExact(album.title, c.title!),
  )
  if (canonical.length > 0) {
    canonical.sort((a, b) =>
      (a['first-release-date'] ?? '9999').localeCompare(b['first-release-date'] ?? '9999'),
    )
    return { match: canonical[0], ambiguous: false, debug }
  }

  // Tier 2: sort by MB's own score (descending) then by date.
  candidates.sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0)
    if (scoreDiff !== 0) return scoreDiff
    return (a['first-release-date'] ?? '9999').localeCompare(b['first-release-date'] ?? '9999')
  })
  return { match: candidates[0], ambiguous: false, debug }
}

interface MBResolveResult {
  imageUrl: string | null
  mbid: string | null
  search: MBSearchResult
  selection: {
    match: MBReleaseGroup | null
    ambiguous: boolean
    reason?: string
    debug: MBCandidateDebug[]
  }
  caa?: CAAFetchResult
  /** Why this attempt produced no imageUrl (when it didn't). */
  failureReason?: string
}

/** End-to-end MusicBrainz → Cover Art Archive resolution. Does NOT
 *  validate the resulting URL — caller HEAD-validates as for any
 *  other provider. */
async function tryMusicBrainz(album: {
  artist: string
  title: string
}): Promise<MBResolveResult> {
  let search: MBSearchResult
  try {
    search = await searchMusicBrainz(album)
  } catch (err) {
    return {
      imageUrl: null,
      mbid: null,
      search: {
        url: mbSearchUrl(album),
        results: [],
        rawBody: `(error: ${err instanceof Error ? err.message : String(err)})`,
      },
      selection: { match: null, ambiguous: false, debug: [] },
      failureReason: err instanceof Error ? err.message : String(err),
    }
  }
  const selection = selectMBMatch(album, search.results)
  if (!selection.match) {
    return {
      imageUrl: null,
      mbid: null,
      search,
      selection,
      failureReason: selection.reason ?? 'no MB match',
    }
  }
  const mbid = selection.match.id
  let caa: CAAFetchResult
  try {
    caa = await fetchCoverArtArchive(mbid)
  } catch (err) {
    return {
      imageUrl: null,
      mbid,
      search,
      selection,
      failureReason: `CAA fetch: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (!caa.imageUrl) {
    return {
      imageUrl: null,
      mbid,
      search,
      selection,
      caa,
      failureReason: 'no front image in CAA for this release group',
    }
  }
  return { imageUrl: caa.imageUrl, mbid, search, selection, caa }
}

// ── Manual override map ──────────────────────────────────────────────
//
// Activated by --use-overrides. For each album where the default
// search+match path is too conservative (or returns ambiguous), the
// operator can provide one of three escape hatches:
//
//   artworkUrl     bypass iTunes entirely; HEAD-validate this URL
//                  and write it directly on success.
//   collectionId   call iTunes Lookup API by ID instead of Search.
//                  Result is matched + validated like any other.
//   searchTerm     replace the default "{artist} {title}" query
//                  with this string. Result is matched + validated
//                  like any other.
//
// Precedence within a single override: artworkUrl > collectionId >
// searchTerm. Any failure (URL doesn't validate, lookup returns no
// match, search returns ambiguous) falls back to UNRESOLVED — the
// override never silently writes a wrong value.
//
// Live valid covers are still skipped before overrides apply (per
// --validate-existing rules). Overrides only run for items that
// landed in the work list.
//
// Phase 1 population: searchTerm refinements for the 20 albums the
// operator flagged as unresolved/ambiguous. searchTerm-only because
// I can't verify specific collectionIds or URLs from the sandbox.
// Operator should iterate: any that still come back unresolved can
// be re-typed to `collectionId` (look up via Apple Music album URL —
// the trailing digits) or `artworkUrl` (paste a verified CDN link).
interface ManualOverride {
  artworkUrl?: string
  collectionId?: number
  searchTerm?: string
  reason?: string
}

// Operator note (filling in collectionId on a stubborn album):
//   1. Open https://music.apple.com in a browser.
//   2. Search the album, click into it.
//   3. The URL ends with the collectionId, e.g.
//        music.apple.com/us/album/for-emma-forever-ago/1440838664
//      Copy that trailing number (1440838664).
//   4. Replace this entry's `searchTerm: …` with:
//        collectionId: 1440838664,
//      (You can keep `searchTerm` and `reason` too — collectionId
//      takes precedence, per the override-type docs above.)
//
// After the v2 matcher improvements (NFD normalization, edition
// suffix stripping, canonical-title preference, short-title exact
// matching, ambiguity auto-resolution) most of the entries below
// resolve through `searchTerm` alone. Albums in the "Tier-2 stubborn"
// group below are the ones the operator flagged as still needing
// manual help — they keep `searchTerm` overrides as the first attempt
// but are pre-positioned for collectionId escalation if needed.
const MANUAL_OVERRIDES: Record<string, ManualOverride> = {
  // ── Bon Iver ──────────────────────────────────────────────────
  // Tier-2 stubborn (operator may need to swap to collectionId):
  'for-emma': {
    // collectionId: 1440838664,  // ← already known from lib/albums.ts appleMusicUrl
    searchTerm: 'Bon Iver For Emma Forever Ago',
    reason: 'comma in title — search without punctuation',
  },
  '22-a-million': {
    // collectionId: ___,  // ← swap if matcher still fails
    searchTerm: 'Bon Iver 22 A Million',
    reason: 'comma + numeric prefix',
  },
  // ── Phoebe Bridgers ───────────────────────────────────────────
  punisher: {
    searchTerm: 'Phoebe Bridgers Punisher',
    reason: 'common title — multiple editions',
  },
  'stranger-in-the-alps': {
    searchTerm: 'Phoebe Bridgers Stranger in the Alps',
    reason: 'common title words',
  },
  // ── Sufjan Stevens ────────────────────────────────────────────
  'carrie-and-lowell': {
    searchTerm: 'Sufjan Stevens Carrie Lowell',
    reason: 'ampersand in title — drop the &',
  },
  illinois: {
    searchTerm: 'Sufjan Stevens Illinois',
    reason: 'iTunes uses the "Illinoise" alt-spelling on some editions',
  },
  // ── Elliott Smith ─────────────────────────────────────────────
  xo: {
    searchTerm: 'Elliott Smith XO 1998',
    reason: '2-char title — short-title exact-match required',
  },
  // ── Jazz catalog (deeply reissued) ────────────────────────────
  'kind-of-blue': {
    searchTerm: 'Miles Davis Kind of Blue',
    reason: 'many reissue editions — canonical-title preference picks original',
  },
  'a-love-supreme': {
    searchTerm: 'John Coltrane A Love Supreme',
    reason: 'many reissue editions',
  },
  'waltz-for-debby': {
    searchTerm: 'Bill Evans Waltz for Debby',
    reason: 'artist name variants (Bill Evans / Bill Evans Trio)',
  },
  // ── Björk ─────────────────────────────────────────────────────
  // Tier-2 stubborn:
  homogenic: {
    // collectionId: ___,  // ← swap if matcher still fails
    searchTerm: 'Bjork Homogenic',
    reason: 'NFD normalization should match Björk now; ASCII as backup',
  },
  // ── Minimalism ────────────────────────────────────────────────
  // Tier-2 stubborn:
  'music-for-18-musicians': {
    // collectionId: ___,  // ← swap if matcher still fails
    searchTerm: 'Steve Reich Music for 18 Musicians',
    reason: 'multiple recordings by different ensembles',
  },
  // ── Mount Eerie ───────────────────────────────────────────────
  // Tier-2 stubborn:
  'a-crow-looked-at-me': {
    // collectionId: ___,  // ← swap if matcher still fails
    searchTerm: 'Mount Eerie A Crow Looked at Me',
    reason: '',
  },
  // ── Slint ─────────────────────────────────────────────────────
  spiderland: {
    searchTerm: 'Slint Spiderland',
    reason: '',
  },
  // ── William Basinski (multi-volume work) ──────────────────────
  'disintegration-loops': {
    searchTerm: 'William Basinski The Disintegration Loops',
    reason: '4-volume work — top match should be the boxed edition',
  },
  // ── Slowdive ──────────────────────────────────────────────────
  souvlaki: {
    searchTerm: 'Slowdive Souvlaki',
    reason: '',
  },
  // ── Low (disambiguation risk: Bastille released same-titled) ──
  'things-we-lost-in-the-fire': {
    searchTerm: 'Low Things We Lost in the Fire',
    reason: 'Bastille released same-titled album — artist exact-match pins to Low',
  },
  // ── The National ──────────────────────────────────────────────
  // Tier-2 stubborn:
  'sleep-well-beast': {
    // collectionId: ___,  // ← swap if matcher still fails
    searchTerm: 'The National Sleep Well Beast',
    reason: '',
  },
  // ── Currently placeholders (placehold.co) ─────────────────────
  // Tier-2 stubborn (placeholders → need real URLs):
  southeastern: {
    // collectionId: ___,  // ← swap if matcher still fails
    searchTerm: 'Jason Isbell Southeastern',
    reason: 'currently placehold.co placeholder',
  },
  'a-seat-at-the-table': {
    // collectionId: ___,  // ← swap if matcher still fails
    searchTerm: 'Solange A Seat at the Table',
    reason: 'currently placehold.co placeholder',
  },
}

// ── Match selection ──────────────────────────────────────────────────
//
// Rejection order (per result):
//
//   1. Missing required fields (collectionName / artistName /
//      artworkUrl100). Always rejected — nothing we can do with these.
//
//   2. CANONICAL EXACT MATCH SHORTCUT. If normalize(artist) AND
//      normalize(title) both equal the album's, accept the result
//      unconditionally — bypassing the collectionType + compilation
//      filters that would otherwise reject e.g. iTunes results
//      labeled "Compilation" when they're actually the canonical
//      edition under a different category. Canonical exact match
//      is the strongest signal we have; we trust it over iTunes'
//      own taxonomy.
//
//   3. Non-canonical filtering:
//      - collectionType must be 'Album' (drops Singles/EPs)
//      - if album isn't a compilation, drop "Greatest Hits"-style
//        candidates
//      - artistScore >= ARTIST_THRESHOLD (or exactArtist)
//      - titleScore >= TITLE_THRESHOLD (or exactTitle)
//
// After filtering, three-tier resolution picks the winner:
//   Tier 1 — canonical exact matches → lowest collectionId wins
//            (typically the original Apple Music release, not a
//             later remaster).
//   Tier 2 — score-ranked combined artistScore + titleScore.
//   Tier 3 — ambiguity: top 2 within AMBIGUITY_MARGIN AND
//            different collectionIds → auto-resolve when delta is
//            within AMBIGUITY_AUTO_RESOLVE_DELTA AND top has
//            exact normalized artist+title.
//
// Debug mode (--debug-candidates) prints the full per-candidate
// classification including REJECTED entries with reasons — exposes
// exactly why something didn't make it into the candidate list.
interface Match {
  artworkUrl: string
  collectionName: string
  artistName: string
  collectionId?: number
  artistScore: number
  titleScore: number
  exactArtist: boolean
  exactTitle: boolean
}

interface CandidateDebug {
  raw: ITunesResult
  exactArtist: boolean
  exactTitle: boolean
  artistScore: number
  titleScore: number
  status: 'accepted-canonical' | 'accepted' | 'rejected'
  rejectionReason?: string
}

const AMBIGUITY_AUTO_RESOLVE_DELTA = 0.05

function selectMatch(
  album: { title: string; artist: string },
  results: ITunesResult[],
): {
  match: Match | null
  ambiguous: boolean
  reason?: string
  debug: CandidateDebug[]
} {
  const wantsCompilation = looksLikeCompilation(album.title)
  const candidates: Match[] = []
  const debug: CandidateDebug[] = []

  for (const r of results) {
    // ── 1. Required field check ─────────────────────────────────
    if (!r.collectionName || !r.artistName || !r.artworkUrl100) {
      debug.push({
        raw: r,
        exactArtist: false,
        exactTitle: false,
        artistScore: 0,
        titleScore: 0,
        status: 'rejected',
        rejectionReason: 'missing required field (collectionName / artistName / artworkUrl100)',
      })
      continue
    }

    const exactArtist = normalizedExact(album.artist, r.artistName)
    const exactTitle = normalizedExact(album.title, r.collectionName)
    const artistScore = ratio(album.artist, r.artistName)
    const titleScoreVal = titleScore(album.title, r.collectionName)

    // ── 2. CANONICAL EXACT MATCH SHORTCUT ───────────────────────
    // Bypass collectionType + compilation filters entirely. If
    // both normalize the same way as the album, this IS the
    // album — Apple's categorization is irrelevant.
    if (exactArtist && exactTitle) {
      const m: Match = {
        artworkUrl: r.artworkUrl100,
        collectionName: r.collectionName,
        artistName: r.artistName,
        collectionId: r.collectionId,
        artistScore: 1,
        titleScore: 1,
        exactArtist: true,
        exactTitle: true,
      }
      candidates.push(m)
      debug.push({
        raw: r,
        exactArtist: true,
        exactTitle: true,
        artistScore: 1,
        titleScore: 1,
        status: 'accepted-canonical',
      })
      continue
    }

    // ── 3. Non-canonical filters ────────────────────────────────
    if (r.collectionType !== 'Album') {
      debug.push({
        raw: r,
        exactArtist,
        exactTitle,
        artistScore,
        titleScore: titleScoreVal,
        status: 'rejected',
        rejectionReason: `collectionType="${r.collectionType ?? 'undefined'}" (not Album)`,
      })
      continue
    }
    if (!wantsCompilation && looksLikeCompilation(r.collectionName)) {
      debug.push({
        raw: r,
        exactArtist,
        exactTitle,
        artistScore,
        titleScore: titleScoreVal,
        status: 'rejected',
        rejectionReason: 'compilation (album title doesn\'t look like one)',
      })
      continue
    }
    if (!exactArtist && artistScore < ARTIST_THRESHOLD) {
      debug.push({
        raw: r,
        exactArtist,
        exactTitle,
        artistScore,
        titleScore: titleScoreVal,
        status: 'rejected',
        rejectionReason: `artistScore=${artistScore.toFixed(3)} < ${ARTIST_THRESHOLD}`,
      })
      continue
    }
    if (!exactTitle && titleScoreVal < TITLE_THRESHOLD) {
      debug.push({
        raw: r,
        exactArtist,
        exactTitle,
        artistScore,
        titleScore: titleScoreVal,
        status: 'rejected',
        rejectionReason: `titleScore=${titleScoreVal.toFixed(3)} < ${TITLE_THRESHOLD}`,
      })
      continue
    }

    candidates.push({
      artworkUrl: r.artworkUrl100,
      collectionName: r.collectionName,
      artistName: r.artistName,
      collectionId: r.collectionId,
      artistScore: exactArtist ? 1 : artistScore,
      titleScore: exactTitle ? 1 : titleScoreVal,
      exactArtist,
      exactTitle,
    })
    debug.push({
      raw: r,
      exactArtist,
      exactTitle,
      artistScore,
      titleScore: titleScoreVal,
      status: 'accepted',
    })
  }

  if (candidates.length === 0) {
    return {
      match: null,
      ambiguous: false,
      reason: 'no candidate above thresholds',
      debug,
    }
  }

  // ── Tier 1: canonical exact match wins outright ─────────────────
  // Multiple canonical exact matches → lowest collectionId wins
  // (typically the original release, not a later remaster). This
  // also handles the "only edition suffix differs" case — both
  // will normalize identically, both will be canonical, and the
  // original wins.
  const canonical = candidates.filter((c) => c.exactArtist && c.exactTitle)
  if (canonical.length > 0) {
    canonical.sort((a, b) => (a.collectionId ?? Infinity) - (b.collectionId ?? Infinity))
    return { match: canonical[0], ambiguous: false, debug }
  }

  // ── Tier 2: rank by combined score ──────────────────────────────
  candidates.sort(
    (a, b) => b.artistScore + b.titleScore - (a.artistScore + a.titleScore),
  )

  // ── Tier 3: ambiguity check with auto-resolution ────────────────
  if (candidates.length >= 2) {
    const top = candidates[0]
    const second = candidates[1]
    const margin = top.artistScore + top.titleScore - (second.artistScore + second.titleScore)
    if (margin < AMBIGUITY_MARGIN && top.collectionId !== second.collectionId) {
      if (
        margin < AMBIGUITY_AUTO_RESOLVE_DELTA &&
        top.exactArtist &&
        top.exactTitle
      ) {
        return { match: top, ambiguous: false, debug }
      }
      return {
        match: null,
        ambiguous: true,
        reason: `top 2 within ${margin.toFixed(2)} score margin`,
        debug,
      }
    }
  }

  return { match: candidates[0], ambiguous: false, debug }
}

// ── HTTPS normalization ──────────────────────────────────────────────
// Mixed-content policy + Next image optimization + browser security
// rules can silently block http:// artwork. Every URL the pipeline
// hands off — to the validator, to the writer, to the audit — gets
// upgraded to https:// first. Applied at boundaries below (iTunes
// upgrade, CAA selection, override paths, writeback) so no http://
// URL can survive the pipeline.
//
// CAA in particular historically returned http:// URLs in its
// `images[].thumbnails.*` payload even though https serves the same
// asset.
function normalizeArtworkUrl(url: string): string {
  return url.replace(/^http:\/\//i, 'https://')
}

// ── Upgrade artworkUrl100 → 1000x1000 ────────────────────────────────
function upgradeArtwork(url: string): string {
  // iTunes pattern: ".../<size>x<size>bb.<ext>"
  // Most albums serve 1000x1000bb.jpg cleanly; if not, the HEAD check
  // below will reject and we'll fall back to the original 100x100.
  // Result is HTTPS-normalized — iTunes occasionally returns http://
  // URLs in legacy responses.
  return normalizeArtworkUrl(url.replace(/\/\d+x\d+bb\./, '/1000x1000bb.'))
}

// ── Validation ───────────────────────────────────────────────────────
// Two layers:
//
//   tryFetch()       single HEAD or ranged-GET attempt against one URL.
//                    Accepts 200/206 + image/* content-type.
//
//   validateArtwork() higher-level: HEAD first, ranged-GET fallback
//                    (some CDNs don't support HEAD reliably).
//                    For coverartarchive.org / archive.org URLs,
//                    additionally tries the alternate scheme when
//                    the original fails — CAA's JSON serves http://
//                    URLs and HEAD against the https equivalent
//                    sometimes 404s even though the asset works.
//                    For all other providers, validates as-given.
//
//   PERSISTENCE invariant: the caller stores the URL it passed in,
//   AFTER normalization at the writeback boundary (writeAlbumCovers).
//   So even when we validated http://coverartarchive.org/foo, the
//   value written to lib/albums.ts is https://coverartarchive.org/foo.
//   audit-artwork's insecure-remote gate stays at zero.

function isCAAUrl(url: string): boolean {
  return /^https?:\/\/(?:[a-z0-9-]+\.)?(?:coverartarchive|archive)\.org\//i.test(url)
}

function alternateScheme(url: string): string {
  if (/^http:\/\//i.test(url)) return url.replace(/^http:\/\//i, 'https://')
  if (/^https:\/\//i.test(url)) return url.replace(/^https:\/\//i, 'http://')
  return url
}

async function tryFetch(
  url: string,
  method: 'HEAD' | 'GET',
  extraHeaders: HeadersInit = {},
): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'image/*',
        'User-Agent': 'LongPlay/1.0 (artwork-validator)',
        ...extraHeaders,
      },
      // CAA redirects http→https (or vice versa) on archive.org infra.
      // Follow so the validation succeeds against the final asset.
      redirect: 'follow',
      signal: ctrl.signal,
    })
    // 200 OK or 206 Partial Content (range request) both indicate
    // the asset is being served.
    if (res.status !== 200 && res.status !== 206) return false
    const ct = res.headers.get('content-type') ?? ''
    return ct.startsWith('image/')
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
}

/** HEAD + ranged-GET fallback for one URL. */
async function fetchValidates(url: string): Promise<boolean> {
  if (await tryFetch(url, 'HEAD')) return true
  // Some CDNs (notably CAA when serving from archive.org's S3-style
  // storage) don't reliably support HEAD. Ranged GET with bytes=0-0
  // pulls just a single byte but still surfaces status + content-type.
  return tryFetch(url, 'GET', { Range: 'bytes=0-0' })
}

async function validateArtwork(rawUrl: string): Promise<boolean> {
  // Non-CAA URLs (iTunes, etc.): validate exactly the URL we'd
  // persist. Normalize first as defense — iTunes serves https
  // anyway, but the normalize is cheap.
  if (!isCAAUrl(rawUrl)) {
    return fetchValidates(normalizeArtworkUrl(rawUrl))
  }

  // CAA path: try the URL as given (typically http://). If that
  // fails, try the alternate scheme. Either passing means the
  // asset is reachable; the writeback boundary will persist https.
  if (await fetchValidates(rawUrl)) return true
  const alt = alternateScheme(rawUrl)
  if (alt !== rawUrl && (await fetchValidates(alt))) return true
  return false
}

// ── Write to lib/albums.ts ───────────────────────────────────────────
// Strategy: find each album block by its unique `id: '<albumId>',`
// then replace the *next* `cover: "..."` after that. Operates on the
// source string so comments/whitespace stay intact.
function writeAlbumCovers(updates: Map<string, string>): {
  written: number
  missed: string[]
} {
  const path = join(process.cwd(), 'lib/albums.ts')
  let src = readFileSync(path, 'utf-8')
  let written = 0
  const missed: string[] = []

  for (const [albumId, rawUrl] of updates) {
    // Final HTTPS-normalization at the persistence boundary —
    // defense in depth. Upstream providers already normalize, but
    // this guarantees no http:// URL can ever land in lib/albums.ts
    // regardless of how it got into the `updates` map (override,
    // iTunes, MB+CAA, future providers).
    const newUrl = normalizeArtworkUrl(rawUrl)
    const escaped = albumId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const idRe = new RegExp(`id:\\s*['"]${escaped}['"]`)
    const idMatch = idRe.exec(src)
    if (!idMatch) {
      missed.push(albumId)
      continue
    }
    const after = src.slice(idMatch.index)
    const coverRe = /cover:\s*"([^"]*)"/
    const coverMatch = coverRe.exec(after)
    if (!coverMatch) {
      missed.push(albumId)
      continue
    }
    const absoluteIndex = idMatch.index + coverMatch.index
    const oldStr = coverMatch[0]
    const newStr = `cover: "${newUrl}"`
    src = src.slice(0, absoluteIndex) + newStr + src.slice(absoluteIndex + oldStr.length)
    written += 1
  }

  writeFileSync(path, src, 'utf-8')
  return { written, missed }
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const writeMode = args.includes('--write')
  const validateExisting = args.includes('--validate-existing')
  const useOverrides = args.includes('--use-overrides')
  const useMusicbrainz = args.includes('--use-musicbrainz')
  const debugCandidates = args.includes('--debug-candidates')
  const debugExpandedSearch = args.includes('--debug-expanded-search')
  const debugMusicbrainz = args.includes('--debug-musicbrainz')
  const onlyArg = args.find((a) => a.startsWith('--only='))
  const onlyId = onlyArg ? onlyArg.slice('--only='.length) : null

  const modeBits = []
  if (writeMode) modeBits.push('WRITE MODE')
  else modeBits.push('dry-run; pass --write to commit')
  if (validateExisting) modeBits.push('--validate-existing')
  if (useOverrides) modeBits.push('--use-overrides')
  if (useMusicbrainz) modeBits.push('--use-musicbrainz')
  if (debugCandidates) modeBits.push('--debug-candidates')
  if (debugExpandedSearch) modeBits.push('--debug-expanded-search')
  if (debugMusicbrainz) modeBits.push('--debug-musicbrainz')
  console.log(`\n── iTunes artwork resolver (${modeBits.join(', ')}) ──\n`)

  type WorkItem = {
    key: string
    id: string
    title: string
    artist: string
    currentCover: string
    reasonAdded: string
  }
  const work: WorkItem[] = []

  if (validateExisting) {
    console.log('HEAD-checking existing cover URLs first…')
  }

  for (const [key, raw] of Object.entries(ALBUMS)) {
    const album = raw as Album
    if (onlyId && album.id !== onlyId) continue

    // Always include empties + placeholders.
    if (!album.cover || album.cover.length === 0) {
      work.push({
        key,
        id: album.id,
        title: album.title,
        artist: album.artist,
        currentCover: '',
        reasonAdded: 'empty',
      })
      continue
    }
    if (album.cover.startsWith('https://placehold.co/')) {
      work.push({
        key,
        id: album.id,
        title: album.title,
        artist: album.artist,
        currentCover: album.cover,
        reasonAdded: 'placeholder',
      })
      continue
    }

    // For everything else: only consider if --validate-existing was
    // passed, AND only queue when the HEAD-check fails. Live valid
    // URLs are never overwritten.
    if (!validateExisting) continue
    const probe = await validateArtwork(album.cover)
    if (probe) continue // live and serving an image → leave alone
    work.push({
      key,
      id: album.id,
      title: album.title,
      artist: album.artist,
      currentCover: album.cover,
      reasonAdded: 'dead (HEAD failed)',
    })
  }

  console.log(`Candidates to resolve: ${work.length}\n`)
  if (work.length === 0) {
    console.log('(nothing to do)')
    process.exit(0)
  }

  let resolved = 0
  let unresolved = 0
  let ambiguous = 0
  const updates = new Map<string, string>()
  // Records the iTunes collectionId for every resolved album so the
  // operator can paste a deterministic override into MANUAL_OVERRIDES
  // for future runs. Surfaced in the end-of-run summary block.
  const discoveredCollectionIds = new Map<string, number>()
  // Per-source resolution tally — surfaced in the final summary so
  // the operator can see which provider did the work. Source values:
  //   'itunes-search'   default expanded multi-query path
  //   'itunes-lookup'   collectionId override path
  //   'override-url'    explicit artworkUrl override
  //   'musicbrainz-caa' MusicBrainz release-group → Cover Art Archive
  const resolvedBySource = new Map<string, number>()
  function bumpSource(src: string) {
    resolvedBySource.set(src, (resolvedBySource.get(src) ?? 0) + 1)
  }
  // Discovered MusicBrainz release-group MBIDs (per album id). Same
  // role as discoveredCollectionIds: enables deterministic re-runs
  // by letting the operator pin a specific MBID rather than relying
  // on the MB search-ranking ranking it the same way next time.
  const discoveredMBIDs = new Map<string, string>()

  /**
   * MusicBrainz + Cover Art Archive fallback. Called after every
   * iTunes failure path (UNRESOLVED / AMBIGUOUS / validation failed).
   * Returns true and bumps `resolved` + records the update on
   * success; returns false and leaves counters alone on failure.
   *
   * Guarded by --use-musicbrainz: when off, returns false immediately
   * without firing any MB/CAA calls.
   *
   * Validation: every MB-derived URL still goes through the same
   * validateArtwork() HEAD check as iTunes URLs. Strict.
   */
  async function tryMBFallback(
    item: { id: string; artist: string; title: string },
    before: string,
    iTunesFailureContext: string,
  ): Promise<boolean> {
    if (!useMusicbrainz) return false
    console.log(
      `    [musicbrainz] iTunes ${iTunesFailureContext}; attempting MusicBrainz fallback`,
    )
    const mb = await tryMusicBrainz({ artist: item.artist, title: item.title })
    if (debugMusicbrainz) {
      printMBDebug(mb)
    }
    if (!mb.imageUrl) {
      console.log(`    [musicbrainz] no usable image — ${mb.failureReason ?? 'unknown'}`)
      return false
    }
    const ok = await validateArtwork(mb.imageUrl)
    if (!ok) {
      console.log(
        `    [musicbrainz] CAA image did not HEAD-validate: ${mb.imageUrl.slice(0, 60)}…`,
      )
      return false
    }
    resolved += 1
    bumpSource('musicbrainz-caa')
    updates.set(item.id, mb.imageUrl)
    if (mb.mbid) discoveredMBIDs.set(item.id, mb.mbid)
    console.log(
      `    OK (source=musicbrainz-caa) → MB release-group ${mb.mbid ?? '?'}`,
    )
    console.log(`       before:  ${before}`)
    console.log(`       after:   ${mb.imageUrl.slice(0, 60)}…`)
    return true
  }

  for (let i = 0; i < work.length; i++) {
    const item = work[i]
    const prefix = `[${i + 1}/${work.length}]`
    const before =
      item.currentCover.length === 0
        ? '∅'
        : item.currentCover.slice(0, 60) + (item.currentCover.length > 60 ? '…' : '')

    process.stdout.write(
      `${prefix} ${item.artist} — ${item.title} [queued: ${item.reasonAdded}]\n`,
    )

    try {
      const override = useOverrides ? MANUAL_OVERRIDES[item.id] : undefined

      // ── Override path A: explicit artwork URL ───────────────────
      if (override?.artworkUrl) {
        // HTTPS-normalize at intake — operators may paste http://
        // URLs from documentation/Apple links. Single source of
        // truth: by the time the URL reaches HEAD-validate or
        // updates.set, it's https.
        const overrideUrl = normalizeArtworkUrl(override.artworkUrl)
        console.log(`    [override: artworkUrl${override.reason ? ` — ${override.reason}` : ''}]`)
        const ok = await validateArtwork(overrideUrl)
        if (!ok) {
          unresolved += 1
          console.log(`    UNRESOLVED (override URL did not HEAD-validate)`)
        } else {
          resolved += 1
          bumpSource('override-url')
          updates.set(item.id, overrideUrl)
          console.log(`    OK (source=override-url)`)
          console.log(`       before:  ${before}`)
          console.log(`       after:   ${overrideUrl.slice(0, 60)}…`)
        }
      }
      // ── Override path B: explicit iTunes collectionId ───────────
      else if (override?.collectionId) {
        console.log(`    [override: collectionId=${override.collectionId}${override.reason ? ` — ${override.reason}` : ''}]`)
        const lookup = await lookupITunes(override.collectionId)
        if (debugCandidates) {
          printPreFilterDebug(lookup, '(lookup)')
        }
        if (lookup.results.length === 0) {
          unresolved += 1
          console.log(`    UNRESOLVED (lookup returned no results)`)
        } else {
          const r = lookup.results.find((x) => x.collectionType === 'Album' && x.artworkUrl100)
          if (!r || !r.artworkUrl100) {
            unresolved += 1
            console.log(`    UNRESOLVED (lookup result missing artworkUrl100)`)
          } else {
            const upgraded = upgradeArtwork(r.artworkUrl100)
            let finalUrl = upgraded
            let ok = await validateArtwork(upgraded)
            let validationNote = ok ? 'OK 1000x1000' : 'failed 1000x1000'
            if (!ok && upgraded !== r.artworkUrl100) {
              ok = await validateArtwork(r.artworkUrl100)
              if (ok) {
                finalUrl = r.artworkUrl100
                validationNote = 'OK (fallback 100x100)'
              } else {
                validationNote = 'failed 1000x1000 AND 100x100'
              }
            }
            if (debugCandidates) {
              console.log(`    [debug] artwork validation: ${validationNote}`)
            }
            if (!ok) {
              unresolved += 1
              console.log(`    UNRESOLVED (validation failed on ${finalUrl.slice(0, 60)}…)`)
            } else {
              resolved += 1
              bumpSource('itunes-lookup')
              updates.set(item.id, finalUrl)
              console.log(
                `    OK (source=itunes-lookup) → ${r.artistName} — ${r.collectionName}`,
              )
              console.log(`       before:  ${before}`)
              console.log(`       after:   ${finalUrl.slice(0, 60)}…`)
            }
          }
        }
      }
      // ── Default path (expanded multi-query search) ──────────────
      else {
        if (override?.searchTerm) {
          console.log(`    [override: searchTerm="${override.searchTerm}"${override.reason ? ` — ${override.reason}` : ''}]`)
        }

        // Multi-query expanded search. Short-circuits as soon as ANY
        // query produces a canonical exact match — most albums
        // resolve on Q1. Stubborn ones run all 7.
        const expanded = await expandedSearch(
          { artist: item.artist, title: item.title },
          { primaryOverride: override?.searchTerm ?? null },
        )

        // Debug: per-query attempts + pooled provenance.
        if (debugExpandedSearch || debugCandidates) {
          printExpandedSearchDebug(expanded)
        }

        // Run the matcher on the deduped pool, not on any single
        // query's results. This way a canonical match that surfaced
        // on Q3 still wins even if Q1 also returned candidates.
        const { match, ambiguous: amb, reason, debug: matchDebug } = selectMatch(
          { title: item.title, artist: item.artist },
          expanded.pooled,
        )

        if (debugCandidates) {
          // No single "search term" makes sense here — show what we
          // tried. Pass the first query's term as a label.
          const headerTerm = expanded.queries[0]?.term ?? `${item.artist} ${item.title}`
          printCandidateDebug(item, headerTerm, matchDebug)
        }

        if (amb) {
          console.log(`    AMBIGUOUS (${reason})`)
          for (const r of expanded.pooled.slice(0, 3)) {
            console.log(`       candidate: ${r.artistName} — ${r.collectionName}`)
          }
          // MB fallback for ambiguous: MB may surface a clean
          // single canonical match where iTunes had multiple
          // near-ties.
          if (!(await tryMBFallback(item, before, 'AMBIGUOUS'))) {
            ambiguous += 1
          }
        } else if (!match) {
          console.log(
            `    UNRESOLVED (${reason ?? 'no match'}; tried ${expanded.queries.length} queries, ${expanded.pooled.length} pooled candidates)`,
          )
          if (!(await tryMBFallback(item, before, 'UNRESOLVED'))) {
            unresolved += 1
          }
        } else {
          const upgraded = upgradeArtwork(match.artworkUrl)
          let finalUrl = upgraded
          let ok = await validateArtwork(upgraded)
          let validationNote = ok ? `OK 1000x1000` : 'failed 1000x1000'
          if (!ok && upgraded !== match.artworkUrl) {
            ok = await validateArtwork(match.artworkUrl)
            if (ok) {
              finalUrl = match.artworkUrl
              validationNote = 'OK (fallback 100x100)'
            } else {
              validationNote = 'failed 1000x1000 AND 100x100'
            }
          }
          if (debugCandidates) {
            console.log(`    [debug] artwork validation: ${validationNote}`)
          }
          if (!ok) {
            console.log(`    UNRESOLVED (validation failed on ${finalUrl.slice(0, 60)}…)`)
            if (!(await tryMBFallback(item, before, 'iTunes validation failed'))) {
              unresolved += 1
            }
          } else {
            resolved += 1
            bumpSource('itunes-search')
            updates.set(item.id, finalUrl)
            console.log(
              `    OK (source=itunes-search) → matched ${match.artistName} — ${match.collectionName} (a=${match.artistScore.toFixed(2)} t=${match.titleScore.toFixed(2)})`,
            )
            console.log(`       before:  ${before}`)
            console.log(`       after:   ${finalUrl.slice(0, 60)}…`)
            // Track the discovered iTunes collectionId for the
            // end-of-run summary. Lets the operator paste a
            // deterministic override into MANUAL_OVERRIDES for
            // future runs without having to manually look the
            // album up on music.apple.com.
            if (match.collectionId !== undefined) {
              discoveredCollectionIds.set(item.id, match.collectionId)
            }
          }
        }
      }
    } catch (err) {
      unresolved += 1
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`    ERROR (${msg})`)
      if (debugCandidates) {
        // Even on error, show the URL we would have hit so the
        // operator can reproduce manually with curl.
        const term =
          (useOverrides ? MANUAL_OVERRIDES[item.id]?.searchTerm : null) ??
          `${item.artist} ${item.title}`
        console.log(`    [debug] attempted URL: ${itunesSearchUrl(term)}`)
      }
    }

    if (i < work.length - 1) {
      await new Promise((r) => setTimeout(r, PER_REQUEST_DELAY_MS))
    }
  }

  console.log(
    `\n── result: ${resolved} resolved · ${unresolved} unresolved · ${ambiguous} ambiguous ──\n`,
  )

  // ── Resolved-by-source breakdown ─────────────────────────────────
  if (resolvedBySource.size > 0) {
    console.log('── resolved by source ──')
    for (const [src, n] of resolvedBySource) {
      console.log(`  ${src.padEnd(22)} ${String(n).padStart(3)}`)
    }
    console.log()
  }

  // ── Discovered collectionId summary ─────────────────────────────
  // Every album resolved via expanded search through iTunes Search
  // came back with a collectionId. Surface them so the operator can
  // paste deterministic overrides into MANUAL_OVERRIDES for future
  // runs — no more silent recall regressions when iTunes ranking
  // changes.
  if (discoveredCollectionIds.size > 0) {
    console.log('── discovered iTunes collectionIds (copy into MANUAL_OVERRIDES for deterministic re-runs) ──')
    for (const [albumId, collectionId] of discoveredCollectionIds) {
      const slug = albumId.replace(/'/g, "\\'")
      console.log(`  '${slug}': { collectionId: ${collectionId} },`)
    }
    console.log()
  }

  // ── Discovered MusicBrainz MBIDs ─────────────────────────────────
  // Same role as collectionId summary — operator can pin a specific
  // MB release-group MBID for deterministic re-runs. Currently no
  // override-map slot for MBIDs, so this is informational; if MB
  // becomes a primary provider we'd add an override type for it.
  if (discoveredMBIDs.size > 0) {
    console.log('── discovered MusicBrainz release-group MBIDs ──')
    for (const [albumId, mbid] of discoveredMBIDs) {
      console.log(`  ${albumId.padEnd(28)} ${mbid}`)
    }
    console.log()
  }

  if (writeMode) {
    if (updates.size === 0) {
      console.log('(nothing to write)')
    } else {
      const { written, missed } = writeAlbumCovers(updates)
      console.log(`lib/albums.ts: wrote ${written} cover URLs`)
      if (missed.length > 0) {
        console.log(`  ! missed (id not found in file): ${missed.join(', ')}`)
      }
      console.log('\nNext step:')
      console.log('  tsx scripts/refresh-room-metadata.ts --dry')
      console.log('  tsx scripts/refresh-room-metadata.ts')
    }
  } else {
    console.log('(dry-run — pass --write to commit changes to lib/albums.ts)')
  }
}

main().catch((err) => {
  console.error('resolve-itunes-artwork failed:', err)
  process.exit(1)
})

// ── Debug printers ───────────────────────────────────────────────────
// Activated by --debug-candidates / --debug-expanded-search /
// --debug-musicbrainz. Use with --only=<slug>.

/**
 * Prints MusicBrainz search + selection + CAA debug for a single
 * MB fallback attempt. Activated by --debug-musicbrainz.
 */
function printMBDebug(mb: MBResolveResult): void {
  console.log()
  console.log(`    [mb-debug] search URL: ${mb.search.url}`)
  console.log(`    [mb-debug] search returned ${mb.search.results.length} release-groups`)
  if (mb.selection.debug.length > 0) {
    console.log(`    [mb-debug] selection (${mb.selection.debug.length} considered):`)
    for (let i = 0; i < mb.selection.debug.length; i++) {
      const c = mb.selection.debug[i]
      const rg = c.raw
      const a = (rg['artist-credit'] ?? [])
        .map((x) => x.name ?? x.artist?.name ?? '')
        .filter(Boolean)
        .join(', ')
      console.log(`    [mb-debug]   ${i + 1}. "${a}" — "${rg.title ?? '∅'}"`)
      console.log(
        `    [mb-debug]      type=${rg['primary-type'] ?? '∅'}   secondary=[${(rg['secondary-types'] ?? []).join(',')}]   first-release=${rg['first-release-date'] ?? '∅'}   id=${rg.id}`,
      )
      console.log(
        `    [mb-debug]      exactArtist=${c.exactArtist} exactTitle=${c.exactTitle} aScore=${c.artistScore.toFixed(3)} tScore=${c.titleScore.toFixed(3)}`,
      )
      if (c.status === 'accepted-canonical') {
        console.log(`    [mb-debug]      STATUS: ACCEPTED (canonical exact match)`)
      } else if (c.status === 'accepted') {
        console.log(`    [mb-debug]      STATUS: ACCEPTED`)
      } else {
        console.log(`    [mb-debug]      STATUS: REJECTED — ${c.rejectionReason ?? 'unknown'}`)
      }
    }
  }
  if (mb.selection.match) {
    console.log(
      `    [mb-debug] selected MBID: ${mb.selection.match.id} ("${mb.selection.match.title}")`,
    )
  } else {
    console.log(`    [mb-debug] no selection (${mb.selection.reason ?? mb.failureReason ?? '?'})`)
  }
  if (mb.caa) {
    console.log(`    [mb-debug] CAA URL: ${mb.caa.url}`)
    if (mb.caa.imageUrl) {
      console.log(
        `    [mb-debug] CAA picked: ${mb.caa.imageUrl.slice(0, 60)}…  (from: ${mb.caa.pickedFrom ?? '?'})`,
      )
    } else {
      console.log(`    [mb-debug] CAA returned no front image`)
    }
  } else if (mb.failureReason && mb.failureReason.startsWith('CAA')) {
    console.log(`    [mb-debug] CAA: ${mb.failureReason}`)
  }
  console.log()
}


/**
 * Prints the multi-query expanded search summary: each attempt's
 * URL + result count + canonical-hit flag, plus the pooled
 * candidate list with per-candidate provenance (which queries
 * surfaced it).
 *
 * Replaces printPreFilterDebug for the default-path branch.
 * printPreFilterDebug is still used by the collectionId-override
 * (lookup) path where there's only one query.
 */
function printExpandedSearchDebug(ex: ExpandedSearchResult): void {
  console.log()
  console.log(
    `    [debug] expanded search: ${ex.queries.length} ${ex.queries.length === 1 ? 'query' : 'queries'} attempted, ${ex.pooled.length} pooled candidates`,
  )
  for (let i = 0; i < ex.queries.length; i++) {
    const q = ex.queries[i]
    const flag = q.canonicalHit ? ' ← canonical-hit (early termination)' : ''
    console.log(
      `    [debug]   Q${i + 1} [${q.label}] entity=${q.entity ?? 'none'} → ${q.resp.results.length} results${flag}`,
    )
    console.log(`    [debug]      url: ${q.resp.url}`)
    if (q.resp.results.length === 0 && q.resp.rawBody && q.resp.rawBody.startsWith('(error:')) {
      console.log(`    [debug]      ${q.resp.rawBody}`)
    }
  }
  if (ex.pooled.length === 0) {
    console.log(`    [debug] pool is empty — no album-shaped iTunes results matched any query`)
    return
  }
  console.log(`    [debug] pooled candidates (deduped by collectionId):`)
  for (let i = 0; i < ex.pooled.length; i++) {
    const r = ex.pooled[i]
    const prov = (r.collectionId !== undefined && ex.provenance.get(r.collectionId)) || []
    console.log(
      `    [debug]   ${i + 1}. "${r.artistName ?? '∅'}" — "${r.collectionName ?? '∅'}"`,
    )
    console.log(
      `    [debug]      type=${r.collectionType ?? '∅'}   collectionId=${r.collectionId ?? '∅'}   from: [${prov.join(', ')}]`,
    )
  }
}



/**
 * Prints the raw iTunes response BEFORE any matcher filtering runs.
 * This is the first thing the operator sees per album under
 * --debug-candidates — it answers the question "did iTunes return
 * anything at all, and if so, what?". If results is empty we dump
 * the raw response body and the request URL so the operator can
 * curl it manually.
 *
 * Critical placement: this fires immediately after the await
 * searchITunes() / lookupITunes(), BEFORE selectMatch() — so it
 * runs regardless of whether the matcher accepts, rejects, or
 * crashes on the response.
 */
function printPreFilterDebug(resp: SearchResponse, sourceLabel: string): void {
  console.log()
  console.log(`    [debug] fetched ${resp.results.length} raw results from iTunes ${sourceLabel}`)
  console.log(`    [debug] resultCount=${resp.resultCount}   request URL:`)
  console.log(`    [debug]   ${resp.url}`)
  if (resp.results.length === 0) {
    console.log(`    [debug] !! iTunes returned ZERO usable results !!`)
    console.log(`    [debug] raw response body (first 500 chars):`)
    const snippet = resp.rawBody.slice(0, 500)
    console.log(`    [debug]   ${snippet}${resp.rawBody.length > 500 ? '…' : ''}`)
    console.log(`    [debug] suggestions:`)
    console.log(`    [debug]   - relax searchTerm override`)
    console.log(`    [debug]   - try without entity=album (some albums classified as Music)`)
    console.log(`    [debug]   - try the URL above in a browser/curl to compare`)
    return
  }
  console.log(`    [debug] pre-filter raw candidate dump:`)
  for (let i = 0; i < resp.results.length; i++) {
    const r = resp.results[i]
    console.log(
      `    [debug]   ${i + 1}. "${r.artistName ?? '∅'}" — "${r.collectionName ?? '∅'}"`,
    )
    console.log(
      `    [debug]      type=${r.collectionType ?? '∅'}   collectionId=${r.collectionId ?? '∅'}   artworkUrl100=${r.artworkUrl100 ? r.artworkUrl100.slice(0, 50) + '…' : '∅'}`,
    )
  }
}

/**
 * Prints the FULL per-candidate classification (including REJECTED
 * entries with reasons) AFTER selectMatch has run. This is the
 * "why did the matcher accept/reject each" view, complementary to
 * printPreFilterDebug's "what did iTunes return" view.
 */
function printCandidateDebug(
  item: { id: string; artist: string; title: string },
  searchTerm: string,
  debug: CandidateDebug[],
): void {
  console.log()
  console.log(`    [debug] iTunes search returned ${debug.length} results for term: "${searchTerm}"`)
  console.log(`    [debug] album normalize: "${normalize(item.title)}" by "${normalize(item.artist)}"`)
  for (let i = 0; i < debug.length; i++) {
    const c = debug[i]
    const r = c.raw
    console.log(`    [debug] candidate ${i + 1}/${debug.length}:`)
    console.log(`       raw artist:  "${r.artistName ?? '∅'}"`)
    console.log(`       norm artist: "${r.artistName ? normalize(r.artistName) : '∅'}"   exact=${c.exactArtist}   score=${c.artistScore.toFixed(3)}`)
    console.log(`       raw title:   "${r.collectionName ?? '∅'}"`)
    console.log(`       norm title:  "${r.collectionName ? normalize(r.collectionName) : '∅'}"   exact=${c.exactTitle}   score=${c.titleScore.toFixed(3)}`)
    console.log(`       collectionType=${r.collectionType ?? '∅'}   collectionId=${r.collectionId ?? '∅'}`)
    console.log(`       artworkUrl100: ${r.artworkUrl100 ?? '∅'}`)
    if (c.status === 'accepted-canonical') {
      console.log(`       STATUS: ACCEPTED (canonical exact match — bypassed type+compilation filters)`)
    } else if (c.status === 'accepted') {
      console.log(`       STATUS: ACCEPTED`)
    } else {
      console.log(`       STATUS: REJECTED — ${c.rejectionReason ?? 'unknown'}`)
    }
  }
  console.log()
}
