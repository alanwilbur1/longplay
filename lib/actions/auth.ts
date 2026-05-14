'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

// ---------------------------------------------------------------------------
// ensureUserProfile
// Called from the browser-side callback page after a session is established.
// Uses the admin client so it bypasses RLS.
// ---------------------------------------------------------------------------
export async function ensureUserProfile(
  userId: string,
  email: string,
  metadata: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = getSupabaseAdminClient()

    const displayName =
      (metadata?.name as string | undefined) ??
      (metadata?.full_name as string | undefined) ??
      email?.split('@')[0] ??
      'Listener'

    const { error: profileError } = await admin
      .from('user_profiles')
      .upsert(
        { id: userId, display_name: displayName },
        { onConflict: 'id', ignoreDuplicates: true }
      )

    if (profileError) {
      console.error('[ensureUserProfile] profile upsert failed:', profileError.message)
    } else {
      console.log('[ensureUserProfile] profile OK:', userId)
    }

    const { error: membershipError } = await admin
      .from('user_memberships')
      .upsert(
        { user_id: userId, tier: 'explorer', status: 'free' },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )

    if (membershipError) {
      console.error('[ensureUserProfile] membership upsert failed:', membershipError.message)
    }

    return { success: !profileError }
  } catch (err) {
    console.error('[ensureUserProfile] exception:', String(err))
    return { success: false, error: String(err) }
  }
}

// ---------------------------------------------------------------------------
// signOut
// ---------------------------------------------------------------------------
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/')
}

// ---------------------------------------------------------------------------
// getServerUser
// ---------------------------------------------------------------------------
export async function getServerUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

// ---------------------------------------------------------------------------
// getUserProfile
// Returns the user_profiles row + membership tier for the current session.
// Uses the server client (reads session from cookies set by @supabase/ssr).
// ---------------------------------------------------------------------------
export async function getUserProfile(): Promise<{
  id: string
  display_name: string | null
  onboarding_completed: boolean
  preferences: Record<string, unknown> | null
  created_at: string
  membership_tier: string | null
} | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const [{ data: profile, error: profileError }, { data: membership }] =
      await Promise.all([
        supabase
          .from('user_profiles')
          .select('id, display_name, onboarding_completed, preferences, created_at')
          .eq('id', user.id)
          .single(),
        supabase
          .from('user_memberships')
          .select('tier')
          .eq('user_id', user.id)
          .single(),
      ])

    if (profileError) {
      console.error('[getUserProfile] error:', profileError.message)
      return null
    }

    return {
      ...profile,
      membership_tier: membership?.tier ?? null,
    }
  } catch (err) {
    console.error('[getUserProfile] exception:', String(err))
    return null
  }
}
