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
async function searchITunes(term: string): Promise<ITunesResult[]> {
  const url = new URL(ITUNES_BASE)
  url.searchParams.set('term', term)
  url.searchParams.set('entity', 'album')
  url.searchParams.set('country', 'US')
  url.searchParams.set('limit', '5')

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LongPlay/1.0 (+https://longplay.app)',
    },
  })
  if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`)
  const body = (await res.json()) as ITunesSearchResponse
  return body.results ?? []
}

/** iTunes Lookup API: fetch by exact collectionId. Returns same
 *  shape as search. Used by override path when the operator knows
 *  the specific Apple Music collection they want. */
async function lookupITunes(collectionId: number): Promise<ITunesResult[]> {
  const url = `${ITUNES_LOOKUP}?id=${encodeURIComponent(String(collectionId))}&entity=album`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'LongPlay/1.0 (+https://longplay.app)',
    },
  })
  if (!res.ok) throw new Error(`iTunes lookup HTTP ${res.status}`)
  const body = (await res.json()) as ITunesSearchResponse
  return body.results ?? []
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

// ── Upgrade artworkUrl100 → 1000x1000 ────────────────────────────────
function upgradeArtwork(url: string): string {
  // iTunes pattern: ".../<size>x<size>bb.<ext>"
  // Most albums serve 1000x1000bb.jpg cleanly; if not, the HEAD check
  // below will reject and we'll fall back to the original 100x100.
  return url.replace(/\/\d+x\d+bb\./, '/1000x1000bb.')
}

// ── HEAD validation ──────────────────────────────────────────────────
async function validateArtwork(url: string): Promise<boolean> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), HEAD_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { Accept: 'image/*' },
      signal: ctrl.signal,
    })
    if (!res.ok) return false
    const ct = res.headers.get('content-type') ?? ''
    return ct.startsWith('image/')
  } catch {
    return false
  } finally {
    clearTimeout(t)
  }
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

  for (const [albumId, newUrl] of updates) {
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
  const debugCandidates = args.includes('--debug-candidates')
  const onlyArg = args.find((a) => a.startsWith('--only='))
  const onlyId = onlyArg ? onlyArg.slice('--only='.length) : null

  const modeBits = []
  if (writeMode) modeBits.push('WRITE MODE')
  else modeBits.push('dry-run; pass --write to commit')
  if (validateExisting) modeBits.push('--validate-existing')
  if (useOverrides) modeBits.push('--use-overrides')
  if (debugCandidates) modeBits.push('--debug-candidates')
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
        console.log(`    [override: artworkUrl${override.reason ? ` — ${override.reason}` : ''}]`)
        const ok = await validateArtwork(override.artworkUrl)
        if (!ok) {
          unresolved += 1
          console.log(`    UNRESOLVED (override URL did not HEAD-validate)`)
        } else {
          resolved += 1
          updates.set(item.id, override.artworkUrl)
          console.log(`       before:  ${before}`)
          console.log(`       after:   ${override.artworkUrl.slice(0, 60)}…`)
        }
      }
      // ── Override path B: explicit iTunes collectionId ───────────
      else if (override?.collectionId) {
        console.log(`    [override: collectionId=${override.collectionId}${override.reason ? ` — ${override.reason}` : ''}]`)
        const results = await lookupITunes(override.collectionId)
        if (results.length === 0) {
          unresolved += 1
          console.log(`    UNRESOLVED (lookup returned no results)`)
        } else {
          // Lookup returns the exact album — accept its first Album
          // entry. Still HEAD-validate before writing.
          const r = results.find((x) => x.collectionType === 'Album' && x.artworkUrl100)
          if (!r || !r.artworkUrl100) {
            unresolved += 1
            console.log(`    UNRESOLVED (lookup result missing artworkUrl100)`)
          } else {
            const upgraded = upgradeArtwork(r.artworkUrl100)
            let finalUrl = upgraded
            let ok = await validateArtwork(upgraded)
            if (!ok && upgraded !== r.artworkUrl100) {
              ok = await validateArtwork(r.artworkUrl100)
              if (ok) finalUrl = r.artworkUrl100
            }
            if (!ok) {
              unresolved += 1
              console.log(`    UNRESOLVED (validation failed on ${finalUrl.slice(0, 60)}…)`)
            } else {
              resolved += 1
              updates.set(item.id, finalUrl)
              console.log(
                `    OK → lookup ${r.artistName} — ${r.collectionName}`,
              )
              console.log(`       before:  ${before}`)
              console.log(`       after:   ${finalUrl.slice(0, 60)}…`)
            }
          }
        }
      }
      // ── Default path (with optional searchTerm override) ────────
      else {
        const term = override?.searchTerm ?? `${item.artist} ${item.title}`
        if (override?.searchTerm) {
          console.log(`    [override: searchTerm="${term}"${override.reason ? ` — ${override.reason}` : ''}]`)
        }
        const results = await searchITunes(term)
        const { match, ambiguous: amb, reason, debug: matchDebug } = selectMatch(
          { title: item.title, artist: item.artist },
          results,
        )

        if (debugCandidates) {
          printCandidateDebug(item, term, matchDebug)
        }

        if (amb) {
          ambiguous += 1
          console.log(`    AMBIGUOUS (${reason})`)
          for (const r of results.slice(0, 3)) {
            console.log(`       candidate: ${r.artistName} — ${r.collectionName}`)
          }
        } else if (!match) {
          unresolved += 1
          console.log(`    UNRESOLVED (${reason ?? 'no match'})`)
        } else {
          const upgraded = upgradeArtwork(match.artworkUrl)
          let finalUrl = upgraded
          let ok = await validateArtwork(upgraded)
          let validationNote = ok ? `OK 1000x1000` : 'failed 1000x1000'
          if (!ok && upgraded !== match.artworkUrl) {
            // Fall back to the original 100x100 if 1000x1000 isn't served.
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
            unresolved += 1
            console.log(`    UNRESOLVED (validation failed on ${finalUrl.slice(0, 60)}…)`)
          } else {
            resolved += 1
            updates.set(item.id, finalUrl)
            console.log(
              `    OK → matched ${match.artistName} — ${match.collectionName} (a=${match.artistScore.toFixed(2)} t=${match.titleScore.toFixed(2)})`,
            )
            console.log(`       before:  ${before}`)
            console.log(`       after:   ${finalUrl.slice(0, 60)}…`)
          }
        }
      }
    } catch (err) {
      unresolved += 1
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`    ERROR (${msg})`)
    }

    if (i < work.length - 1) {
      await new Promise((r) => setTimeout(r, PER_REQUEST_DELAY_MS))
    }
  }

  console.log(
    `\n── result: ${resolved} resolved · ${unresolved} unresolved · ${ambiguous} ambiguous ──\n`,
  )

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

// ── Debug printer ────────────────────────────────────────────────────
// Activated by --debug-candidates. Prints the FULL per-candidate
// classification (including rejected) for one album's iTunes search,
// so the operator can see exactly why each candidate was kept or
// dropped. Use with --only=<slug>.
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
