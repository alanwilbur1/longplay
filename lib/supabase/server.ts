import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // ── Cookie options ────────────────────────────────────────────────────
      // sameSite: 'lax' is critical for the PKCE magic-link flow.
      //
      // The auth flow is:
      //   email click → supabase.co/verify → 302 redirect → /auth/callback
      //
      // That final redirect is a cross-site top-level navigation. Browsers
      // only attach cookies with SameSite=Lax (or None) on such navigations.
      // SameSite=Strict would drop the code_verifier cookie entirely, causing
      // exchangeCodeForSession to fail with "Auth session missing".
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // In Server Components, cookies can only be written inside
            // Server Actions or Route Handlers. This catch is intentional.
          }
        },
      },
    }
  )
}
