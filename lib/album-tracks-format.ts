/**
 * lib/album-tracks-format.ts — Phase 6B.5
 *
 * Pure utility — no DB, no React, no `'server-only'` tag. Lives at
 * the lib root so the test script (which runs under tsx outside the
 * Next bundler) can import it without dragging in the
 * `'server-only'`-tagged data module.
 *
 * lib/data/album-tracks.ts re-exports from here; production callers
 * may import from either location.
 */

/**
 * Format a millisecond duration as a compact display string.
 *
 *   null / invalid    → null  (caller renders no duration column)
 *   < 1 hour          → "M:SS"   (e.g. "3:21")
 *   ≥ 1 hour          → "H:MM:SS" (e.g. "1:02:15")
 *
 * Pure of React, pure of localization. Tabular-num typography on
 * the rendering side keeps the columns aligned.
 */
export function formatTrackDuration(
  ms: number | null | undefined,
): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
