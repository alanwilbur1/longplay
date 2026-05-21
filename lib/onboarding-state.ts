/**
 * LongPlay onboarding state (localStorage)
 *
 * **Identity rule:** localStorage is NEVER an identity source. The only
 * authoritative answer to "is this listener signed in?" is the Supabase
 * session. The only authoritative answer to "has this listener completed
 * onboarding?" is `user_profiles.onboarding_completed` for the
 * authenticated user.
 *
 * This module is intentionally narrowed to what localStorage may safely
 * hold: an in-progress wizard step + the listener's calibration draft.
 * No `completed` flag. No `archetype` cache. Nothing that another
 * component could mistake for "the listener is logged in."
 *
 * Legacy helpers (`isOnboardingCompleted`, `completeOnboarding`,
 * `resetOnboarding`) are kept as no-ops with deprecation comments so
 * callers compile during the migration; they must NOT be used for
 * gating or rendering decisions.
 */

const ONBOARDING_KEY = 'longplay_onboarding'

export interface OnboardingState {
  currentStep?: string
  connectedServices?: string[]
  calibrationAnswers?: Record<string, string[]>
}

const DEFAULT_STATE: OnboardingState = {}

export function getOnboardingState(): OnboardingState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const stored = localStorage.getItem(ONBOARDING_KEY)
    if (!stored) return DEFAULT_STATE
    const parsed = JSON.parse(stored) as Record<string, unknown>
    // Strip any legacy identity-shaped fields so callers cannot
    // accidentally read them.
    return {
      currentStep: typeof parsed.currentStep === 'string' ? parsed.currentStep : undefined,
      connectedServices: Array.isArray(parsed.connectedServices)
        ? (parsed.connectedServices as string[])
        : undefined,
      calibrationAnswers:
        typeof parsed.calibrationAnswers === 'object' && parsed.calibrationAnswers !== null
          ? (parsed.calibrationAnswers as Record<string, string[]>)
          : undefined,
    }
  } catch {
    return DEFAULT_STATE
  }
}

export function saveOnboardingState(state: Partial<OnboardingState>): void {
  if (typeof window === 'undefined') return
  try {
    const current = getOnboardingState()
    const updated: OnboardingState = {
      currentStep: state.currentStep ?? current.currentStep,
      connectedServices: state.connectedServices ?? current.connectedServices,
      calibrationAnswers: state.calibrationAnswers ?? current.calibrationAnswers,
    }
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(updated))
  } catch {
    // ignore
  }
}

/**
 * @deprecated localStorage is no longer an identity source. This is a
 * no-op. Onboarding completion lives in `user_profiles.onboarding_completed`
 * and is set via `lib/actions/onboarding.ts:saveOnboardingCompletion`.
 */
export function completeOnboarding(_data?: Record<string, unknown>): void {
  // intentional no-op
}

/**
 * @deprecated Always returns `false`. Decisions about "is the listener
 * onboarded?" must read `user_profiles.onboarding_completed` from the
 * authenticated session.
 */
export function isOnboardingCompleted(): boolean {
  return false
}

/**
 * Clears the in-progress wizard state. Safe to call on sign-out.
 */
export function resetOnboarding(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(ONBOARDING_KEY)
  } catch {
    // ignore
  }
}
