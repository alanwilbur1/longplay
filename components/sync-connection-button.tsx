'use client'

import { useState, useTransition } from 'react'
import {
  syncMyConnection,
  type SyncActionResult,
} from '@/lib/actions/streaming'

/**
 * SyncButton — Phase 4.3 / 4.4 audit fix.
 *
 * The "Sync now" control on the Profile screen. Drives the server
 * action through useTransition so the button shows "Syncing…" while
 * pending, then renders an inline success/error line and a permanent
 * hydration audit strip beneath it so we can see why an enrichment
 * sync produced no genres.
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

      {/* TEMPORARY render-path probe. If this string appears beneath
          the Sync now button in the deployed UI, the new
          SyncConnectionButton is rendering. If it does NOT appear,
          the deploy is serving stale bundles and no amount of
          downstream debugging will help. Remove once confirmed. */}
      <span
        data-testid="sync-render-probe"
        className="text-[10px] font-mono text-tobacco/70 mt-1"
      >
        TEST_META_RENDER_ACTIVE
      </span>

      {!isPending && result && result.ok && (
        <span className="text-[10px] text-olive mt-1 max-w-[300px] text-right leading-tight">
          Synced — {result.counts.events_upserted} plays,{' '}
          {result.counts.artists_upserted} artists
          {result.refreshed ? ' • token refreshed' : ''}
        </span>
      )}

      {/* Hydration audit strip — ALWAYS rendered (with placeholder
          before the first click) so the user can confirm the
          component is alive without needing to click first. After a
          click, shows the real counters from SyncActionResult. */}
      <span
        data-testid="sync-hydration-strip"
        className="text-[10px] font-mono text-muted-foreground/60 mt-1 max-w-[320px] text-right leading-tight"
      >
        {isPending ? (
          <>hydrate: syncing…</>
        ) : result ? (
          <>
            hydrate:{result.counts.artist_ids_hydrated}/
            {result.counts.artist_ids_collected} collected •{' '}
            {result.counts.hydration_batches_succeeded}/
            {result.counts.hydration_batches_attempted} batches •
            persisted:{result.counts.partial_hydration_persisted} •
            genres:{result.counts.artists_with_genres} • top:
            {result.top_genres_count}
          </>
        ) : (
          <>hydrate: no run yet — click Sync now</>
        )}
      </span>

      {!isPending && result && result.hydration_error && (
        <span className="text-[10px] text-burgundy/80 mt-1 max-w-[300px] text-right leading-tight">
          hydration: {result.hydration_error}
        </span>
      )}

      {/* Phase 4.5 enrichment lifecycle strip — ALWAYS rendered when
          we have a result, even when nothing happened. The whole
          point is to see where the lifecycle stopped: seeds_built=0
          (Spotify gave us genres for everyone), enqueue.failed>0
          with first_error (table missing → migration not applied),
          round.queued=0 (cache hit), provider_resolved=null (key
          missing), etc. Compact two-line layout. */}
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

      {!isPending && result && !result.ok && result.error && (
        <span className="text-[10px] text-burgundy/80 mt-1 max-w-[300px] text-right leading-tight">
          {result.error.message}
        </span>
      )}
    </div>
  )
}
