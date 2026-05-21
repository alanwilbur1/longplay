import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getProvider, isSourceId, type SourceId } from '@/lib/streaming'
import { consumeOauthStateCookie } from '@/lib/actions/streaming'

/**
 * OAuth callback for streaming providers.
 *
 * Route: /api/integrations/<source>/callback?code=…&state=…
 *
 * Flow:
 *   1. Verify the state cookie (CSRF + user binding).
 *   2. Verify the URL `state` matches.
 *   3. Verify the URL source segment matches the cookie's sourceId.
 *   4. Exchange the OAuth code for tokens via the provider.
 *   5. Upsert into listening_connections using the ADMIN client
 *      (service role) — listening_connections has no client INSERT
 *      grant because the row holds tokens.
 *   6. Redirect to /profile with status feedback.
 *
 * Token storage:
 *   For Phase 4.1 we persist tokens as-is into the *_encrypted columns.
 *   The columns are NAMED encrypted to signal intent, but actual
 *   encryption at rest is a Phase 4.1.x follow-up — RLS already
 *   prevents any client read of these columns (no SELECT grant on
 *   token columns from authenticated; service role only). Adding
 *   pgcrypto-symmetric encryption is a non-breaking column-value
 *   swap when we want defense-in-depth.
 */

function paramsFromRequest(request: NextRequest) {
  const u = new URL(request.url)
  return {
    code: u.searchParams.get('code'),
    state: u.searchParams.get('state'),
    error: u.searchParams.get('error'),
  }
}

function redirectToProfile(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/profile', request.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ source: string }> },
) {
  const { source } = await context.params

  if (!isSourceId(source)) {
    return redirectToProfile(request, { connection_error: 'unknown_source' })
  }

  const { code, state, error: providerError } = paramsFromRequest(request)

  if (providerError) {
    return redirectToProfile(request, { connection_error: providerError })
  }
  if (!code || !state) {
    return redirectToProfile(request, { connection_error: 'missing_code_or_state' })
  }

  const cookieState = await consumeOauthStateCookie()
  if (!cookieState) {
    return redirectToProfile(request, { connection_error: 'state_expired' })
  }
  if (cookieState.state !== state) {
    return redirectToProfile(request, { connection_error: 'state_mismatch' })
  }
  if (cookieState.sourceId !== (source as SourceId)) {
    return redirectToProfile(request, { connection_error: 'source_mismatch' })
  }

  const provider = getProvider(source as SourceId)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin
  const redirectUri = `${siteUrl.replace(/\/$/, '')}/api/integrations/${source}/callback`

  let tokens
  try {
    tokens = await provider.exchangeCode({ code, redirectUri })
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[oauth-callback] exchangeCode failed', {
        source,
        message: err instanceof Error ? err.message : String(err),
      })
    }
    return redirectToProfile(request, { connection_error: 'exchange_failed' })
  }

  // Persist via admin (service role) — see file header for rationale.
  const admin = getSupabaseAdminClient()
  const { error: upsertError } = await admin
    .from('listening_connections')
    .upsert(
      {
        user_id: cookieState.userId,
        source_id: source,
        external_account_id: tokens.external_account_id,
        display_name: tokens.display_name,
        scopes: tokens.scopes,
        access_token_encrypted: tokens.access_token,
        refresh_token_encrypted: tokens.refresh_token,
        token_expires_at: tokens.expires_at,
        status: 'active',
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: 'user_id,source_id' },
    )

  if (upsertError) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[oauth-callback] connection upsert failed', {
        source,
        code: upsertError.code,
        message: upsertError.message,
      })
    }
    return redirectToProfile(request, { connection_error: 'persist_failed' })
  }

  return redirectToProfile(request, { connection: 'connected', source })
}
