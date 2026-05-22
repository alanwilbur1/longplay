/**
 * lib/streaming/provider.ts
 *
 * Provider abstraction. New streaming sources implement this interface
 * and register themselves in lib/streaming/index.ts. Nothing else in
 * the app should know which provider it's talking to.
 */

import type {
  ConnectionTokens,
  SourceCapabilities,
  SourceId,
  SyncResult,
} from './types'

export interface StreamingProvider {
  readonly id: SourceId
  readonly displayName: string
  readonly capabilities: SourceCapabilities

  /**
   * Build the URL the listener should be redirected to in order to
   * grant access. `state` is the opaque CSRF token the platform
   * generates and the callback re-verifies.
   */
  buildAuthorizeUrl(params: { state: string; redirectUri: string }): string

  /**
   * Exchange the OAuth `code` for tokens. Called from the platform's
   * OAuth callback route handler.
   */
  exchangeCode(params: {
    code: string
    redirectUri: string
  }): Promise<ConnectionTokens>

  /**
   * Refresh an expired access token. Called by the sync worker before
   * making API calls if the connection is near expiry.
   */
  refreshTokens(params: {
    refreshToken: string
  }): Promise<ConnectionTokens>

  /**
   * Pull a normalized snapshot from the provider. The sync worker
   * persists the returned data to listening_events + favorite_*.
   *
   * Implementations should be defensive: missing capabilities return
   * empty arrays for that data type rather than throwing.
   */
  sync(params: { accessToken: string }): Promise<SyncResult>
}
