import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'
import { getSupabaseCookieOptions } from './cookie-options'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Cookie attributes are environment-scoped — see lib/supabase/cookie-options.ts.
      // Replit → SameSite=None;Secure (cross-site POST support for server actions)
      // Production/Vercel → SameSite=Lax;Secure (stricter default)
      cookieOptions: getSupabaseCookieOptions(),
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
