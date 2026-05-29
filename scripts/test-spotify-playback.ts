/**
 * scripts/test-spotify-playback.ts — Phase 6B.4A
 *
 * Pure-function tests for the authenticated in-room playback helpers:
 *   - lib/streaming/playback-scopes  (scope gap analysis)
 *   - lib/spotify/playback-state      (SDK state normalization + format)
 *
 * Both modules are pure-of-DOM, pure-of-fetch, pure-of-React — the
 * only pieces of the playback feature that warrant automation. The
 * SDK lifecycle + token route are exercised by manual deploy probes.
 */

import {
  PLAYBACK_SCOPES,
  missingPlaybackScopes,
  hasAllPlaybackScopes,
} from '../lib/streaming/playback-scopes'
import {
  summarizeWebPlaybackState,
  playbackProgressFraction,
  formatPlaybackPosition,
  isPremiumProduct,
  trackUriFromId,
  resolveAlbumCurrentUri,
} from '../lib/spotify/playback-state'

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

function main() {
  console.log('\n── spotify playback helper tests ──\n')

  console.log('missingPlaybackScopes / hasAllPlaybackScopes:')
  assert(
    'null granted → all missing',
    missingPlaybackScopes(null).length === PLAYBACK_SCOPES.length,
  )
  assert('null granted → not all present', hasAllPlaybackScopes(null) === false)
  assert(
    'legacy read-only cohort → all playback scopes missing',
    missingPlaybackScopes([
      'user-read-email',
      'user-top-read',
      'user-read-recently-played',
      'user-library-read',
    ]).length === PLAYBACK_SCOPES.length,
  )
  assert(
    'full playback grant → none missing',
    missingPlaybackScopes([...PLAYBACK_SCOPES]).length === 0,
  )
  assert(
    'full playback grant → hasAll true',
    hasAllPlaybackScopes([...PLAYBACK_SCOPES]) === true,
  )
  assert(
    'partial grant → reports exactly the gap',
    JSON.stringify(
      missingPlaybackScopes(['streaming', 'user-read-private']).sort(),
    ) ===
      JSON.stringify(
        [
          'user-read-playback-state',
          'user-modify-playback-state',
          'user-read-currently-playing',
        ].sort(),
      ),
  )
  assert(
    'extra unrelated scopes do not affect gap',
    hasAllPlaybackScopes([...PLAYBACK_SCOPES, 'user-read-email']) === true,
  )

  console.log('\nsummarizeWebPlaybackState:')
  assert('null → null', summarizeWebPlaybackState(null) === null)
  assert('undefined → null', summarizeWebPlaybackState(undefined) === null)

  const idle = summarizeWebPlaybackState({ paused: true })
  assert('no track_window → current is null', idle !== null && idle.current === null)
  assert('missing paused defaults to paused (idle)', idle !== null && idle.isPaused === true)

  const playing = summarizeWebPlaybackState({
    paused: false,
    position: 65_000,
    duration: 200_000,
    disallows: { skipping_prev: true },
    track_window: {
      current_track: {
        name: 'Cover Me Up',
        uri: 'spotify:track:abc123',
        artists: [{ name: 'Jason Isbell' }],
      },
    },
  })
  assert('playing → not paused', playing !== null && playing.isPaused === false)
  assert('playing → track title mapped', playing?.current?.title === 'Cover Me Up')
  assert('playing → artist mapped', playing?.current?.artist === 'Jason Isbell')
  assert('playing → uri mapped (for highlight)', playing?.current?.uri === 'spotify:track:abc123')
  assert('playing → position carried', playing?.positionMs === 65_000)

  const noUri = summarizeWebPlaybackState({
    track_window: { current_track: { name: 'Untitled' } },
  })
  assert('missing uri → current.uri null', noUri?.current?.uri === null)

  console.log('\ntrackUriFromId:')
  assert(
    'bare id → prefixed uri',
    trackUriFromId('4xnq8WAJBhmaW6sBjcsh1U') === 'spotify:track:4xnq8WAJBhmaW6sBjcsh1U',
  )
  assert(
    'already-prefixed → unchanged',
    trackUriFromId('spotify:track:xyz') === 'spotify:track:xyz',
  )
  assert('empty → empty (no crash)', trackUriFromId('') === '')
  assert(
    'disallows.skipping_prev true → canSkipPrev false',
    playing?.canSkipPrev === false,
  )
  assert(
    'absent skipping_next → canSkipNext true',
    playing?.canSkipNext === true,
  )

  const multiArtist = summarizeWebPlaybackState({
    track_window: {
      current_track: {
        name: 'X',
        artists: [{ name: 'A' }, { name: 'B' }],
      },
    },
  })
  assert('multiple artists joined', multiArtist?.current?.artist === 'A, B')

  const negPos = summarizeWebPlaybackState({ position: -5, duration: -10 })
  assert('negative position clamped to 0', negPos?.positionMs === 0)
  assert('negative duration clamped to 0', negPos?.durationMs === 0)

  console.log('\nplaybackProgressFraction:')
  assert('half way → 0.5', playbackProgressFraction(50, 100) === 0.5)
  assert('zero duration → 0', playbackProgressFraction(50, 0) === 0)
  assert('overflow clamps to 1', playbackProgressFraction(200, 100) === 1)
  assert('negative clamps to 0', playbackProgressFraction(-5, 100) === 0)

  console.log('\nformatPlaybackPosition:')
  assert('null → 0:00', formatPlaybackPosition(null) === '0:00')
  assert('negative → 0:00', formatPlaybackPosition(-1) === '0:00')
  assert('65s → 1:05', formatPlaybackPosition(65_000) === '1:05')
  assert('floors sub-second', formatPlaybackPosition(65_900) === '1:05')
  assert('hour-spanning → 1:02:15', formatPlaybackPosition(3_735_000) === '1:02:15')

  console.log('\nresolveAlbumCurrentUri (room-album scoping):')
  const album = new Set([
    'spotify:track:cover-me-up',
    'spotify:track:elephant',
  ])
  assert(
    'current track in album → returned',
    resolveAlbumCurrentUri('spotify:track:elephant', album) === 'spotify:track:elephant',
  )
  assert(
    'current track NOT in album (other room) → null',
    resolveAlbumCurrentUri('spotify:track:isbell-somewhere-else', album) === null,
  )
  assert('null current → null', resolveAlbumCurrentUri(null, album) === null)
  assert('undefined current → null', resolveAlbumCurrentUri(undefined, album) === null)
  assert('empty album set → null', resolveAlbumCurrentUri('spotify:track:x', new Set()) === null)

  console.log('\nisPremiumProduct:')
  assert("'premium' → true", isPremiumProduct('premium') === true)
  assert("'free' → false", isPremiumProduct('free') === false)
  assert("'open' → false", isPremiumProduct('open') === false)
  assert('null → false', isPremiumProduct(null) === false)

  console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
  if (fail > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main()
