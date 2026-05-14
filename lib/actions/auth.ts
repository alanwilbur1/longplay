'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

// ---------------------------------------------------------------------------
// Derive the canonical public URL for this deployment.
// Priority: explicit env var > Vercel system vars > request headers.
// The result is used as the base for emailRedirectTo.
// ---------------------------------------------------------------------------
async function getSiteUrl(): Promise<string> {
  // Explicitly set — highest priority (recommended for production)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }

  // Vercel sets VERCEL_PROJECT_PRODUCTION_URL and VERCEL_URL automatically
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // Fall back to request headers
  const headersList = await headers()
  const host =
    headersList.get('x-forwarded-host') ??
    headersList.get('host') ??
    'localhost:5000'
  const proto = headersList.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
}

function friendlyAuthError(message: string): string {
  const msg = message.toLowerCase()

  if (msg.includes('database error saving new user')) {
    return (
      'Supabase could not create your account (database trigger error). ' +
      'Please apply lib/schema-patch.sql in the Supabase SQL editor and try again.'
    )
  }
  if (msg.includes('email rate limit exceeded') || msg.includes('too many requests')) {
    return 'Too many sign-in attempts. Please wait a few minutes and try again.'
  }
  if (msg.includes('invalid email')) {
    return 'Please enter a valid email address.'
  }
  if (msg.includes('user not found') || msg.includes('no user found')) {
    return 'No account found for this email. Please check the address and try again.'
  }
  if (msg.includes('email not confirmed')) {
    return 'Your email has not been confirmed yet. Check your inbox for a previous sign-in link.'
  }
  return message
}

export async function sendMagicLink(
  email: string,
  options?: { redirectTo?: string }
): Promise<{ success: boolean; error?: string; rawError?: string; redirectUsed?: string }> {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' }
  }

  const supabase = await createSupabaseServerClient()
  const siteUrl = await getSiteUrl()

  // The emailRedirectTo URL must be listed in Supabase → Auth → URL Configuration
  // → Redirect URLs. Add: https://your-domain.com/auth/callback
  // Use a wildcard like https://your-domain.com/** to cover all variants.
  const emailRedirectTo = `${siteUrl}/auth/callback`

  console.log('[auth/sendMagicLink] email:', email, '| redirectTo:', emailRedirectTo)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
    },
  })

  if (error) {
    console.error('[auth/sendMagicLink] FAILED:', {
      message: error.message,
      status: error.status,
      name: error.name,
    })
    return {
      success: false,
      error: friendlyAuthError(error.message),
      rawError: error.message,
    }
  }

  console.log('[auth/sendMagicLink] OTP sent OK to:', email, '| redirectTo was:', emailRedirectTo)
  return { success: true, redirectUsed: emailRedirectTo }
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/')
}

export async function getServerUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}
