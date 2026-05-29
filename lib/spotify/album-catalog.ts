/**
 * lib/spotify/album-catalog.ts — Phase 6B.4D
 *
 * Token-backed Spotify catalog calls used by the album-id resolver:
 *   - getAlbumById  → GET /v1/albums/{id}        (validate an id)
 *   - searchAlbums  → GET /v1/search?type=album  (find by artist+title)
 *
 * Thin and best-effort: failures are reported as tagged statuses, not
 * thrown (the resolver decides what an unreachable catalog means). The
 * pure resolution logic lives in lib/spotify/album-id-resolver.ts; this
 * module only provides the `CatalogDeps` the resolver consumes.
 *
 * NOTE on token tier: /v1/albums/{id} and /v1/search are catalog
 * endpoints. A client-credentials token usually serves them, but
 * Spotify's edge occasionally 403s catalog calls (see the 6A.12 notes
 * in lib/streaming/spotify-tracks.ts). The resolver treats 401/403/429
 * as "unreachable, do not overwrite" rather than "invalid".
 */

import type { CatalogDeps, SearchResultAlbum } from './album-id-resolver'

const API_BASE = 'https://api.spotify.com/v1'

interface SpotifyAlbumObject {
  id?: string
  name?: string
  artists?: Array<{ name?: string }>
}

function primaryArtist(a: SpotifyAlbumObject | undefined): string {
  return a?.artists?.[0]?.name ?? ''
}

/**
 * Build the CatalogDeps the resolver needs from a bearer access token
 * (client-credentials or user token both work).
 */
export function makeCatalogDeps(accessToken: string): CatalogDeps {
  const auth = { Authorization: `Bearer ${accessToken}` }

  return {
    async getAlbumById(id: string) {
      try {
        const res = await fetch(`${API_BASE}/albums/${encodeURIComponent(id)}`, {
          headers: auth,
          cache: 'no-store',
        })
        if (!res.ok) return { ok: false as const, status: res.status }
        const body = (await res.json()) as SpotifyAlbumObject
        return {
          ok: true as const,
          name: body.name ?? '',
          artist: primaryArtist(body),
        }
      } catch {
        return { ok: false as const, status: null }
      }
    },

    async searchAlbums(artist: string, title: string) {
      // Field filters make the match tighter than a free-text query.
      const q = `album:${title} artist:${artist}`
      const url = `${API_BASE}/search?type=album&limit=10&q=${encodeURIComponent(q)}`
      try {
        const res = await fetch(url, { headers: auth, cache: 'no-store' })
        if (!res.ok) {
          // Surface as empty; resolver's searchUnreachable path is only
          // taken when this throws, so for a non-ok we throw to signal
          // "could not search" distinctly from "searched, found nothing".
          throw new Error(`search failed: ${res.status}`)
        }
        const body = (await res.json()) as {
          albums?: { items?: SpotifyAlbumObject[] }
        }
        const items = body.albums?.items ?? []
        const out: SearchResultAlbum[] = []
        for (const it of items) {
          if (!it?.id || !it?.name) continue
          out.push({ id: it.id, name: it.name, artist: primaryArtist(it) })
        }
        return out
      } catch (err) {
        // Re-throw so the resolver can distinguish unreachable search
        // from an empty result set.
        throw err instanceof Error ? err : new Error('search failed')
      }
    },
  }
}
