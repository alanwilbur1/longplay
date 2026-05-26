import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getProvider, isSourceId, type SourceId } from '@/lib/streaming'
import { syncProviderForUser } from '@/lib/streaming/sync'
import { encryptToken } from '@/lib/streaming/token-crypto'
import { consumeOauthStateCookie } from '@/lib/actions/streaming'

/**
 * OAuth callback for streaming providers.
 *
 * Route: /api/integrations/<source>/callback?code=…&state=…
 *
 * Flow:
 *   1. Verify the state cookie (CSRF + user binding + returnTo).
 *   2. Verify the URL `state` matches.
 *   3. Verify the URL source segment matches the cookie's sourceId.
 *   4. Exchange the OAuth code for tokens via the provider.
 *   5. Upsert into listening_connections using the ADMIN client
 *      (service role) — listening_connections has no client INSERT
 *      grant because the row holds tokens.
 *   6. Redirect back to wherever the listener started the connect
 *      (cookie's returnTo, defaulting to /profile).
 */

function paramsFromRequest(request: NextRequest) {
  const u = new URL(request.url)
  return {
    code: u.searchParams.get('code'),
    state: u.searchParams.get('state'),
    error: u.searchParams.get('error'),
  }
}

function redirectBack(
  request: NextRequest,
  returnTo: string,
  params: Record<string, string>,
) {
  const safe =
    returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/profile'
  const url = new URL(safe, request.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ source: string }> },
) {
  const { source } = await context.params

  // Pre-cookie failures: we don't know where the listener started.
  // Default to /profile.
  if (!isSourceId(source)) {
    return redirectBack(request, '/profile', { connection_error: 'unknown_source' })
  }

  const { code, state, error: providerError } = paramsFromRequest(request)

  if (providerError) {
    return redirectBack(request, '/profile', { connection_error: providerError })
  }
  if (!code || !state) {
    return redirectBack(request, '/profile', {
      connection_error: 'missing_code_or_state',
    })
  }

  const cookieState = await consumeOauthStateCookie()
  if (!cookieState) {
    return redirectBack(request, '/profile', { connection_error: 'state_expired' })
  }
  if (cookieState.state !== state) {
    return redirectBack(request, cookieState.returnTo, {
      connection_error: 'state_mismatch',
    })
  }
  if (cookieState.sourceId !== (source as SourceId)) {
    return redirectBack(request, cookieState.returnTo, {
      connection_error: 'source_mismatch',
    })
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
    return redirectBack(request, cookieState.returnTo, {
      connection_error: 'exchange_failed',
    })
  }

  // Persist via admin (service role) — listening_connections has no
  // client INSERT/UPDATE grant by design (rows hold OAuth tokens).
  // Token columns are AES-256-GCM encrypted at the app boundary; see
  // lib/streaming/token-crypto.ts. Encrypt failures (missing key,
  // wrong key length) throw — we catch into connection_error so the
  // listener gets a redirect with a diagnosable reason rather than a
  // 500.
  const admin = getSupabaseAdminClient()
  let accessTokenEncrypted: string
  let refreshTokenEncrypted: string | null
  try {
    accessTokenEncrypted = encryptToken(tokens.access_token)
    refreshTokenEncrypted = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : null
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[oauth-callback] token encryption failed', {
        source,
        message: err instanceof Error ? err.message : String(err),
      })
    }
    return redirectBack(request, cookieState.returnTo, {
      connection_error: 'encryption_unavailable',
    })
  }

  const { error: upsertError } = await admin
    .from('listening_connections')
    .upsert(
      {
        user_id: cookieState.userId,
        source_id: source,
        external_account_id: tokens.external_account_id,
        display_name: tokens.display_name,
        scopes: tokens.scopes,
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
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
    return redirectBack(request, cookieState.returnTo, {
      connection_error: 'persist_failed',
    })
  }

  // Best-effort initial sync. Spotify's recently-played + top-* +
  // saved-albums APIs each return up to 50 items, so total ingest fits
  // well under any reasonable timeout. Errors here never block the
  // redirect — the listener can hit "Sync now" from /profile.
  try {
    await syncProviderForUser(cookieState.userId, source as SourceId)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[oauth-callback] initial sync failed', {
        source,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return redirectBack(request, cookieState.returnTo, {
    connection: 'connected',
    source,
  })
}
