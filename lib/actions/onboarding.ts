'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface OnboardingPersistPayload {
  archetype?: string
  primaryRoomSlug?: string
  connectedServices?: string[]
  calibrationAnswers?: Record<string, string[]>
}

export async function saveOnboardingCompletion(
  payload: OnboardingPersistPayload
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    // Not authenticated — nothing to persist server-side.
    // localStorage will remain the source of truth for this session.
    return { success: false, skipped: true, error: 'Not authenticated' }
  }

  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
      primary_streaming_service:
        (payload.connectedServices?.[0] as 'spotify' | 'apple-music' | 'tidal' | undefined) ??
        null,
      preferences: {
        archetype: payload.archetype ?? null,
        primaryRoomSlug: payload.primaryRoomSlug ?? null,
        calibrationAnswers: payload.calibrationAnswers ?? {},
      },
    })
    .eq('id', user.id)

  if (profileError) {
    console.error('[onboarding] Failed to update user_profile:', profileError)
    return { success: false, error: profileError.message }
  }

  return { success: true }
}

export async function getOnboardingStatus(): Promise<{
  authenticated: boolean
  onboardingCompleted: boolean
}> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { authenticated: false, onboardingCompleted: false }
  }

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle()

  if (error && process.env.NODE_ENV !== 'production') {
    console.warn('[getOnboardingStatus] profile read failed', {
      code: error.code,
      message: error.message,
    })
  }

  return {
    authenticated: true,
    onboardingCompleted: profile?.onboarding_completed ?? false,
  }
}
