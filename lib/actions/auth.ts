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

export async function sendMagicLink(
  email: string,
  options?: { redirectTo?: string }
): Promise<{ success: boolean; error?: string }> {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' }
  }

  const supabase = await createSupabaseServerClient()
  const siteUrl = await getSiteUrl()

  const next = options?.redirectTo ?? '/'
  const emailRedirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
    },
  })

  if (error) {
    console.error('[auth] sendMagicLink error:', error.message)
    return { success: false, error: error.message }
  }

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
