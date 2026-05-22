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

      {!isPending && result && !result.ok && result.error && (
        <span className="text-[10px] text-burgundy/80 mt-1 max-w-[300px] text-right leading-tight">
          {result.error.message}
        </span>
      )}
    </div>
  )
}
