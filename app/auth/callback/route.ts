import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    console.error('[auth/callback] No code param in request')
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code)

  if (sessionError || !sessionData.user) {
    console.error('[auth/callback] exchangeCodeForSession failed:', sessionError?.message)
    return NextResponse.redirect(`${origin}/auth/error`)
  }

  const user = sessionData.user
  console.log('[auth/callback] session established for user:', user.id, user.email)

  // ── Guarantee user_profile exists ─────────────────────────────────────────
  // The on_auth_user_created trigger should handle this, but we defensively
  // upsert here via the admin client (bypasses RLS) so the profile always
  // exists when the user lands in the app. ignoreDuplicates: true means this
  // is a safe no-op if the trigger already created the row.
  try {
    const admin = getSupabaseAdminClient()

    const displayName =
      user.user_metadata?.name ??
      user.user_metadata?.full_name ??
      user.email?.split('@')[0] ??
      'Listener'

    const { error: profileError } = await admin
      .from('user_profiles')
      .upsert(
        { id: user.id, display_name: displayName },
        { onConflict: 'id', ignoreDuplicates: true }
      )

    if (profileError) {
      // Non-fatal: user is authenticated. Profile creation will be retried
      // on next visit via OnboardingSync.
      console.warn('[auth/callback] profile upsert warning (non-fatal):', {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
      })
    } else {
      console.log('[auth/callback] profile upsert OK for user:', user.id)

      // Also seed a starter membership row if not already present
      const { error: membershipError } = await admin
        .from('user_memberships')
        .upsert(
          { user_id: user.id, tier: 'explorer', status: 'free' },
          { onConflict: 'user_id', ignoreDuplicates: true }
        )

      if (membershipError) {
        console.warn('[auth/callback] membership upsert warning:', membershipError.message)
      }
    }
  } catch (err) {
    // Admin client may not be available or tables may not exist yet.
    // Never block the user from being redirected — auth succeeded.
    console.warn('[auth/callback] profile guarantee skipped:', String(err))
  }

  // ── Redirect ───────────────────────────────────────────────────────────────
  const forwardedHost = request.headers.get('x-forwarded-host')
  const isLocalEnv = process.env.NODE_ENV === 'development'

  if (isLocalEnv) {
    return NextResponse.redirect(`${origin}${next}`)
  } else if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`)
  } else {
    return NextResponse.redirect(`${origin}${next}`)
  }
}
