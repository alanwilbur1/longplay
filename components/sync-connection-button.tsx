'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  syncMyConnection,
  type SyncActionResult,
} from '@/lib/actions/streaming'

/**
 * SyncButton — Phase 4.3 audit fix.
 *
 * The "Sync now" control on the Profile screen. Previously this was a
 * <form action={syncMyConnection}> where the action returned void; the
 * user clicked it and saw no change because:
 *   1. There was no pending state.
 *   2. The action's `revalidatePath('/profile')` only invalidates
 *      server-rendered data — but ProfileScreen is a Client Component
 *      that loads connections via `useEffect → listMyConnections()`,
 *      so the visible `last_sync_at` line never refreshed.
 *   3. Any sync error (token expired, Spotify 429, etc.) was logged
 *      server-side and written to listening_connections.last_error,
 *      but never surfaced to the listener.
 *
 * This component fixes all three by:
 *   - Driving the call through `useTransition` so we have a real
 *     pending flag → renders "Syncing…".
 *   - Awaiting the structured `SyncActionResult` and rendering an
 *     inline success or error line under the button.
 *   - Calling the parent-provided `onSynced` after completion so the
 *     parent can re-call `listMyConnections()` and the
 *     "Connected — not yet synced" / "Synced …" line updates without
 *     a hard reload.
 *
 * Security note: SyncActionResult never carries tokens, scopes, or
 * raw provider response bodies — `toSafeError()` in streaming.ts maps
 * internal stages to short, user-safe strings.
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

  // Clear the inline result after 8s so it doesn't linger forever.
  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(() => setResult(null), 8000)
    return () => window.clearTimeout(t)
  }, [result])

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

      {!isPending && result && result.ok && (
        <span className="text-[10px] text-olive mt-1 max-w-[300px] text-right leading-tight">
          Synced — {result.counts.events_upserted} plays,{' '}
          {result.counts.artists_upserted} artists
          {result.refreshed ? ' • token refreshed' : ''}
        </span>
      )}

      {/* Hydration audit strip — visible whenever we have a result,
          successful or not. This is the line that surfaces the Phase
          4.4 bug class: "hydrate:0/47 collected" or "401: The access
          token expired". Always rendered so the user (and we) can
          confirm whether /v1/artists is actually being called. */}
      {!isPending && result && (
        <span className="text-[10px] font-mono text-muted-foreground/60 mt-1 max-w-[320px] text-right leading-tight">
          hydrate:{result.counts.artist_ids_hydrated}/
          {result.counts.artist_ids_collected} collected •{' '}
          {result.counts.hydration_batches_succeeded}/
          {result.counts.hydration_batches_attempted} batches • genres:
          {result.counts.artists_with_genres} • top:
          {result.top_genres_count}
        </span>
      )}

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
