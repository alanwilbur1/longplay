'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { isOnboardingCompleted } from '@/lib/onboarding-state'

// Pages that don't require onboarding
const PUBLIC_PATHS = ['/onboarding']

/**
 * ProtectedLayout - Wraps pages that require completed onboarding
 * 
 * Redirects to /onboarding if onboarding hasn't been completed.
 * Shows a minimal loading state during the check.
 */
export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<'loading' | 'allowed' | 'redirecting'>('loading')

  useEffect(() => {
    // Skip check for public paths
    if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
      setStatus('allowed')
      return
    }

    // Check if onboarding is completed
    const completed = isOnboardingCompleted()
    
    if (!completed) {
      setStatus('redirecting')
      router.replace('/onboarding')
    } else {
      setStatus('allowed')
    }
  }, [pathname, router])

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-4 border border-tobacco/30 rounded-full animate-pulse" />
          <p className="text-xs text-muted-foreground/50 uppercase tracking-widest">
            LongPlay
          </p>
        </div>
      </div>
    )
  }

  // Show nothing while redirecting
  if (status === 'redirecting') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Redirecting to onboarding...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
