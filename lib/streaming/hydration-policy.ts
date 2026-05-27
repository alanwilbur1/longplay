/**
 * lib/streaming/hydration-policy.ts — Phase 6A.12
 *
 * Pure, testable policy for Spotify catalog hydration. Decides:
 *   1. Whether the runtime should attempt hydration at all
 *      (`shouldAttemptHydration`).
 *   2. How to classify the outcome of an attempt
 *      (`classifyHydrationOutcome`).
 *
 * Catalog-restriction reality (production, May 2026):
 *   Spotify's edge has been returning HTTP 403 on /v1/artists?ids=...
 *   and /v1/artists/{id} for our app tier while continuing to allow
 *   /me/* (recently-played, top-artists, top-tracks, saved-albums).
 *   This is a CATALOG access decision — not a token problem, not an
 *   error in our code. The product can run end-to-end on /me/* +
 *   Last.fm enrichment for the genre/identity pipeline.
 *
 *   We model that explicitly here so the rest of the system treats it
 *   as a known degraded state ("restricted") rather than a fatal
 *   error. The UI surfaces a calm "Synced" message; operators still
 *   see the full diagnostic via the debug strip.
 *
 * Env knob:
 *   SPOTIFY_CATALOG_HYDRATION_MODE = 'enabled' | 'auto' | 'disabled'
 *
 *     enabled  — always attempt the batch hydration call.
 *     auto     — (default) attempt; a 403 result is "restricted",
 *                not "error". Last.fm enrichment carries genres.
 *     disabled — skip the hydration call entirely. Reserved for
 *                operators who've confirmed catalog restriction and
 *                want to drop the noise + latency. Sync still
 *                succeeds on the /me/* + Last.fm path.
 */

export type HydrationMode = 'enabled' | 'auto' | 'disabled'

export type HydrationStatus =
  | 'ok'
  | 'restricted'
  | 'rate_limited'
  | 'disabled'
  | 'partial'

/**
 * Parse the env knob. Anything other than the three known values
 * resolves to 'auto' — safest default. Case-insensitive, trimmed.
 */
export function parseHydrationMode(
  raw: string | null | undefined,
): HydrationMode {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'disabled') return 'disabled'
  if (v === 'enabled') return 'enabled'
  return 'auto'
}

/**
 * Should the provider issue a /v1/artists call at all?
 * Only 'disabled' opts out; both 'enabled' and 'auto' attempt.
 */
export function shouldAttemptHydration(mode: HydrationMode): boolean {
  return mode !== 'disabled'
}

/**
 * Classify a finished hydration attempt into a single status word
 * for telemetry. Pure function — easy to unit test.
 *
 * Decision order (first match wins):
 *   skipped=true                          → 'disabled'
 *   rate_limited=true                     → 'rate_limited'
 *   batch 403 + probe 403                 → 'restricted'   (catalog blocked)
 *   batch 403 + fallback fully recovered  → 'ok'           (we got everything anyway)
 *   collected > 0 && hydrated === 0       → 'restricted'   (no rows came through)
 *   hydrated < collected                  → 'partial'      (some came through)
 *   hydrated === collected                → 'ok'
 *   collected === 0                       → 'ok'           (nothing to hydrate)
 */
export function classifyHydrationOutcome(input: {
  mode: HydrationMode
  skipped: boolean
  collected: number
  hydrated: number
  rate_limited: boolean
  last_status: number | null
  probe_single_status: number | null
  fully_recovered_via_fallback: boolean
}): HydrationStatus {
  if (input.skipped) return 'disabled'
  if (input.rate_limited) return 'rate_limited'
  if (input.last_status === 403 && input.probe_single_status === 403) {
    return 'restricted'
  }
  if (input.last_status === 403 && input.fully_recovered_via_fallback) {
    return 'ok'
  }
  if (input.collected === 0) return 'ok'
  if (input.hydrated === 0) {
    // Nothing hydrated AND we tried — treat as restricted regardless of
    // the exact status code. The recommendation pipeline relies on
    // Last.fm here anyway; flagging restricted is honest and stops the
    // UI from screaming.
    return 'restricted'
  }
  if (input.hydrated < input.collected) return 'partial'
  return 'ok'
}

/**
 * Whether the outcome should surface as a user-facing hydration error.
 *
 *   'restricted'  → no (known degraded state, internal diagnostic)
 *   'disabled'    → no (operator-configured skip)
 *   'rate_limited'→ no (transient; Last.fm catches up next sync)
 *   'partial'     → no (some genres landed; Last.fm fills the rest)
 *   'ok'          → no
 *
 * This is what keeps a calm "Synced" line in the production UI
 * instead of a red "403 Forbidden" badge. Operators retain visibility
 * through the audit log counters and the debug-only strip.
 */
export function isUserFacingHydrationError(status: HydrationStatus): boolean {
  // None of the current statuses are user-facing failures. The function
  // exists so future hydration failures (e.g., a hard 401 on /me before
  // recompute would already be a separate code path) can be flagged
  // here without re-wiring callers.
  void status
  return false
}
