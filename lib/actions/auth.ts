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
