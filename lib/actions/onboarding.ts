'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface OnboardingPersistPayload {
  archetype?: string
  primaryRoomSlug?: string
  connectedServices?: string[]
  calibrationAnswers?: Record<string, string[]>
  /** Optional listener-chosen display name. Wizard doesn't collect one
   *  today; if it ever does, pass it through. Otherwise derived from
   *  email local-part with a "Listener" final fallback. */
  displayName?: string
}

function deriveDisplayName(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0]?.trim()
  if (local && local.length > 0) return local
  return 'Listener'
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
 *   id, display_name, onboarding_completed, onboarding_completed_at,
 *   primary_streaming_service, preferences
 *
 * display_name MUST be supplied — the column is NOT NULL. The DEFAULT
 * 'Listener' only applies when the column is omitted from INSERT, and
 * Supabase's upsert sends the full payload, so an omission would be
 * treated as explicit NULL and reject. We derive from the auth user's
 * email local-part, falling back to 'Listener'.
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

  const displayName = payload.displayName?.trim() || deriveDisplayName(user.email)

  const updatePayload = {
    id: user.id,
    display_name: displayName,
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
        display_name: updatePayload.display_name,
        onboarding_completed: updatePayload.onboarding_completed,
        onboarding_completed_at: updatePayload.onboarding_completed_at,
        primary_streaming_service: updatePayload.primary_streaming_service,
        preferencesKeys: Object.keys(updatePayload.preferences),
      },
    })
  }

  const { data, error: profileError } = await supabase
    .from('user_profiles')
    .upsert(updatePayload, { onConflict: 'id' })
    .select('id, display_name, onboarding_completed')
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
    console.error('[onboarding] saveOnboardingCompletion: upsert returned no row', {
      userId: user.id,
    })
    return { success: false, error: 'No row returned from upsert' }
  }

  if (isDev) {
    console.log('[onboarding] saveOnboardingCompletion: persisted', {
      rowId: data.id,
      display_name: data.display_name,
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

