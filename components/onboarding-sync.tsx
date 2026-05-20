'use client'

/**
 * @deprecated localStorage is no longer permitted to claim onboarding
 * completion, so there is nothing to sync to the database from the
 * client. Onboarding completion is written from server actions
 * (`lib/actions/onboarding.ts:saveOnboardingCompletion`) at the point
 * the listener finishes the wizard.
 *
 * Kept as a no-op so app/layout.tsx doesn't need to be edited.
 */
export function OnboardingSync() {
  return null
}
