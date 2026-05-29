import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getProvider } from '@/lib/streaming'
import { decryptToken, encryptToken } from '@/lib/streaming/token-crypto'

/**
 * lib/streaming/access-token.ts — Phase 6B.4A
 *
 * Mint a fresh, short-lived Spotify access token for one user, on
 * demand, for the in-room Web Playback SDK. This is the ONLY safe
 * path that hands a token toward the browser:
 *
 *   - Refresh tokens NEVER leave the server. We decrypt them here,
 *     exchange for a fresh access token if the current one is near
 *     expiry, re-encrypt + persist, and return only the access token.
 *   - All reads/writes use the admin client because
 *     listening_connections has no browser GRANT (it holds tokens).
 *
 * Distinct from lib/streaming/sync.ts: that path runs the full sync
 * pipeline. This one does the minimum — load, maybe-refresh, return —
 * so the /api/spotify/playback-token route stays fast and the SDK's
 * getOAuthToken callback can call it repeatedly.
 */

// Refresh slightly ahead of expiry so the token the browser receives
// has comfortable runway for an SDK session. Mirrors sync.ts's buffer.
const REFRESH_BUFFER_MS = 60_000

interface ConnectionRow {
  id: string
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  token_expires_at: string | null
  scopes: string[] | null
  status: string
}

// The generated Supabase Database types don't model listening_connections
// (it's outside the typed public surface), so the query builder collapses
// to `never` for writes. The rest of the streaming layer (sync.ts, the
// OAuth callback) hits the same edge; we cast the write chain to a minimal
// shape — same posture as the SELECT cast below — rather than fight the
// generated types.
type UpdateBuilder = {
  update: (values: Record<string, unknown>) => {
    eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>
  }
}

export type SpotifyAccessTokenResult =
  | {
      status: 'ok'
      accessToken: string
      expiresAt: string | null
      scopes: string[]
    }
  | { status: 'not_connected' }
  | { status: 'reauth_required' }
  | { status: 'error'; message: string }

/**
 * Resolve a usable Spotify access token for `userId`, refreshing if
 * needed. Returns a discriminated result the caller maps to UI:
 *   not_connected   → no active Spotify connection row
 *   reauth_required → token expired with no refresh token, or refresh
 *                     failed (the connection is marked reauth_required)
 *   ok              → fresh access token + granted scopes
 */
export async function getFreshSpotifyAccessToken(
  userId: string,
): Promise<SpotifyAccessTokenResult> {
  if (!userId) return { status: 'not_connected' }
  const admin = getSupabaseAdminClient()

  type Builder = {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: ConnectionRow | null
            error: { message: string } | null
          }>
        }
      }
    }
  }

  const { data: row, error } = await (
    admin.from('listening_connections') as unknown as Builder
  )
    .select(
      'id, access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes, status',
    )
    .eq('user_id', userId)
    .eq('source_id', 'spotify')
    .maybeSingle()

  if (error) {
    return { status: 'error', message: error.message }
  }
  if (!row) return { status: 'not_connected' }
  if (row.status === 'revoked') return { status: 'not_connected' }

  let accessToken: string
  let refreshTokenPlain: string | null
  try {
    accessToken = decryptToken(row.access_token_encrypted) ?? ''
    refreshTokenPlain = decryptToken(row.refresh_token_encrypted)
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
  }

  const expiresAtMs = row.token_expires_at
    ? new Date(row.token_expires_at).getTime()
    : 0
  const nearExpiry = !expiresAtMs || expiresAtMs - Date.now() < REFRESH_BUFFER_MS

  let scopes = row.scopes ?? []
  let expiresAt = row.token_expires_at

  if (nearExpiry || row.status === 'reauth_required') {
    if (!refreshTokenPlain) {
      await markReauthRequired(row.id, 'no refresh_token; reauth required')
      return { status: 'reauth_required' }
    }
    try {
      const refreshed = await getProvider('spotify').refreshTokens({
        refreshToken: refreshTokenPlain,
      })
      accessToken = refreshed.access_token
      expiresAt = refreshed.expires_at
      if (refreshed.scopes.length > 0) scopes = refreshed.scopes

      const tokenUpdate: Record<string, unknown> = {
        access_token_encrypted: encryptToken(refreshed.access_token),
        token_expires_at: refreshed.expires_at,
        // A successful refresh clears any prior reauth_required state.
        status: 'active',
        last_error: null,
      }
      if (refreshed.refresh_token) {
        tokenUpdate.refresh_token_encrypted = encryptToken(refreshed.refresh_token)
      }
      if (refreshed.scopes.length > 0) tokenUpdate.scopes = refreshed.scopes

      await (
        admin.from('listening_connections') as unknown as UpdateBuilder
      )
        .update(tokenUpdate)
        .eq('id', row.id)
    } catch (err) {
      await markReauthRequired(
        row.id,
        err instanceof Error ? err.message : String(err),
      )
      return { status: 'reauth_required' }
    }
  }

  if (!accessToken) return { status: 'reauth_required' }
  return { status: 'ok', accessToken, expiresAt, scopes }
}

async function markReauthRequired(connectionId: string, message: string) {
  try {
    const admin = getSupabaseAdminClient()
    await (
      admin.from('listening_connections') as unknown as UpdateBuilder
    )
      .update({ status: 'reauth_required', last_error: message.slice(0, 300) })
      .eq('id', connectionId)
  } catch {
    // Best-effort; never throw out of the token path.
  }
}

/**
 * Fetch the account's `product` ('premium' | 'free' | 'open') from
 * Spotify /me. Requires the `user-read-private` scope. Returns null
 * on any failure — the caller treats unknown product as non-premium
 * and shows the open-in-Spotify fallback rather than guessing.
 */
export async function fetchSpotifyProduct(
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { product?: string }
    return typeof body.product === 'string' ? body.product : null
  } catch {
    return null
  }
}
