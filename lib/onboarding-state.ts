/**
 * LongPlay Onboarding State Management
 * 
 * Temporary localStorage-based state persistence for prototype testing.
 * In production, this would be stored in the database with user auth.
 */

const ONBOARDING_KEY = 'longplay_onboarding'

export interface OnboardingState {
  completed: boolean
  completedAt?: string
  currentStep?: string
  connectedServices?: string[]
  calibrationAnswers?: Record<string, string[]>
  archetype?: string
  tastePortrait?: string
}

const DEFAULT_STATE: OnboardingState = {
  completed: false,
}

/**
 * Get the current onboarding state from localStorage
 */
export function getOnboardingState(): OnboardingState {
  if (typeof window === 'undefined') {
    return DEFAULT_STATE
  }
  
  try {
    const stored = localStorage.getItem(ONBOARDING_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to read onboarding state:', e)
  }
  
  return DEFAULT_STATE
}

/**
 * Save onboarding state to localStorage
 */
export function saveOnboardingState(state: Partial<OnboardingState>): void {
  if (typeof window === 'undefined') return
  
  try {
    const current = getOnboardingState()
    const updated = { ...current, ...state }
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(updated))
  } catch (e) {
    console.error('Failed to save onboarding state:', e)
  }
}

/**
 * Mark onboarding as complete
 */
export function completeOnboarding(data?: Partial<OnboardingState>): void {
  saveOnboardingState({
    ...data,
    completed: true,
    completedAt: new Date().toISOString(),
  })
}

/**
 * Reset onboarding state (for testing)
 */
export function resetOnboarding(): void {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem(ONBOARDING_KEY)
  } catch (e) {
    console.error('Failed to reset onboarding state:', e)
  }
}

/**
 * Check if onboarding is completed
 */
export function isOnboardingCompleted(): boolean {
  return getOnboardingState().completed
}
