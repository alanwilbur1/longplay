'use server'

import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getProvider, isSourceId, type SourceId } from '@/lib/streaming'

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
