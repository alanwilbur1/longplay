import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  getFreshSpotifyAccessToken,
  fetchSpotifyProduct,
} from '@/lib/streaming/access-token'
import { missingPlaybackScopes } from '@/lib/streaming/playback-scopes'
import { isPremiumProduct } from '@/lib/spotify/playback-state'

/**
 * GET /api/spotify/playback-token — Phase 6B.4A
 *
 * Mints a short-lived Spotify access token for the authenticated
 * listener's in-room Web Playback SDK session, plus the gating signal
 * the player surface needs to choose between playback and a fallback.
 *
 * Security:
 *   - Authenticated via the user-scoped Supabase server client (cookie
 *     session). No session → not_authenticated, no token.
 *   - The refresh token NEVER leaves the server; getFreshSpotifyAccessToken
 *     decrypts + refreshes server-side and returns only the access token.
 *   - The access token is short-lived and the listener's OWN token —
 *     exactly what the Spotify SDK getOAuthToken callback consumes.
 *   - Never cached (force-dynamic + no-store).
 *
 * Response (discriminated on `status`):
 *   not_authenticated | not_connected | reauth_required |
 *   missing_scopes { missing[] } | error { message } |
 *   ok { accessToken, expiresAt, product, premium, scopes }
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return noStore({ status: 'not_authenticated' as const }, 401)
  }

  const result = await getFreshSpotifyAccessToken(user.id)

  if (result.status === 'not_connected') {
    return noStore({ status: 'not_connected' as const })
  }
  if (result.status === 'reauth_required') {
    return noStore({ status: 'reauth_required' as const })
  }
  if (result.status === 'error') {
    return noStore({ status: 'error' as const, message: result.message }, 500)
  }

  // status === 'ok' — check the playback scope gap before handing the
  // token to a player that can't use it. Accounts connected before
  // 6B.4A lack the playback scopes and must reconnect.
  const missing = missingPlaybackScopes(result.scopes)
  if (missing.length > 0) {
    return noStore({ status: 'missing_scopes' as const, missing })
  }

  const product = await fetchSpotifyProduct(result.accessToken)
  return noStore({
    status: 'ok' as const,
    accessToken: result.accessToken,
    expiresAt: result.expiresAt,
    product,
    premium: isPremiumProduct(product),
    scopes: result.scopes,
  })
}

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
