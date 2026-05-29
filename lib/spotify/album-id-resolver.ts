/**
 * lib/spotify/album-id-resolver.ts — Phase 6B.4D
 *
 * Canonical, automatic Spotify album-ID resolution. Replaces the
 * brittle "patch one bad ID at a time" model: instead of trusting a
 * hand-entered static catalog id, we VALIDATE candidate ids against
 * Spotify and, when none hold up, SEARCH by artist + title.
 *
 * This module is the pure, network-free core (no fetch, no DOM, no
 * server-only) so it is fully unit-testable. The actual Spotify HTTP
 * calls are injected as `CatalogDeps` (see lib/spotify/album-catalog.ts
 * for the real, token-backed implementations). That seam lets tests
 * simulate "stale id 404s, search finds the real album" without a
 * network.
 *
 * Resolution order (requirement #3):
 *   1. Prefer a candidate id that VALIDATES against Spotify and whose
 *      album metadata matches the expected artist + title. Candidates
 *      are gathered in source priority:
 *        db_spotify_id → db_streaming_url → static_spotify_id →
 *        static_spotify_url
 *   2. If no candidate validates (404 / wrong album), SEARCH Spotify
 *      by artist + title and take the best match.
 *   3. Reject impossible id shapes and stale ids that resolve to a
 *      different album. Never invent an id.
 */

/** Spotify ids are exactly 22 base62 characters. */
const SPOTIFY_ID_RE = /^[A-Za-z0-9]{22}$/

/** Album id slot in a Spotify URL (open.spotify.com/album/<id>). */
const ALBUM_URL_RE = /spotify\.com\/(?:embed\/)?album\/([A-Za-z0-9]+)/i

export function isValidSpotifyAlbumIdShape(
  id: string | null | undefined,
): boolean {
  return typeof id === 'string' && SPOTIFY_ID_RE.test(id)
}

/** Parse an album id out of a Spotify URL, shape-validated. */
export function albumIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(ALBUM_URL_RE)
  const id = m ? m[1] : null
  return isValidSpotifyAlbumIdShape(id) ? id : null
}

export type CandidateSource =
  | 'db_spotify_id'
  | 'db_streaming_url'
  | 'static_spotify_id'
  | 'static_spotify_url'

export interface AlbumIdSources {
  slug: string
  title: string
  artist: string
  dbSpotifyId?: string | null
  dbStreamingUrl?: string | null
  staticSpotifyId?: string | null
  staticSpotifyUrl?: string | null
}

export interface IdCandidate {
  id: string
  source: CandidateSource
}

/**
 * Gather shape-valid candidate ids in source priority order, deduped
 * (first source to contribute an id keeps it).
 */
export function gatherAlbumIdCandidates(
  sources: AlbumIdSources,
): IdCandidate[] {
  const ordered: Array<[CandidateSource, string | null]> = [
    ['db_spotify_id', normalizeId(sources.dbSpotifyId)],
    ['db_streaming_url', albumIdFromUrl(sources.dbStreamingUrl)],
    ['static_spotify_id', normalizeId(sources.staticSpotifyId)],
    ['static_spotify_url', albumIdFromUrl(sources.staticSpotifyUrl)],
  ]
  const out: IdCandidate[] = []
  const seen = new Set<string>()
  for (const [source, id] of ordered) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, source })
  }
  return out
}

function normalizeId(id: string | null | undefined): string | null {
  if (!id) return null
  const trimmed = id.trim()
  return isValidSpotifyAlbumIdShape(trimmed) ? trimmed : null
}

// ── Matching ───────────────────────────────────────────────────────

/**
 * Normalize a title/artist for comparison: lowercase, strip
 * diacritics, drop parenthetical/bracketed qualifiers and common
 * edition words, collapse punctuation + whitespace. This lets
 * "Southeastern (10 Year Anniversary Edition)" match "Southeastern"
 * and "Illinois" match "Illinois" regardless of the "Illinoise" cover
 * styling.
 */
export function normalizeForMatch(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(
      /\b(deluxe|remaster(?:ed)?|expanded|anniversary|edition|version|reissue|mono|stereo|bonus|explicit|clean|the)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Token Jaccard similarity in [0,1] over normalized words. */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeForMatch(a).split(' ').filter(Boolean))
  const tb = new Set(normalizeForMatch(b).split(' ').filter(Boolean))
  if (ta.size === 0 && tb.size === 0) return 1
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}

export type Confidence = 'high' | 'medium' | 'low' | 'none'

export interface MatchScore {
  artistSim: number
  titleSim: number
  confidence: Confidence
}

/**
 * Score how well a candidate album's metadata matches the expected
 * artist + title. High requires strong agreement on BOTH.
 */
export function scoreAlbumMatch(
  expected: { artist: string; title: string },
  candidate: { artist: string; title: string },
): MatchScore {
  const artistSim = tokenSimilarity(expected.artist, candidate.artist)
  const titleSim = tokenSimilarity(expected.title, candidate.title)
  let confidence: Confidence
  if (artistSim >= 0.8 && titleSim >= 0.8) confidence = 'high'
  else if (artistSim >= 0.5 && titleSim >= 0.5) confidence = 'medium'
  else confidence = 'low'
  return { artistSim, titleSim, confidence }
}

export interface SearchResultAlbum {
  id: string
  name: string
  artist: string
}

export interface BestSearchMatch {
  id: string
  name: string
  artist: string
  score: MatchScore
}

/** Pick the highest-scoring search result for the expected album. */
export function pickBestSearchMatch(
  expected: { artist: string; title: string },
  results: ReadonlyArray<SearchResultAlbum>,
): BestSearchMatch | null {
  let best: BestSearchMatch | null = null
  for (const r of results) {
    if (!isValidSpotifyAlbumIdShape(r.id)) continue
    const score = scoreAlbumMatch(expected, { artist: r.artist, title: r.name })
    const combined = score.artistSim + score.titleSim
    if (!best || combined > best.score.artistSim + best.score.titleSim) {
      best = { id: r.id, name: r.name, artist: r.artist, score }
    }
  }
  return best
}

// ── Orchestrator ───────────────────────────────────────────────────

export type ResolutionMethod = CandidateSource | 'search' | 'unresolved'

export interface ResolutionResult {
  slug: string
  /** Best pre-resolution candidate id (for logging the "before"). */
  existingId: string | null
  resolvedId: string | null
  method: ResolutionMethod
  confidence: Confidence
  /** Whether the resolved id was confirmed against Spotify. */
  validated: boolean
  /** Human-readable explanation, especially when unresolved/low. */
  reason: string | null
}

export interface CatalogDeps {
  /** GET /v1/albums/{id}. */
  getAlbumById: (
    id: string,
  ) => Promise<
    | { ok: true; name: string; artist: string }
    | { ok: false; status: number | null }
  >
  /** GET /v1/search?type=album by artist + title. */
  searchAlbums: (
    artist: string,
    title: string,
  ) => Promise<SearchResultAlbum[]>
}

/**
 * Resolve the canonical Spotify album id for one album.
 *
 * Strategy: validate candidates in priority order; the first that
 * exists AND matches the expected artist+title wins (high confidence).
 * A candidate that 404s or resolves to a DIFFERENT album is rejected.
 * If nothing validates, fall back to Spotify search. When the catalog
 * is unreachable (401/403/429/network) we neither confirm nor reject —
 * we keep the top shape-valid candidate at low confidence and say so,
 * so the script never destructively overwrites on a transient outage.
 */
export async function resolveSpotifyAlbumId(
  sources: AlbumIdSources,
  deps: CatalogDeps,
): Promise<ResolutionResult> {
  const candidates = gatherAlbumIdCandidates(sources)
  const existingId = candidates[0]?.id ?? null
  const expected = { artist: sources.artist, title: sources.title }

  let sawUnreachable = false
  let sawMismatch = false

  for (const cand of candidates) {
    const res = await deps.getAlbumById(cand.id)
    if (res.ok) {
      const score = scoreAlbumMatch(expected, {
        artist: res.artist,
        title: res.name,
      })
      if (score.confidence === 'high') {
        return {
          slug: sources.slug,
          existingId,
          resolvedId: cand.id,
          method: cand.source,
          confidence: 'high',
          validated: true,
          reason: null,
        }
      }
      // Exists but is a different album → stale id, reject + keep looking.
      sawMismatch = true
      continue
    }
    // 404 → genuinely invalid. 401/403/429/null → can't tell right now.
    if (res.status !== 404) sawUnreachable = true
  }

  // No candidate validated → search by artist + title.
  let searchUnreachable = false
  let best: BestSearchMatch | null = null
  try {
    const results = await deps.searchAlbums(sources.artist, sources.title)
    best = pickBestSearchMatch(expected, results)
  } catch {
    searchUnreachable = true
  }

  if (best && best.score.confidence === 'high') {
    return {
      slug: sources.slug,
      existingId,
      resolvedId: best.id,
      method: 'search',
      confidence: 'high',
      validated: true,
      reason:
        existingId && existingId !== best.id
          ? `existing id ${existingId} did not validate; matched via search`
          : 'matched via search',
    }
  }
  if (best && best.score.confidence === 'medium') {
    return {
      slug: sources.slug,
      existingId,
      resolvedId: best.id,
      method: 'search',
      confidence: 'medium',
      validated: true,
      reason: 'best search match is only a partial title/artist match',
    }
  }

  // Couldn't confirm anything. If the catalog was unreachable and we
  // have a shape-valid candidate, keep it unverified rather than nuke
  // it on a transient failure.
  if ((sawUnreachable || searchUnreachable) && existingId) {
    return {
      slug: sources.slug,
      existingId,
      resolvedId: existingId,
      method: candidates[0].source,
      confidence: 'low',
      validated: false,
      reason: 'Spotify catalog unreachable; existing id unverified',
    }
  }

  return {
    slug: sources.slug,
    existingId,
    resolvedId: null,
    method: 'unresolved',
    confidence: 'none',
    validated: false,
    reason: sawMismatch
      ? 'candidate ids resolve to a different album; no confident search match'
      : 'no valid candidate id and no confident search match',
  }
}
