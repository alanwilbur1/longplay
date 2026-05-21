'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface OnboardingPersistPayload {
  archetype?: string
  primaryRoomSlug?: string
  connectedServices?: string[]
  calibrationAnswers?: Record<string, string[]>
}

/**
 * Persist onboarding completion to `user_profiles`.
 *
 * Uses UPSERT rather than UPDATE because the row may not exist —
 * `handle_new_user` is deliberately defensive (per schema-patch.sql) and
 * silently logs trigger errors instead of blocking signup. An UPDATE on
 * a non-existent row is a no-op (no error, no rows affected), which
 * previously left `onboarding_completed=false` after every "successful"
 * completion. Upsert with `onConflict: 'id'` either inserts the row or
 * updates it.
 *
 * Only writes columns that exist on user_profiles:
 *   id, onboarding_completed, onboarding_completed_at,
 *   primary_streaming_service, preferences
 * (display_name, avatar_url, notification_settings, created_at,
 *  updated_at — left to defaults / untouched).
 */
export async function saveOnboardingCompletion(
  payload: OnboardingPersistPayload
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  const supabase = await createSupabaseServerClient()
  const isDev = process.env.NODE_ENV !== 'production'

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    if (isDev) {
      console.warn('[onboarding] saveOnboardingCompletion: no authenticated user', {
        authError: authError?.message ?? null,
      })
    }
    return { success: false, skipped: true, error: 'Not authenticated' }
  }

  const updatePayload = {
    id: user.id,
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
  }

  if (isDev) {
    console.log('[onboarding] saveOnboardingCompletion: upserting', {
      authenticatedUserId: user.id,
      payload: {
        onboarding_completed: updatePayload.onboarding_completed,
        onboarding_completed_at: updatePayload.onboarding_completed_at,
        primary_streaming_service: updatePayload.primary_streaming_service,
        // omit full calibration answers from logs
        preferencesKeys: Object.keys(updatePayload.preferences),
      },
    })
  }

  const { data, error: profileError } = await supabase
    .from('user_profiles')
    .upsert(updatePayload, { onConflict: 'id' })
    .select('id, onboarding_completed')
    .maybeSingle()

  if (profileError) {
    console.error('[onboarding] saveOnboardingCompletion: upsert failed', {
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
    })
    return { success: false, error: profileError.message }
  }

  if (!data) {
    // Upsert returned no row — should never happen, but surface it
    // rather than report a false success.
    console.error('[onboarding] saveOnboardingCompletion: upsert returned no row', {
      userId: user.id,
    })
    return { success: false, error: 'No row returned from upsert' }
  }

  if (isDev) {
    console.log('[onboarding] saveOnboardingCompletion: persisted', {
      rowId: data.id,
      onboarding_completed: data.onboarding_completed,
    })
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

