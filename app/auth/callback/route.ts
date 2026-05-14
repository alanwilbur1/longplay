import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  // ── Log all params for debugging (safe — no raw tokens logged) ────────────
  const paramKeys = [...searchParams.keys()]
  const next = searchParams.get('next') ?? '/'
  console.log('[auth/callback] received params:', {
    keys: paramKeys,
    hasCode: searchParams.has('code'),
    hasTokenHash: searchParams.has('token_hash'),
    type: searchParams.get('type'),
    next,
    origin,
  })

  // ── Determine which Supabase auth flow is being used ─────────────────────
  //
  // Magic-link / OTP flow  → token_hash + type=email   (most common)
  // PKCE / OAuth flow      → code                       (OAuth providers)
  //
  // The two flows MUST be handled differently. Using exchangeCodeForSession
  // on a token_hash URL (or vice-versa) will always fail.

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')

  if (!tokenHash && !code) {
    console.error('[auth/callback] No token_hash or code in URL. Params were:', paramKeys)
    return NextResponse.redirect(`${origin}/auth/error?reason=no_token`)
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

  let user = null

  // ── Path A: Magic-link / Email OTP (token_hash + type) ───────────────────
  if (tokenHash && type) {
    console.log('[auth/callback] using verifyOtp flow (token_hash + type)')
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })

    if (error || !data.user) {
      console.error('[auth/callback] verifyOtp failed:', error?.message, error?.status)
      return NextResponse.redirect(`${origin}/auth/error?reason=otp_failed`)
    }

    user = data.user
    console.log('[auth/callback] verifyOtp OK — user:', user.id, user.email)
  }

  // ── Path B: PKCE / OAuth (code) ───────────────────────────────────────────
  else if (code) {
    console.log('[auth/callback] using exchangeCodeForSession flow (code)')
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.user) {
      console.error('[auth/callback] exchangeCodeForSession failed:', error?.message)
      return NextResponse.redirect(`${origin}/auth/error?reason=code_failed`)
    }

    user = data.user
    console.log('[auth/callback] exchangeCodeForSession OK — user:', user.id, user.email)
  }

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/error?reason=no_user`)
  }

  // ── Guarantee user_profile exists (admin client bypasses RLS) ─────────────
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
      console.warn('[auth/callback] profile upsert (non-fatal):', {
        code: profileError.code,
        message: profileError.message,
        hint: profileError.hint,
      })
    } else {
      console.log('[auth/callback] profile upsert OK for:', user.id)

      // Seed starter membership if missing
      const { error: membershipError } = await admin
        .from('user_memberships')
        .upsert(
          { user_id: user.id, tier: 'explorer', status: 'free' },
          { onConflict: 'user_id', ignoreDuplicates: true }
        )

      if (membershipError) {
        console.warn('[auth/callback] membership upsert (non-fatal):', membershipError.message)
      }
    }
  } catch (err) {
    // Tables may not exist yet — never block the redirect.
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
