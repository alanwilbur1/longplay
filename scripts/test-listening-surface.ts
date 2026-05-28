/**
 * scripts/test-listening-surface.ts — Phase 6B.4
 *
 * Pure-function tests for extractSpotifyAlbumId. The function is the
 * one piece of logic in components/ritual/listening-surface.tsx that
 * runs without React, so we test it in isolation.
 */

import { extractSpotifyAlbumId } from '../components/ritual/listening-surface'

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

async function main() {
  console.log('\n── listening surface tests ──\n')
  console.log('extractSpotifyAlbumId:')

  assert(
    'canonical album URL',
    extractSpotifyAlbumId('https://open.spotify.com/album/5vkqYmiPBYLaalcmjujWxK') ===
      '5vkqYmiPBYLaalcmjujWxK',
  )
  assert(
    'with query string (si=…)',
    extractSpotifyAlbumId(
      'https://open.spotify.com/album/1weenld61qoidwYuZ1GESA?si=abc123',
    ) === '1weenld61qoidwYuZ1GESA',
  )
  assert(
    'embed URL form',
    extractSpotifyAlbumId(
      'https://open.spotify.com/embed/album/0aDUfVf5a9aJMUH0mWiYaJ',
    ) === '0aDUfVf5a9aJMUH0mWiYaJ',
  )
  assert(
    'http (insecure) variant',
    extractSpotifyAlbumId('http://open.spotify.com/album/4R6FV0JFVP2k') ===
      '4R6FV0JFVP2k',
  )
  assert('null → null', extractSpotifyAlbumId(null) === null)
  assert('undefined → null', extractSpotifyAlbumId(undefined) === null)
  assert('empty string → null', extractSpotifyAlbumId('') === null)
  assert(
    'track URL (different shape) → null',
    extractSpotifyAlbumId('https://open.spotify.com/track/7M7ekLuXuP3') === null,
  )
  assert(
    'playlist URL → null',
    extractSpotifyAlbumId('https://open.spotify.com/playlist/abc123') === null,
  )
  assert(
    'random URL → null',
    extractSpotifyAlbumId('https://example.com/album/anything') === null,
  )

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
