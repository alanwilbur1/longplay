'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { isOnboardingCompleted } from '@/lib/onboarding-state'
import { getMyMemberships } from '@/lib/actions/membership'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * AuthDebugStrip — dev-only fixed overlay showing live auth/routing state.
 * Mounted in app/layout.tsx, gated behind NODE_ENV === 'development'.
 * Never renders in production.
 */
export function AuthDebugStrip() {
  const pathname = usePathname()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const [onboardingLS, setOnboardingLS] = useState<boolean | null>(null)
  const [membershipCount, setMembershipCount] = useState<number | null>(null)
  const [roomsSrc, setRoomsSrc] = useState<'db' | 'static' | '…'>('…')

  // Poll localStorage once per second so the strip reflects manual edits in DevTools
  useEffect(() => {
    const check = () => setOnboardingLS(isOnboardingCompleted())
    check()
    const id = setInterval(check, 1000)
    return () => clearInterval(id)
  }, [])

  // Probe Supabase directly (public anon read) to determine rooms source.
  // Rooms use a public-read RLS policy, so this works regardless of auth state.
  // Must NOT use auth state as a proxy — unauthenticated users still get DB rooms.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .then(({ count, error }) => {
        setRoomsSrc(!error && (count ?? 0) > 0 ? 'db' : 'static')
      })
      .catch(() => setRoomsSrc('static'))
  }, [])

  // Load membership count (authenticated users only)
  useEffect(() => {
    if (!isAuthenticated) {
      setMembershipCount(null)
      return
    }
    getMyMemberships()
      .then(m => setMembershipCount(m.length))
      .catch(() => setMembershipCount(null))
  }, [isAuthenticated])

  // Must stay in sync with PUBLIC_PATHS in components/protected-layout.tsx
  const PUBLIC_PATHS = ['/onboarding', '/auth', '/share', '/rooms']
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
    ['rooms src', roomsSrc],
    ['fallback', roomsSrc === '…' ? '…' : roomsSrc === 'static' ? 'active' : 'inactive'],
    ['memberships', membershipCount === null ? '—' : String(membershipCount)],
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
