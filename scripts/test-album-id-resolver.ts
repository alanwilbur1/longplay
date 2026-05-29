/**
 * scripts/test-album-id-resolver.ts — Phase 6B.4D
 *
 * Pure-logic tests for the Spotify album-ID resolver. The network is
 * injected (CatalogDeps), so these scenarios prove the resolution
 * algorithm — including the Southeastern / Illinois cases (stale id
 * 404s, search finds the canonical album) — without any HTTP.
 */

import {
  isValidSpotifyAlbumIdShape,
  albumIdFromUrl,
  gatherAlbumIdCandidates,
  normalizeForMatch,
  tokenSimilarity,
  scoreAlbumMatch,
  pickBestSearchMatch,
  resolveSpotifyAlbumId,
  type CatalogDeps,
  type SearchResultAlbum,
} from '../lib/spotify/album-id-resolver'

let pass = 0
let fail = 0
const failures: string[] = []
function assert(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass += 1
    console.log(`  ✓ ${label}`)
  } else {
    fail += 1
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

// A real-shaped (22 base62) id helper for fixtures.
const ID = (s: string) => s.padEnd(22, '0').slice(0, 22)
const GOOD = ID('realAlbum')
const STALE = ID('staleAlbum')

function deps(opts: {
  byId?: Record<string, { name: string; artist: string } | { status: number }>
  search?: SearchResultAlbum[] | 'throw'
}): CatalogDeps {
  return {
    async getAlbumById(id) {
      const e = opts.byId?.[id]
      if (!e) return { ok: false, status: 404 }
      if ('status' in e) return { ok: false, status: e.status }
      return { ok: true, name: e.name, artist: e.artist }
    },
    async searchAlbums() {
      if (opts.search === 'throw') throw new Error('unreachable')
      return opts.search ?? []
    },
  }
}

async function main() {
  console.log('\n── album-id resolver tests ──\n')

  console.log('isValidSpotifyAlbumIdShape:')
  assert('22 base62 → valid', isValidSpotifyAlbumIdShape('1bg476ZQn7hmcXaU05SHV4'))
  assert('too short → invalid', !isValidSpotifyAlbumIdShape('abc'))
  assert('null → invalid', !isValidSpotifyAlbumIdShape(null))
  assert('has dash → invalid', !isValidSpotifyAlbumIdShape('1bg476ZQn7hmcXaU05SH-4'))

  console.log('\nalbumIdFromUrl:')
  assert(
    'open.spotify album url → id',
    albumIdFromUrl('https://open.spotify.com/album/1bg476ZQn7hmcXaU05SHV4?si=x') ===
      '1bg476ZQn7hmcXaU05SHV4',
  )
  assert('track url → null', albumIdFromUrl('https://open.spotify.com/track/1bg476ZQn7hmcXaU05SHV4') === null)
  assert('garbage → null', albumIdFromUrl('not a url') === null)

  console.log('\ngatherAlbumIdCandidates (priority + dedupe + shape):')
  const cands = gatherAlbumIdCandidates({
    slug: 'x',
    title: 'T',
    artist: 'A',
    dbSpotifyId: null,
    dbStreamingUrl: 'https://open.spotify.com/album/' + GOOD,
    staticSpotifyId: 'bad-shape',
    staticSpotifyUrl: 'https://open.spotify.com/album/' + GOOD, // dupe of db url
  })
  assert('db_streaming_url first when db_spotify_id empty', cands[0]?.source === 'db_streaming_url')
  assert('shape-invalid static id dropped', !cands.some((c) => c.id === 'bad-shape'))
  assert('duplicate id deduped', cands.filter((c) => c.id === GOOD).length === 1)

  console.log('\nnormalizeForMatch / tokenSimilarity:')
  assert(
    'drops parenthetical edition',
    normalizeForMatch('Southeastern (10 Year Anniversary Edition)') === 'southeastern',
  )
  assert('identical → 1', tokenSimilarity('Illinois', 'Illinois') === 1)
  assert('unrelated → 0', tokenSimilarity('Illinois', 'Southeastern') === 0)

  console.log('\nscoreAlbumMatch:')
  assert(
    'same artist+title → high',
    scoreAlbumMatch(
      { artist: 'Jason Isbell', title: 'Southeastern' },
      { artist: 'Jason Isbell', title: 'Southeastern' },
    ).confidence === 'high',
  )
  assert(
    'wrong album → low',
    scoreAlbumMatch(
      { artist: 'Jason Isbell', title: 'Southeastern' },
      { artist: 'Sufjan Stevens', title: 'Illinois' },
    ).confidence === 'low',
  )

  console.log('\npickBestSearchMatch:')
  const best = pickBestSearchMatch(
    { artist: 'Sufjan Stevens', title: 'Illinois' },
    [
      { id: ID('wrong'), name: 'Carrie & Lowell', artist: 'Sufjan Stevens' },
      { id: GOOD, name: 'Illinois', artist: 'Sufjan Stevens' },
    ],
  )
  assert('picks the matching album', best?.id === GOOD)
  assert('high confidence on exact match', best?.score.confidence === 'high')

  console.log('\nresolveSpotifyAlbumId scenarios:')

  // S1: DB id valid + matches → high, db_spotify_id.
  const s1 = await resolveSpotifyAlbumId(
    { slug: 'southeastern', title: 'Southeastern', artist: 'Jason Isbell', dbSpotifyId: GOOD },
    deps({ byId: { [GOOD]: { name: 'Southeastern', artist: 'Jason Isbell' } } }),
  )
  assert('S1 db valid → high', s1.confidence === 'high' && s1.method === 'db_spotify_id')
  assert('S1 resolvedId = db id', s1.resolvedId === GOOD)
  assert('S1 validated', s1.validated === true)

  // S2: stale static id 404s, search finds the canonical album (the
  // exact Southeastern/Illinois failure mode).
  const s2 = await resolveSpotifyAlbumId(
    { slug: 'illinois', title: 'Illinois', artist: 'Sufjan Stevens', staticSpotifyId: STALE },
    deps({
      byId: { [STALE]: { status: 404 } },
      search: [{ id: GOOD, name: 'Illinois', artist: 'Sufjan Stevens' }],
    }),
  )
  assert('S2 stale id → resolved via search', s2.method === 'search' && s2.confidence === 'high')
  assert('S2 resolvedId = canonical', s2.resolvedId === GOOD)
  assert('S2 existingId = stale (logged)', s2.existingId === STALE)

  // S3: candidate id resolves to a DIFFERENT album → rejected; no
  // confident search match → unresolved with mismatch reason.
  const s3 = await resolveSpotifyAlbumId(
    { slug: 'x', title: 'Southeastern', artist: 'Jason Isbell', dbSpotifyId: STALE },
    deps({
      byId: { [STALE]: { name: 'Some Other Record', artist: 'Other Artist' } },
      search: [],
    }),
  )
  assert('S3 mismatched id rejected → unresolved', s3.confidence === 'none' && s3.resolvedId === null)
  assert('S3 reason mentions different album', (s3.reason ?? '').includes('different album'))

  // S4: catalog unreachable (403) + search throws → keep existing,
  // low confidence, NOT validated (never destructively overwrite).
  const s4 = await resolveSpotifyAlbumId(
    { slug: 'x', title: 'T', artist: 'A', dbSpotifyId: GOOD },
    deps({ byId: { [GOOD]: { status: 403 } }, search: 'throw' }),
  )
  assert('S4 unreachable → keeps existing id', s4.resolvedId === GOOD)
  assert('S4 low + unvalidated', s4.confidence === 'low' && s4.validated === false)

  // S5: no candidate ids at all, search resolves it.
  const s5 = await resolveSpotifyAlbumId(
    { slug: 'x', title: 'Illinois', artist: 'Sufjan Stevens' },
    deps({ search: [{ id: GOOD, name: 'Illinois', artist: 'Sufjan Stevens' }] }),
  )
  assert('S5 no candidates → search high', s5.method === 'search' && s5.resolvedId === GOOD)

  // S6: nothing resolves.
  const s6 = await resolveSpotifyAlbumId(
    { slug: 'x', title: 'Unknown', artist: 'Nobody' },
    deps({ search: [] }),
  )
  assert('S6 nothing → none/null', s6.confidence === 'none' && s6.resolvedId === null)

  console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
  if (fail > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('test failed:', err)
  process.exit(1)
})
