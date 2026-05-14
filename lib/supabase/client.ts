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
          // Use implicit flow so signInWithOtp sends a numeric OTP code,
          // not a PKCE magic link. The @supabase/ssr default is 'pkce',
          // which causes email OTP calls to fall back to link mode.
          flowType: 'implicit',
          // Do not attempt to parse a session from the URL — there is no
          // callback redirect in the OTP flow.
          detectSessionInUrl: false,
        },
      }
    )
  }
  return client
}
