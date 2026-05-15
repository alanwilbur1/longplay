'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'
import { getSupabaseCookieOptions } from './cookie-options'

let client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: {
          // @supabase/ssr v0.10.x hardcodes flowType:'pkce' internally, so
          // this option is effectively ignored — kept for documentation only.
          flowType: 'implicit',
          detectSessionInUrl: false,
        },
        cookieOptions: getSupabaseCookieOptions(),
      }
    )

    // ── One-time SameSite cookie migration ───────────────────────────────────
    // TODO: REMOVE AFTER REPLIT COOKIE MIGRATION IS VERIFIED IN PRODUCTION
    //
    // Users who logged in before the SameSite=None change have existing
    // SameSite=Lax cookies in their browser. Those cookies are readable via
    // document.cookie (SameSite only affects HTTP request forwarding, not
    // JS reads), but the browser strips them from cross-site POST requests
    // (i.e. server actions) so the server sees no session.
    //
    // Calling refreshSession() here uses the refresh token from
    // document.cookie to obtain a new session from Supabase and immediately
    // rewrites all auth cookies with the updated SameSite=None;Secure
    // attributes. The next server-action POST then includes them.
    //
    // sessionStorage gates this to once per browser tab.
    migrateLegacySameSiteCookies(client)
  }
  return client
}

/**
 * Rewrites existing SameSite=Lax Supabase auth cookies to the current
 * cookie policy (SameSite=None;Secure on Replit) by forcing a token
 * refresh. Runs at most once per browser tab via sessionStorage.
 *
 * TODO: REMOVE AFTER REPLIT COOKIE MIGRATION IS VERIFIED IN PRODUCTION
 */
function migrateLegacySameSiteCookies(
  supabase: ReturnType<typeof createBrowserClient<Database>>,
) {
  if (typeof window === 'undefined') return
  if (sessionStorage.getItem('__lp_cookie_v2')) return

  sessionStorage.setItem('__lp_cookie_v2', '1')

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      supabase.auth.refreshSession()
    }
  })
}
