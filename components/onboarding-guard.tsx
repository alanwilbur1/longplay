'use client'

import { useState, useEffect } from 'react'

/**
 * @deprecated The proxy (`proxy.ts`) is the only authoritative gate.
 * Onboarding-completion routing happens inside server actions
 * (`verifyCode` after sign-in) and on the relevant pages — not from a
 * localStorage flag read on the client.
 *
 * Reduced to a pass-through so existing imports compile. Do not
 * reintroduce client-side onboarding gating from localStorage; it
 * conflicts with the Supabase session and produces false-positive
 * "signed in" states.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

/** @deprecated Returns `{ completed: false, isLoading: false }` always. */
export function useOnboardingStatus() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(true)
  }, [])
  return { completed: false as const, isLoading: !ready }
}
