'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

async function getSiteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  const headersList = await headers()
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost:5000'
  const proto = headersList.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
}

function friendlyAuthError(message: string): string {
  // Map raw Supabase/Postgres error strings to actionable messages.
  const msg = message.toLowerCase()

  if (msg.includes('database error saving new user')) {
    return (
      'Supabase could not create your account. ' +
      'This is usually caused by a missing database table or trigger. ' +
      'Ask the developer to apply lib/schema-patch.sql in the Supabase SQL editor.'
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
): Promise<{ success: boolean; error?: string; rawError?: string }> {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' }
  }

  const supabase = await createSupabaseServerClient()
  const siteUrl = await getSiteUrl()

  const next = options?.redirectTo ?? '/'
  const emailRedirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`

  console.log('[auth/sendMagicLink] attempting OTP for:', email, '→', emailRedirectTo)

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
      raw: JSON.stringify(error),
    })
    return {
      success: false,
      error: friendlyAuthError(error.message),
      rawError: error.message,
    }
  }

  console.log('[auth/sendMagicLink] OTP sent successfully to:', email)
  return { success: true }
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
