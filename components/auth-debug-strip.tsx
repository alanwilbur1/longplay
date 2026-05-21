'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { getOnboardingStatus } from '@/lib/actions/onboarding'
import { getMyMemberships } from '@/lib/actions/membership'
import { listMyMoments } from '@/lib/actions/moments'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * AuthDebugStrip — dev-only fixed overlay showing live auth state.
 * Mounted in app/layout.tsx, gated behind NODE_ENV === 'development'.
 * Never renders in production.
 *
 * Identity rule: shows the Supabase session and the DB profile state.
 * Does NOT surface localStorage flags as if they're meaningful identity
 * signals. localStorage is not an identity source.
 */
export function AuthDebugStrip() {
  const pathname = usePathname()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const [onboardingDb, setOnboardingDb] = useState<boolean | null>(null)
  const [membershipCount, setMembershipCount] = useState<number | null>(null)
  const [momentsCount, setMomentsCount] = useState<number | null>(null)
  const [roomsSrc, setRoomsSrc] = useState<'db' | 'static' | '…'>('…')

  // Probe Supabase directly (public anon read) to determine rooms source.
  // Rooms use a public-read RLS policy, so this works regardless of auth.
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

  // DB-backed onboarding state (authenticated users only).
  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      setOnboardingDb(null)
      return
    }
    getOnboardingStatus()
      .then(s => setOnboardingDb(s.authenticated ? s.onboardingCompleted : null))
      .catch(() => setOnboardingDb(null))
  }, [authLoading, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) {
      setMembershipCount(null)
      return
    }
    getMyMemberships()
      .then(m => setMembershipCount(m.length))
      .catch(() => setMembershipCount(null))
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) {
      setMomentsCount(null)
      return
    }
    listMyMoments({ limit: 200 })
      .then(r => setMomentsCount(r.data?.length ?? 0))
      .catch(() => setMomentsCount(null))
  }, [isAuthenticated])

  const uid = user?.id
  const uidDisplay = uid ? `${uid.slice(0, 8)}…${uid.slice(-4)}` : '—'

  const rows: [string, string][] = [
    ['route', pathname],
    ['authLoading', String(authLoading)],
    ['authenticated', String(isAuthenticated)],
    ['user.id', uidDisplay],
    ['email', user?.email ?? '—'],
    [
      'onboarding DB',
      onboardingDb === null
        ? authLoading || isAuthenticated
          ? '…'
          : 'n/a (signed out)'
        : String(onboardingDb),
    ],
    ['rooms src', roomsSrc],
    ['memberships', membershipCount === null ? '—' : String(membershipCount)],
    ['my moments', momentsCount === null ? '—' : String(momentsCount)],
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
