import 'server-only'

import {
  fetchAlbumTracks,
  mintClientCredentialsToken,
} from '@/lib/streaming/spotify-tracks'
import {
  getAlbumTracksByAlbumId,
  upsertAlbumTracks,
  type AlbumTrackRow,
} from '@/lib/data/album-tracks'

/**
 * lib/data/hydrate-album-tracks.ts — Phase 6B.4A
 *
 * Best-effort, on-demand album-track hydration for the room render
 * path. When a cycle's artifact album has a Spotify ID but no
 * album_tracks rows yet (the offline hydrate script hasn't run for
 * it), this fills them in-request so the listener sees a real
 * tracklist instead of the empty fallback.
 *
 * Properties:
 *   - Idempotent + cheap on the hot path: if rows already exist it
 *     returns them WITHOUT any network call.
 *   - Best-effort: any failure (restricted catalog, rate limit,
 *     missing client creds, DB error) resolves to the rows we could
 *     read (possibly empty). It NEVER throws into the page render and
 *     NEVER fabricates tracks — honest empty over invented data.
 *   - Uses client-credentials (catalog) auth, same as the offline
 *     hydrate script — no user token involved.
 */
export async function getOrHydrateAlbumTracks(
  albumUuid: string,
  spotifyAlbumId: string | null,
): Promise<AlbumTrackRow[]> {
  // 1. Cheap path — already hydrated.
  const existing = await getAlbumTracksByAlbumId(albumUuid)
  if (existing.length > 0) return existing

  // 2. Nothing to hydrate from.
  if (!spotifyAlbumId) return existing

  // 3. Best-effort catalog fetch + upsert. Any failure → return what
  //    we have (empty), letting the UI fall back honestly.
  try {
    const token = await mintClientCredentialsToken()
    const outcome = await fetchAlbumTracks(spotifyAlbumId, token.access_token)
    if (!outcome.ok || outcome.tracks.length === 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[hydrate-album-tracks] best-effort fetch did not yield tracks', {
          albumUuid,
          spotifyAlbumId,
          reason: outcome.ok ? 'empty' : outcome.reason,
        })
      }
      return existing
    }
    await upsertAlbumTracks(
      outcome.tracks.map((t) => ({
        album_id: albumUuid,
        provider: 'spotify',
        provider_album_id: spotifyAlbumId,
        provider_track_id: t.id,
        disc_number: t.disc_number,
        track_number: t.track_number,
        name: t.name,
        duration_ms: t.duration_ms,
        explicit: t.explicit,
        preview_url: t.preview_url,
        external_url: t.external_url,
        isrc: t.isrc,
        raw: { spotify: t },
      })),
    )
    // Re-read so the caller gets canonical, ordered rows with ids.
    return await getAlbumTracksByAlbumId(albumUuid)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[hydrate-album-tracks] best-effort hydration failed', {
        albumUuid,
        spotifyAlbumId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
    return existing
  }
}
