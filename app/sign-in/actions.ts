'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getOnboardingStatus } from '@/lib/actions/onboarding'

/**
 * Two server actions for the email-OTP sign-in flow.
 *
 * No magic links, no external browser handoff. The listener types their
 * email, receives an 8-digit code, and types it back. Pending email is
 * kept in a short-lived httpOnly cookie so step 2 doesn't need the
 * address back in the URL.
 */

const PENDING_COOKIE = 'longplay_pending_signin'
const PENDING_MAX_AGE_SECONDS = 60 * 60 // matches Supabase otp_expiry

function isProd() {
  return process.env.NODE_ENV === 'production'
}

async function setPendingEmail(email: string, next: string) {
  const jar = await cookies()
  jar.set({
    name: PENDING_COOKIE,
    value: JSON.stringify({ email, next }),
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_MAX_AGE_SECONDS,
  })
}

async function clearPendingEmail() {
  const jar = await cookies()
  jar.set({
    name: PENDING_COOKIE,
    value: '',
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function readPendingSignIn(): Promise<{
  email: string
  next: string
} | null> {
  const jar = await cookies()
  const raw = jar.get(PENDING_COOKIE)?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { email?: string; next?: string }
    if (!parsed.email) return null
    return { email: parsed.email, next: parsed.next ?? '/' }
  } catch {
    return null
  }
}

/**
 * Step 1 — listener submits an email. We ask Supabase to email an OTP
 * code (no `emailRedirectTo` so no clickable link is sent).
 */
export async function requestCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const next = String(formData.get('next') ?? '/')

  if (!email || !email.includes('@')) {
    redirect(`/sign-in?error=invalid_email&next=${encodeURIComponent(next)}`)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // emailRedirectTo is intentionally omitted — Supabase will email
      // the OTP code only, no clickable link.
    },
  })

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[sign-in/requestCode] signInWithOtp failed', {
        email,
        status: error.status,
        code: error.code,
        message: error.message,
      })
    }
    redirect(`/sign-in?error=send_failed&next=${encodeURIComponent(next)}`)
  }

  await setPendingEmail(email, next)
  redirect('/sign-in')
}

/**
 * Step 2 — listener types the 8-digit code. We call verifyOtp which
 * sets the session cookie via @supabase/ssr, then route them based on
 * whether they have completed onboarding.
 */
export async function verifyCode(formData: FormData) {
  const tokenRaw = String(formData.get('code') ?? '').trim()
  // Accept any pasted format — strip whitespace and dashes
  const token = tokenRaw.replace(/[\s-]/g, '')

  if (!/^\d{6,10}$/.test(token)) {
    redirect('/sign-in?error=invalid_code')
  }

  const pending = await readPendingSignIn()
  if (!pending) {
    redirect('/sign-in?error=expired')
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({
    email: pending.email,
    token,
    type: 'email',
  })

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[sign-in/verifyCode] verifyOtp failed', {
        email: pending.email,
        tokenLength: token.length,
        tokenPreview: `${token.slice(0, 2)}…${token.slice(-2)}`,
        status: error.status,
        code: error.code,
        message: error.message,
      })
    }
    redirect('/sign-in?error=verify_failed')
  }

  await clearPendingEmail()

  // Route based on profile state. New users (just created by verifyOtp +
  // handle_new_user trigger) have onboarding_completed=false → onboarding.
  // Returning users skip straight to ?next= or /. Uses the canonical
  // helper so the routing logic is shared with the rest of the app.
  const status = await getOnboardingStatus()
  if (!status.authenticated) {
    redirect('/sign-in?error=session_lost')
  }
  if (status.onboardingCompleted) {
    redirect(pending.next || '/')
  }
  redirect('/onboarding')
}

/**
 * Escape hatch — clear the pending cookie and go back to email entry.
 * Wired to the "Use a different email" link on the code-entry screen.
 */
export async function cancelPendingSignIn() {
  await clearPendingEmail()
  redirect('/sign-in')
}

/**
 * Resend the code to the same pending email. Reuses requestCode without
 * making the listener retype the address.
 */
export async function resendCode() {
  const pending = await readPendingSignIn()
  if (!pending) redirect('/sign-in')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: pending.email,
    options: { shouldCreateUser: true },
  })

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[sign-in/resendCode] signInWithOtp failed', {
        email: pending.email,
        status: error.status,
        code: error.code,
        message: error.message,
      })
    }
    redirect('/sign-in?error=send_failed')
  }

  // Refresh the cookie's TTL so the listener has another full hour.
  await setPendingEmail(pending.email, pending.next)
  redirect('/sign-in?resent=1')
}
