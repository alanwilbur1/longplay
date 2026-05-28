/**
 * lib/spotify-url.ts — Phase 6B.4 hotfix
 *
 * Pure URL helpers extracted from components/ritual/listening-surface.tsx
 * so that server components can import them without crossing a
 * 'use client' boundary.
 *
 * BACKGROUND
 * ──────────
 * Next.js App Router special-cases imports from 'use client' modules:
 * a Server Component that imports a NAMED export from a client module
 * receives a Server Reference proxy, not the original function. That
 * works fine when the export is a React component (renders client-
 * side); it explodes at SSR when the export is a plain function the
 * server is meant to call. The build succeeds (tsc + next build pass
 * static analysis) but the route hard-crashes on first request:
 * `TypeError: <function> is not a function`.
 *
 * extractSpotifyAlbumId is called by ritual-context-panel-server.tsx
 * (server) to derive an album ID before threading it into the client
 * ListeningSurface. Living inside a 'use client' module was a runtime
 * trap. This module has no React, no DOM, no client tag — both server
 * and client can import it freely.
 */

/**
 * Extract the Spotify album ID from a streaming URL.
 *
 *   https://open.spotify.com/album/5vkqYmiPBYLaalcmjujWxK?si=...
 *     → '5vkqYmiPBYLaalcmjujWxK'
 *
 * Returns null for non-album URLs, missing input, or unparseable
 * shapes. Spotify IDs are 22-character base62; we accept the broader
 * [A-Za-z0-9]+ regex because the URL won't ever contain other
 * characters in the album-id slot anyway.
 */
export function extractSpotifyAlbumId(
  url: string | null | undefined,
): string | null {
  if (!url) return null
  const m = url.match(/spotify\.com\/(?:embed\/)?album\/([A-Za-z0-9]+)/i)
  if (!m) return null
  return m[1]
}
