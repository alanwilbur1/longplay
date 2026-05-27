'use client'

import { useState, useTransition } from 'react'
import {
  syncMyConnection,
  type SyncActionResult,
} from '@/lib/actions/streaming'

/**
 * SyncButton — Phase 6A.12 production-safe surface.
 *
 * The "Sync now" control on the Profile screen. Drives the server
 * action through useTransition so the button shows "Syncing…" while
 * pending, then renders an inline success line.
 *
 * In production, the user sees one of:
 *   - "Synced — listening history updated"           (full success)
 *   - "Synced — metadata enrichment continuing"      (Spotify catalog
 *                                                     restricted but
 *                                                     Last.fm carrying)
 *   - the safe error message from toSafeError()      (hard failure)
 *
 * Detailed counters, hydration diagnostics, enrichment lifecycle, and
 * the catalog-restriction internals are rendered ONLY when one of:
 *   - NODE_ENV !== 'production'
 *   - URL contains ?debug=sync
 *   - NEXT_PUBLIC_SHOW_SYNC_DEBUG === '1'
 *
 * IMPORTANT: this component must NOT be unmounted/remounted across
 * sync runs, because the `result` state lives here. The parent
 * (ProfileScreen) gates its loading placeholder on
 * `connections.length === 0` so a SyncButton-triggered refetch does
 * not blow this component away mid-flight.
 *
 * SyncActionResult never carries tokens, scopes, or raw provider
 * response bodies — `toSafeError()` on the server maps internal
 * stages to short, user-safe strings.
 */

function isDebugSurfaceEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  if (process.env.NEXT_PUBLIC_SHOW_SYNC_DEBUG === '1') return true
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('debug') === 'sync') return true
  }
  return false
}

function calmSyncSummary(result: SyncActionResult): string {
  // The user-facing line. Three states, no scary 403, no raw counter
  // tuples. The debug strip carries the gritty stuff for operators.
  const restricted =
    result.spotify_artist_hydration_status === 'restricted' ||
    result.spotify_artist_hydration_status === 'disabled'
  const lastfmHelped = result.counts.lastfm_enrichment_used === 1
  if (restricted && lastfmHelped) {
    return 'Synced — metadata enrichment continuing'
  }
  if (restricted) {
    return 'Synced — listening history updated'
  }
  const plays = result.counts.events_upserted
  const artists = result.counts.artists_upserted
  if (plays > 0 || artists > 0) {
    return `Synced — ${plays} plays, ${artists} artists`
  }
  return 'Synced — listening history updated'
}

export function SyncConnectionButton({
  sourceId,
  onSynced,
}: {
  sourceId: 'spotify' | 'apple_music'
  /** Called after the action resolves so the parent can re-fetch
   *  `listMyConnections()` to refresh the visible last_sync_at. */
  onSynced?: (result: SyncActionResult) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<SyncActionResult | null>(null)
  const showDebug = isDebugSurfaceEnabled()

  // NOTE: no auto-clear timer. Results persist on screen until the
  // next click clears them, so the user (and us) can read the audit
  // strip at leisure.

  const handleClick = () => {
    setResult(null)
    startTransition(async () => {
      const r = await syncMyConnection(sourceId)
      setResult(r)
      onSynced?.(r)
    })
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs text-tobacco hover:text-cream transition-colors disabled:opacity-60 disabled:cursor-progress"
        aria-busy={isPending || undefined}
        aria-live="polite"
      >
        {isPending ? 'Syncing…' : 'Sync now'}
      </button>

      {/* Calm one-line user-facing summary. No 403, no counter soup. */}
      {!isPending && result && result.ok && (
        <span
          data-testid="sync-summary"
          className="text-[10px] text-olive mt-1 max-w-[300px] text-right leading-tight"
        >
          {calmSyncSummary(result)}
          {result.refreshed ? ' • token refreshed' : ''}
        </span>
      )}

      {/* Hard error path — still surfaces a user-readable message
          from toSafeError(). Never includes the raw provider body. */}
      {!isPending && result && !result.ok && result.error && (
        <span
          data-testid="sync-error"
          className="text-[10px] text-burgundy/80 mt-1 max-w-[300px] text-right leading-tight"
        >
          {result.error.message}
        </span>
      )}

      {/* Debug-only surfaces — operators and dev only. Production
          users never see these. */}
      {showDebug && (
        <>
          <span
            data-testid="sync-hydration-strip"
            className="text-[10px] font-mono text-muted-foreground/60 mt-1 max-w-[340px] text-right leading-tight"
          >
            {isPending ? (
              <>hydrate: syncing…</>
            ) : result ? (
              <>
                hydrate:{result.counts.artist_ids_hydrated}/
                {result.counts.artist_ids_collected} •{' '}
                {result.counts.hydration_batches_succeeded}/
                {result.counts.hydration_batches_attempted} batches • status:
                {result.spotify_artist_hydration_status ?? '∅'} • mode:
                {result.spotify_hydration_mode ?? '∅'} • lastfm:
                {result.counts.lastfm_enrichment_used === 1 ? 'yes' : 'no'} •
                top:{result.top_genres_count}
              </>
            ) : (
              <>hydrate: no run yet — click Sync now</>
            )}
          </span>

          {/* The genuine hydration_error path (401/network/parse —
              never catalog 403) stays visible to operators. */}
          {!isPending && result && result.hydration_error && (
            <span className="text-[10px] text-burgundy/80 mt-1 max-w-[300px] text-right leading-tight">
              hydration: {result.hydration_error}
            </span>
          )}

          {/* Enrichment lifecycle — operator audit only. */}
          {!isPending && result && result.enrichment_debug && (
            <>
              <span
                data-testid="enrichment-strip"
                className="text-[10px] font-mono text-muted-foreground/60 mt-1 max-w-[340px] text-right leading-tight"
              >
                enrich seeds:{result.enrichment_debug.seeds_built} • enq:
                {result.enrichment_debug.enqueue.inserted}new/
                {result.enrichment_debug.enqueue.existed}exist
                {result.enrichment_debug.enqueue.failed > 0
                  ? ` ${result.enrichment_debug.enqueue.failed}fail`
                  : ''}{' '}
                • run:{result.enrichment_debug.round.run} (
                {result.enrichment_debug.round.succeeded}✓
                {result.enrichment_debug.round.failed}✗) +g:
                {result.enrichment_debug.round.canonical_genres_added}
              </span>
              <span
                data-testid="enrichment-strip-2"
                className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 max-w-[340px] text-right leading-tight"
              >
                cand:{result.enrichment_debug.round.queued} sel:
                {result.enrichment_debug.round.selected} skip[bo:
                {result.enrichment_debug.round.skipped_backoff} ca:
                {result.enrichment_debug.round.skipped_cached} if:
                {result.enrichment_debug.round.skipped_inflight}] • prov:
                {result.enrichment_debug.round.provider_resolved ?? '∅'}
                {result.enrichment_debug.round.rate_limited ? ' • rl' : ''}
                {result.enrichment_debug.post_recompute_triggered ? ' • snap↻' : ''}
              </span>
              {result.enrichment_debug.enqueue.first_error && (
                <span className="text-[10px] text-burgundy/80 mt-1 max-w-[340px] text-right leading-tight">
                  enq err: {result.enrichment_debug.enqueue.first_error}
                </span>
              )}
              {result.enrichment_debug.round.db_error && (
                <span className="text-[10px] text-burgundy/80 mt-1 max-w-[340px] text-right leading-tight">
                  round db err: {result.enrichment_debug.round.db_error}
                </span>
              )}
              {result.enrichment_debug.round.last_error && (
                <span className="text-[10px] text-burgundy/80 mt-1 max-w-[340px] text-right leading-tight">
                  round err: {result.enrichment_debug.round.last_error}
                </span>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
