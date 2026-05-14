'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'

const PUBLIC_PATHS = ['/onboarding', '/auth', '/share']

const DEV_MODE = process.env.NODE_ENV === 'development'

/**
 * ProtectedLayout — Auth-aware route guard.
 *
 * Decision matrix:
 *   a. authLoading === true                → show loading state
 *   b. pathname starts with PUBLIC_PATHS   → allow
 *   c. isAuthenticated === false           → redirect to /onboarding
 *   d. isAuthenticated === true            → allow
 *
 * The Supabase session is the sole gate.
 * localStorage flags are no longer sufficient to grant access.
 * A 3-second timeout prevents an infinite loading state in edge cases.
 */
export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [status, setStatus] = useState<'loading' | 'allowed' | 'redirecting'>('loading')
  const [debugStep, setDebugStep] = useState('initializing')

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setStatus(prev => {
        if (prev === 'loading') {
          console.warn('[ProtectedLayout] timeout hit — forcing allow')
          return 'allowed'
        }
        return prev
      })
    }, 3000)

    // b. Public paths always pass through
    if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
      setDebugStep('public path — allowed')
      setStatus('allowed')
      clearTimeout(timeoutId)
      return
    }

    // a. Auth still resolving — hold in loading state; timeout is the safety net
    if (authLoading) {
      setDebugStep('auth loading…')
      return () => clearTimeout(timeoutId)
    }

    // c. No authenticated session — localStorage alone is not sufficient
    if (!isAuthenticated) {
      setDebugStep('not authenticated — redirecting to /onboarding')
      setStatus('redirecting')
      router.replace('/onboarding')
      clearTimeout(timeoutId)
      return
    }

    // d. Authenticated — allow through
    setDebugStep('authenticated — allowed')
    setStatus('allowed')
    clearTimeout(timeoutId)
    return () => clearTimeout(timeoutId)
  }, [pathname, router, authLoading, isAuthenticated])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-4 border border-tobacco/30 rounded-full animate-pulse" />
          <p className="text-xs text-muted-foreground/50 uppercase tracking-widest mb-2">
            LongPlay
          </p>
          {DEV_MODE && (
            <p className="text-[10px] text-tobacco/50 tracking-wider">
              {debugStep}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (status === 'redirecting') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Redirecting to onboarding...</p>
          {DEV_MODE && (
            <p className="text-[10px] text-tobacco/50 tracking-wider mt-2">{debugStep}</p>
          )}
        </div>
      </div>
    )
  }

  return <>{children}</>
}
