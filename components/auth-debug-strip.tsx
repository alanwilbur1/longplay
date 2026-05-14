'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { isOnboardingCompleted } from '@/lib/onboarding-state'

/**
 * AuthDebugStrip — dev-only fixed overlay showing live auth/routing state.
 * Mounted in app/layout.tsx, gated behind NODE_ENV === 'development'.
 * Never renders in production.
 */
export function AuthDebugStrip() {
  const pathname = usePathname()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const [onboardingLS, setOnboardingLS] = useState<boolean | null>(null)

  // Poll localStorage once per second so the strip reflects manual edits in DevTools
  useEffect(() => {
    const check = () => setOnboardingLS(isOnboardingCompleted())
    check()
    const id = setInterval(check, 1000)
    return () => clearInterval(id)
  }, [])

  // Replicate ProtectedLayout decision matrix client-side
  const PUBLIC_PATHS = ['/onboarding', '/auth', '/share']
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  const guardDecision = isPublic
    ? 'public — allow'
    : authLoading
    ? 'loading…'
    : isAuthenticated
    ? 'authenticated — allow'
    : 'not authenticated → /onboarding'

  const uid = user?.id
  const uidDisplay = uid ? `${uid.slice(0, 8)}…${uid.slice(-4)}` : '—'

  const rows: [string, string][] = [
    ['route', pathname],
    ['authLoading', String(authLoading)],
    ['authenticated', String(isAuthenticated)],
    ['user.id', uidDisplay],
    ['email', user?.email ?? '—'],
    ['onboarding LS', onboardingLS === null ? '…' : String(onboardingLS)],
    ['guard decision', guardDecision],
    ['demo mode', String(!isAuthenticated)],
  ]

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-card/80 border border-border/20 px-3 py-2 font-mono text-[10px] text-tobacco/60 space-y-0.5 backdrop-blur-sm pointer-events-none">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-2">
          <span className="text-muted-foreground/50 shrink-0 w-28">{label}</span>
          <span className="text-tobacco/80 break-all">{value}</span>
        </div>
      ))}
    </div>
  )
}
