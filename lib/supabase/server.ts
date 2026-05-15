import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // ── SameSite=None; Secure ─────────────────────────────────────────────
      // The app runs in an iframe (worf.replit.dev) embedded in the Replit
      // workspace (replit.com). These are different eTLD+1 domains, so the
      // browser treats every request from the iframe as cross-site.
      //
      // Browsers do NOT send SameSite=Lax cookies with cross-site POST
      // requests. Next.js server actions are invoked via POST, so a Lax
      // cookie is stripped before it reaches the server — `cookies()` sees
      // nothing and auth.getUser() returns null in ~3 ms.
      //
      // SameSite=None; Secure bypasses this restriction. The Replit dev proxy
      // and all deployed targets are HTTPS, so `secure: true` is always met.
      cookieOptions: {
        path: '/',
        sameSite: 'none' as const,
        secure: true,
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
