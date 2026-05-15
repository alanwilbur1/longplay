'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

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
        // ── SameSite=None; Secure ─────────────────────────────────────────
        // The Replit workspace embeds the app in an iframe (worf.replit.dev)
        // inside the Replit IDE page (replit.com). These are different eTLD+1
        // domains, so every request from the iframe is cross-site.
        //
        // Browsers strip SameSite=Lax cookies from cross-site POST requests.
        // Next.js server actions are invoked via POST, so Lax cookies never
        // reach the server — cookies() returns empty, auth.getUser() returns
        // null in ~3 ms → "Not authenticated".
        //
        // SameSite=None; Secure is the only combination the browser sends on
        // cross-site POST. Replit's dev proxy and all deployed targets are
        // HTTPS, so Secure is always satisfied.
        cookieOptions: {
          path: '/',
          sameSite: 'none' as const,
          secure: true,
        },
      }
    )

    // ── One-time cookie migration ─────────────────────────────────────────
    // If the user already has a session stored in old SameSite=Lax cookies,
    // those cookies will NOT be sent with server action POSTs even after this
    // code change (the browser stores SameSite as part of the cookie entry).
    // Calling refreshSession() here uses the refresh token from
    // document.cookie (readable regardless of SameSite) and rewrites all
    // auth cookies with the new SameSite=None;Secure options so the server
    // will see them immediately on the next action.
    //
    // sessionStorage ensures this runs at most once per tab.
    if (typeof window !== 'undefined' && !sessionStorage.getItem('__lp_cookie_v2')) {
      sessionStorage.setItem('__lp_cookie_v2', '1')
      const c = client
      c.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          c.auth.refreshSession()
        }
      })
    }
  }
  return client
}
