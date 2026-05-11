'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { isOnboardingCompleted } from '@/lib/onboarding-state'

/**
 * OnboardingGuard - Redirects users to onboarding if not completed
 * 
 * Wrap this around pages that require onboarding to be completed.
 * The onboarding page itself should NOT use this guard.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isChecking, setIsChecking] = useState(true)
  const [isAllowed, setIsAllowed] = useState(false)

  useEffect(() => {
    // Skip check on onboarding page
    if (pathname === '/onboarding') {
      setIsAllowed(true)
      setIsChecking(false)
      return
    }

    const completed = isOnboardingCompleted()
    
    if (!completed) {
      router.replace('/onboarding')
    } else {
      setIsAllowed(true)
    }
    
    setIsChecking(false)
  }, [pathname, router])

  // Show nothing while checking (prevents flash)
  if (isChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border border-tobacco/30 rounded-full animate-pulse" />
      </div>
    )
  }

  // Show nothing if redirecting
  if (!isAllowed) {
    return null
  }

  return <>{children}</>
}

/**
 * Hook to check onboarding status
 */
export function useOnboardingStatus() {
  const [completed, setCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    setCompleted(isOnboardingCompleted())
  }, [])

  return { completed, isLoading: completed === null }
}
