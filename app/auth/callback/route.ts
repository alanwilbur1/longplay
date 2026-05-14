import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  // ── Log every URL param (safe — token values are not printed, only keys) ──
  const paramKeys = [...searchParams.keys()]
  const next = searchParams.get('next') ?? '/'
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')

  console.log('[auth/callback] ── incoming request ──────────────────────────')
  console.log('[auth/callback] origin:', origin)
  console.log('[auth/callback] param keys:', paramKeys)
  console.log('[auth/callback] has code:', !!code)
  console.log('[auth/callback] has token_hash:', !!tokenHash)
  console.log('[auth/callback] type:', type ?? '(none)')
  console.log('[auth/callback] next:', next)

  // ── Build the Supabase server client ──────────────────────────────────────
  // Must use the same cookieOptions as the server client in lib/supabase/server.ts
  // (sameSite: 'lax') so that the code_verifier cookie survives the cross-site
  // redirect chain: email → supabase.co → 302 → this callback.
  const cookieStore = await cookies()
  const cookieNames = cookieStore.getAll().map(c => c.name)
  console.log('[auth/callback] cookies present:', cookieNames)

  const hasCodeVerifier = cookieNames.some(
    n => n.includes('code-verifier') || n.includes('pkce')
  )
  console.log('[auth/callback] has PKCE code-verifier cookie:', hasCodeVerifier)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // ── Guard: must have at least one token form ───────────────────────────────
  if (!tokenHash && !code) {
    console.error('[auth/callback] no token_hash or code — params were:', paramKeys)
    return NextResponse.redirect(
      `${origin}/auth/error?reason=no_token&mode=none&params=${encodeURIComponent(paramKeys.join(','))}`
    )
  }

  let user = null
  let detectedMode = 'unknown'

  // ── Path A: Magic-link / Email OTP ────────────────────────────────────────
  //    Supabase sends: token_hash + type=email
  if (tokenHash && type) {
    detectedMode = 'otp'
    console.log('[auth/callback] → Path A: verifyOtp (token_hash + type)')

    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })

    if (error || !data.user) {
      const msg = error?.message ?? 'unknown error'
      console.error('[auth/callback] verifyOtp FAILED:', {
        message: msg,
        status: error?.status,
        name: error?.name,
      })
      return NextResponse.redirect(
        `${origin}/auth/error?reason=otp_failed&mode=otp&msg=${encodeURIComponent(msg)}`
      )
    }

    user = data.user
    console.log('[auth/callback] verifyOtp OK — user:', user.id, user.email)
  }

  // ── Path B: PKCE code exchange ────────────────────────────────────────────
  //    Supabase sends: code  (requires code_verifier cookie from signInWithOtp)
  else if (code) {
    detectedMode = 'pkce'
    console.log('[auth/callback] → Path B: exchangeCodeForSession (code)')
    console.log('[auth/callback] code-verifier cookie present:', hasCodeVerifier)

    if (!hasCodeVerifier) {
      console.warn(
        '[auth/callback] WARNING: no code-verifier cookie found — ' +
        'this likely means the PKCE verifier was dropped in transit ' +
        '(cross-site redirect with SameSite=Strict). ' +
        'Ensure lib/supabase/server.ts uses cookieOptions.sameSite = "lax".'
      )
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.user) {
      const msg = error?.message ?? 'unknown error'
      console.error('[auth/callback] exchangeCodeForSession FAILED:', {
        message: msg,
        status: error?.status,
        name: error?.name,
        hadCodeVerifier: hasCodeVerifier,
      })
      return NextResponse.redirect(
        `${origin}/auth/error?reason=code_failed&mode=pkce&msg=${encodeURIComponent(msg)}&had_verifier=${hasCodeVerifier}`
      )
    }

    user = data.user
    console.log('[auth/callback] exchangeCodeForSession OK — user:', user.id, user.email)
  }

  if (!user) {
    return NextResponse.redirect(`${origin}/auth/error?reason=no_user&mode=${detectedMode}`)
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
      console.log('[auth/callback] profile upsert OK:', user.id)

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
    console.warn('[auth/callback] profile guarantee skipped (tables may not exist):', String(err))
  }

  console.log('[auth/callback] ── redirecting to:', next, '─────────────────')

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
