'use server'

import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getProvider, isSourceId, type SourceId } from '@/lib/streaming'
import { syncProviderForUser, type SyncOutcome } from '@/lib/streaming/sync'

/**
 * Streaming connection server actions.
 *
 * Phase 4.1:
 *   - initiateConnection(sourceId): redirects the listener to the
 *     provider's authorize URL with a CSRF-bound state cookie.
 *   - disconnectConnection(sourceId): deletes the row (RLS allows
 *     self-DELETE on listening_connections).
 *
 * Token writes happen in the OAuth callback route handler, which uses
 * the admin client (service role) because listening_connections has no
 * INSERT/UPDATE grant for authenticated users — by design, since the
 * row holds OAuth tokens.
 */

const STATE_COOKIE = 'lp_oauth_state'
const STATE_TTL_SECONDS = 10 * 60 // 10 minutes

function isProd() {
  return process.env.NODE_ENV === 'production'
}

function callbackUrl(sourceId: SourceId): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/api/integrations/${sourceId}/callback`
}

/**
 * Step 1 — listener clicks "Connect Spotify". We mint a CSRF state,
 * stash it in an httpOnly cookie that also encodes the source id +
 * authed user id + a returnTo path (so the callback can route them
 * back to wherever they started — typically /onboarding or /profile).
 */
export async function initiateConnection(formData: FormData) {
  const rawSource = String(formData.get('source') ?? '').toLowerCase()
  if (!isSourceId(rawSource)) {
    redirect('/profile?error=unknown_source')
  }
  const sourceId = rawSource as SourceId

  // Whitelist returnTo to first-party paths to avoid open-redirect.
  const rawReturnTo = String(formData.get('returnTo') ?? '/profile')
  const returnTo =
    rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
      ? rawReturnTo
      : '/profile'

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`)
  }

  const state = randomBytes(16).toString('hex')
  const jar = await cookies()
  jar.set({
    name: STATE_COOKIE,
    value: JSON.stringify({ state, sourceId, userId: user!.id, returnTo }),
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  })

  const provider = getProvider(sourceId)
  const authorizeUrl = provider.buildAuthorizeUrl({
    state,
    redirectUri: callbackUrl(sourceId),
  })

  redirect(authorizeUrl)
}

/**
 * Step 3 — listener disconnects a provider from their account. Removes
 * the listening_connections row (RLS allows self-DELETE). The OAuth
 * tokens are wiped with it.
 */
export async function disconnectConnection(formData: FormData) {
  const rawSource = String(formData.get('source') ?? '').toLowerCase()
  if (!isSourceId(rawSource)) {
    redirect('/profile?error=unknown_source')
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/sign-in?next=/profile')
  }

  const { error } = await supabase
    .from('listening_connections')
    .delete()
    .eq('user_id', user!.id)
    .eq('source_id', rawSource)

  if (error && process.env.NODE_ENV !== 'production') {
    console.warn('[streaming/disconnectConnection] delete failed', {
      sourceId: rawSource,
      code: error.code,
      message: error.message,
    })
  }

  redirect('/profile?connection=disconnected')
}

export interface ListMyConnectionsResult {
  rows: Array<{
    id: string
    source_id: SourceId
    external_account_id: string | null
    display_name: string | null
    status: string
    connected_at: string
    last_sync_at: string | null
  }>
  error: { code: string | null; message: string } | null
  /** Diagnostic only: which authenticated user id the query ran as.
   *  null when no session existed at read time. */
  queriedAs: string | null
}

/**
 * Helper read for /profile and other surfaces. Returns the listener's
 * connections without exposing the encrypted token columns.
 *
 * Returns BOTH rows and error info so callers can render the real
 * reason an empty list came back (no rows vs missing table vs RLS
 * block). Phase 4.x audit demand: the UI must be able to surface
 * "the connections table does not exist on this DB" rather than
 * silently render "Connect" with no explanation.
 *
 * Defense-in-depth: filter to status='active' server-side. The Profile
 * UI also filters client-side, but the server-side filter means a
 * 'revoked' or 'error' row can never reach a render path that might
 * misread it as connected.
 */
export async function listMyConnections(): Promise<ListMyConnectionsResult> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { rows: [], error: null, queriedAs: null }
  }

  const { data, error } = await supabase
    .from('listening_connections')
    .select(
      'id, source_id, external_account_id, display_name, status, connected_at, last_sync_at',
    )
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[streaming/listMyConnections] read failed', {
        code: error.code,
        message: error.message,
        userId: user.id,
      })
    }
    return {
      rows: [],
      error: { code: error.code ?? null, message: error.message },
      queriedAs: user.id,
    }
  }

  const rows = (data ?? []) as unknown as ListMyConnectionsResult['rows']
  return { rows, error: null, queriedAs: user.id }
}

/**
 * Result returned to the client after a manual "Sync now" click.
 *
 * Safe to expose: never contains tokens, scopes, refresh_token, or
 * raw provider response bodies. Internal error stages are mapped to
 * a coarse `code` + a short, user-readable `message`.
 */
export interface SyncActionResult {
  ok: boolean
  /** ISO timestamp written to listening_connections.last_sync_at on
   *  success. Null on early failures (load/refresh) where we did not
   *  reach the post-sync write. */
  syncedAt: string | null
  counts: {
    events_upserted: number
    artists_upserted: number
    albums_upserted: number
    tracks_upserted: number
    artists_hydrated: number
    genres_distinct: number
    /** Phase 4.4 hydration audit counters — observed from the
     *  provider's /v1/artists?ids= calls BEFORE the upsert. */
    artist_ids_collected: number
    artist_ids_hydrated: number
    artists_with_genres: number
    hydration_batches_attempted: number
    hydration_batches_succeeded: number
    /** Phase 4.4 persistence audit. Counts upserted favorite_artists
     *  rows that carry any enrichment field (genres / popularity /
     *  followers / image_url). A late 429 during single-id fallback
     *  must NEVER drop this to zero when earlier successes existed. */
    partial_hydration_persisted: number
    /** Phase 4.5 enrichment counters. Zero when no external provider
     *  is configured (LASTFM_API_KEY unset) — never blocks sync. */
    enrichment_jobs_queued: number
    enrichment_jobs_run: number
    enrichment_jobs_succeeded: number
    enrichment_jobs_failed: number
    enrichment_genres_added: number
  }
  refreshed: boolean
  /** Whether listening_profile_snapshots recompute landed. */
  snapshot_updated: boolean
  /** Size of snapshot.top_genres after recompute. */
  top_genres_count: number
  /** Safe one-line hydration error, or null. Distinct from `error`
   *  because hydration can fail without failing the sync — the row
   *  upserts still land. */
  hydration_error: string | null
  /** Phase 4.5 — provider(s) the enrichment round used. */
  enrichment_provider: string | null
  /** Phase 4.5 — 'rate_limited' when the round bailed early. */
  enrichment_state: 'rate_limited' | null
  /** Phase 4.5 lifecycle debug. See SyncOutcome.enrichment_debug. */
  enrichment_debug: {
    seeds_built: number
    enqueue: {
      attempted: number
      inserted: number
      existed: number
      failed: number
      first_error: string | null
    }
    round: {
      queued: number
      selected: number
      run: number
      succeeded: number
      failed: number
      skipped_backoff: number
      skipped_cached: number
      skipped_inflight: number
      canonical_genres_added: number
      provider_resolved: 'lastfm' | null
      rate_limited: boolean
      last_error: string | null
      db_error: string | null
    }
    post_recompute_triggered: boolean
  } | null
  /** Null on full success. On failure, a safe code + message — never
   *  the raw provider body. */
  error: { code: string; message: string } | null
}

function emptySyncCounts(): SyncActionResult['counts'] {
  return {
    events_upserted: 0,
    artists_upserted: 0,
    albums_upserted: 0,
    tracks_upserted: 0,
    artists_hydrated: 0,
    genres_distinct: 0,
    artist_ids_collected: 0,
    artist_ids_hydrated: 0,
    artists_with_genres: 0,
    hydration_batches_attempted: 0,
    hydration_batches_succeeded: 0,
    partial_hydration_persisted: 0,
    enrichment_jobs_queued: 0,
    enrichment_jobs_run: 0,
    enrichment_jobs_succeeded: 0,
    enrichment_jobs_failed: 0,
    enrichment_genres_added: 0,
  }
}

/**
 * Map an internal SyncOutcome error to a user-safe shape. Strips any
 * detail beyond the stage name; the full reason (which may include
 * provider response text) stays in listening_connections.last_error
 * server-side. The UI never sees tokens — by construction.
 */
function toSafeError(
  outcome: SyncOutcome,
): { code: string; message: string } | null {
  if (!outcome.error) return null
  const FRIENDLY: Record<string, string> = {
    'load-connection': 'Could not load the connection. Try reconnecting.',
    'connection-status':
      'Connection is not active. Reconnect to refresh authorization.',
    refresh: 'Spotify authorization expired. Reconnect to continue syncing.',
    'refresh-persist': 'Could not save refreshed tokens.',
    sync: 'Spotify API call failed. Please try again in a minute.',
    'favorite_artists-upsert': 'Could not save top artists.',
    'favorite_albums-upsert': 'Could not save saved albums.',
    'favorite_tracks-upsert': 'Could not save top tracks.',
    'listening_events-upsert': 'Could not save recent plays.',
  }
  const message = FRIENDLY[outcome.error.stage] ?? 'Sync failed. Please try again.'
  return { code: outcome.error.stage, message }
}

/**
 * Manually trigger a sync for the listener's active provider
 * connection. Called from a client `useTransition` handler on the
 * Profile "Sync now" button — not a <form action> — so the UI can
 * render pending/success/error states from the returned outcome.
 *
 * Never exposes tokens, scopes, or raw provider payloads.
 *
 * For programmatic use (cron, callback warm-up), call
 * `syncProviderForUser` directly from server code.
 */
export async function syncMyConnection(
  sourceId: string,
): Promise<SyncActionResult> {
  const normalized = String(sourceId ?? '').toLowerCase()
  if (!isSourceId(normalized)) {
    return {
      ok: false,
      syncedAt: null,
      counts: emptySyncCounts(),
      refreshed: false,
      snapshot_updated: false,
      top_genres_count: 0,
      hydration_error: null,
      enrichment_provider: null,
      enrichment_state: null,
      enrichment_debug: null,
      error: { code: 'unknown_source', message: 'Unknown streaming source.' },
    }
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      syncedAt: null,
      counts: emptySyncCounts(),
      refreshed: false,
      snapshot_updated: false,
      top_genres_count: 0,
      hydration_error: null,
      enrichment_provider: null,
      enrichment_state: null,
      enrichment_debug: null,
      error: { code: 'not_authenticated', message: 'Please sign in to sync.' },
    }
  }

  const outcome: SyncOutcome = await syncProviderForUser(
    user.id,
    normalized as SourceId,
    { trigger: 'manual' },
  )
  if (process.env.NODE_ENV !== 'production') {
    console.log('[syncMyConnection] outcome', {
      sourceId: normalized,
      ok: outcome.ok,
      refreshed: outcome.refreshed,
      counts: outcome.counts,
      error: outcome.error,
    })
  }

  // Future-safe: invalidates any server-rendered slice of /profile.
  // The visible "last_sync_at" line lives in a Client Component, so
  // the SyncButton handler also re-fetches `listMyConnections()` to
  // refresh that state immediately.
  revalidatePath('/profile')

  return {
    ok: outcome.ok,
    syncedAt: outcome.last_sync_at,
    counts: outcome.counts,
    refreshed: outcome.refreshed,
    snapshot_updated: outcome.snapshot_updated,
    top_genres_count: outcome.top_genres_count,
    hydration_error: outcome.hydration_error,
    enrichment_provider: outcome.enrichment_provider,
    enrichment_state: outcome.enrichment_state,
    enrichment_debug: outcome.enrichment_debug,
    error: toSafeError(outcome),
  }
}

/** Reads + clears the OAuth state cookie. Used by the callback route. */
export async function consumeOauthStateCookie(): Promise<
  { state: string; sourceId: SourceId; userId: string; returnTo: string } | null
> {
  const jar = await cookies()
  const raw = jar.get(STATE_COOKIE)?.value
  if (!raw) return null
  jar.set({
    name: STATE_COOKIE,
    value: '',
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  try {
    const parsed = JSON.parse(raw) as {
      state?: string
      sourceId?: string
      userId?: string
      returnTo?: string
    }
    if (!parsed.state || !parsed.userId) return null
    if (!parsed.sourceId || !isSourceId(parsed.sourceId)) return null
    const returnTo =
      parsed.returnTo && parsed.returnTo.startsWith('/') && !parsed.returnTo.startsWith('//')
        ? parsed.returnTo
        : '/profile'
    return {
      state: parsed.state,
      sourceId: parsed.sourceId as SourceId,
      userId: parsed.userId,
      returnTo,
    }
  } catch {
    return null
  }
}
