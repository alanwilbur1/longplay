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

/**
 * Helper read for /profile and other surfaces. Returns the listener's
 * connections without exposing the encrypted token columns.
 */
export async function listMyConnections(): Promise<
  Array<{
    source_id: SourceId
    external_account_id: string | null
    display_name: string | null
    status: string
    connected_at: string
    last_sync_at: string | null
  }>
> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('listening_connections')
    .select(
      'source_id, external_account_id, display_name, status, connected_at, last_sync_at',
    )
    .eq('user_id', user.id)

  if (error || !data) return []
  return data as unknown as Array<{
    source_id: SourceId
    external_account_id: string | null
    display_name: string | null
    status: string
    connected_at: string
    last_sync_at: string | null
  }>
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
