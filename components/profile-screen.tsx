'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { resetOnboarding, getOnboardingState } from '@/lib/onboarding-state'
import { useAuth } from '@/components/auth-provider'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getOnboardingStatus } from '@/lib/actions/onboarding'

// Demo fallback — rendered only when no authenticated session exists
const DEMO_USER = {
  name: 'Elena Vasquez',
  handle: '@elenavasquez',
  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
  memberSince: 'March 2023',
  tier: 'LongPlay Member',
  archiveSize: 4237,
  savedMoments: 156,
  isDemo: true as const,
}

type DisplayUser = typeof DEMO_USER | {
  name: string
  handle: string
  avatar: string | null
  memberSince: string
  tier: string
  archiveSize: number
  savedMoments: number
  isDemo: false
}

interface DbProfile {
  id: string
  display_name: string | null
  onboarding_completed: boolean
  preferences: Record<string, unknown> | null
  created_at: string
  membership_tier: string | null
}

const CONNECTED_SERVICES = [
  { name: 'Spotify', connected: true, lastSync: '2 hours ago' },
  { name: 'Apple Music', connected: false, lastSync: null },
  { name: 'Last.fm', connected: true, lastSync: '1 day ago' },
]

const JOINED_ROOMS = [
  { name: 'The Nocturnal Room', role: 'Member', joined: 'March 2023' },
  { name: 'Beautiful Damage', role: 'Member', joined: 'May 2023' },
  { name: 'Records for Rain', role: 'Member', joined: 'August 2023' },
]

export function ProfileScreen() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()

  const [localState, setLocalState] = useState<{
    completed: boolean
    archetype?: string
    completedAt?: string
  } | null>(null)

  const [supabaseStatus, setSupabaseStatus] = useState<{
    authenticated: boolean
    onboardingCompleted: boolean
  } | null>(null)

  const [isSigningOut, setIsSigningOut] = useState(false)
  const [dbProfile, setDbProfile] = useState<DbProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  // ── Profile hydration ─────────────────────────────────────────────────────
  // Fetch user_profiles row using the browser Supabase client (reads session
  // from localStorage — avoids cookie/SSR timing issues with implicit flow).
  // Runs once when auth resolves. Re-runs if the user id changes (e.g. sign in
  // after sign out on the same page).
  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated || !user) {
      setDbProfile(null)
      setProfileLoading(false)
      console.log('[ProfileScreen]', {
        'auth user id': null,
        'auth email': null,
        'hydrated profile id': null,
        'demo mode activated': true,
      })
      return
    }

    setProfileLoading(true)
    setProfileError(null)

    const supabase = getSupabaseBrowserClient()

    Promise.all([
      supabase
        .from('user_profiles')
        .select('id, display_name, onboarding_completed, preferences, created_at')
        .eq('id', user.id)
        .single(),
      supabase
        .from('user_memberships')
        .select('tier')
        .eq('user_id', user.id)
        .single(),
    ])
      .then(([profileRes, membershipRes]) => {
        if (profileRes.error) {
          console.error('[ProfileScreen] profile fetch error:', profileRes.error.message)
          setProfileError(profileRes.error.message)
          setProfileLoading(false)
          return
        }
        const profile: DbProfile = {
          ...profileRes.data,
          membership_tier: membershipRes.data?.tier ?? null,
        }
        setDbProfile(profile)
        setProfileLoading(false)
        console.log('[ProfileScreen]', {
          'auth user id': user.id,
          'auth email': user.email,
          'hydrated profile id': profile.id,
          'demo mode activated': false,
        })
      })
      .catch(err => {
        console.error('[ProfileScreen] profile fetch exception:', err)
        setProfileError(String(err))
        setProfileLoading(false)
      })
  }, [authLoading, isAuthenticated, user?.id])

  // ── localStorage state ────────────────────────────────────────────────────
  useEffect(() => {
    const state = getOnboardingState()
    setLocalState({
      completed: state.completed,
      archetype: state.archetype,
      completedAt: state.completedAt,
    })
  }, [])

  // ── Supabase onboarding status ────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading) {
      getOnboardingStatus().then(setSupabaseStatus).catch(() => {})
    }
  }, [authLoading, isAuthenticated])

  // ── Display user derivation ───────────────────────────────────────────────
  // Priority: DB display_name → JWT metadata → email prefix → DEMO_USER
  // Returns null while hydrating (triggers loading skeleton in header).
  const isHydrating = authLoading || (isAuthenticated && profileLoading)

  const displayUser: DisplayUser | null = isHydrating
    ? null
    : isAuthenticated && user
    ? {
        name:
          dbProfile?.display_name ??
          user.user_metadata?.name ??
          user.user_metadata?.full_name ??
          user.email?.split('@')[0] ??
          'Listener',
        handle: `@${(
          user.email?.split('@')[0] ?? 'listener'
        ).toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        avatar: user.user_metadata?.avatar_url ?? null,
        memberSince: new Date(
          dbProfile?.created_at ?? user.created_at
        ).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        tier:
          dbProfile?.membership_tier === 'member'
            ? 'LongPlay Member'
            : 'LongPlay Explorer',
        archiveSize: 0,
        savedMoments: 0,
        isDemo: false,
      }
    : DEMO_USER

  // Non-identity sections use safeUser so layout doesn't collapse while loading
  const safeUser = displayUser ?? DEMO_USER

  // ── Sign out ──────────────────────────────────────────────────────────────
  // Must use the browser client so it clears localStorage (where implicit-flow
  // sessions are stored). The server-action approach only cleared cookies and
  // left the localStorage session intact, causing the session to survive reload.
  const handleSignOut = async () => {
    setIsSigningOut(true)
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    // AuthProvider.onAuthStateChange fires → user = null → displayUser = DEMO_USER
    router.push('/')
  }

  const handleRestartOnboarding = () => {
    resetOnboarding()
    router.push('/onboarding')
  }

  return (
    <div className="grain relative pb-32 md:pb-16 md:pt-24">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <section className="px-6 pt-16 pb-8 md:px-12 lg:px-24">
        {isHydrating ? (
          <div className="flex items-start gap-6 animate-pulse">
            <div className="h-20 w-20 md:h-24 md:w-24 rounded-full bg-tobacco/10 border-2 border-tobacco/10 shrink-0" />
            <div className="flex-1 space-y-3 pt-2">
              <div className="h-6 w-44 bg-tobacco/10 rounded-sm" />
              <div className="h-4 w-28 bg-tobacco/10 rounded-sm" />
              <div className="h-3 w-36 bg-tobacco/10 rounded-sm" />
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-6">
            <Avatar className="h-20 w-20 md:h-24 md:w-24 border-2 border-tobacco/30 shrink-0">
              {safeUser.avatar && (
                <AvatarImage src={safeUser.avatar} alt={safeUser.name} />
              )}
              <AvatarFallback className="bg-tobacco/20 text-cream text-xl">
                {safeUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <h1 className="font-serif text-2xl md:text-3xl text-cream mb-1">
                {safeUser.name}
              </h1>
              <p className="text-muted-foreground text-sm mb-3">{safeUser.handle}</p>
              <p className="text-xs text-tobacco">Member since {safeUser.memberSince}</p>
              {displayUser?.isDemo && (
                <p className="text-[10px] text-tobacco/50 mt-1 uppercase tracking-widest">
                  Demo mode · sign in to see your profile
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Membership Status ─────────────────────────────────────────────── */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-border/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Membership</h2>
        </div>

        <Link
          href="/membership"
          className="block bg-burgundy/10 border border-burgundy/30 p-5 hover:bg-burgundy/15 transition-all duration-500"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-lg text-cream">{safeUser.tier}</h3>
            <span className="text-xs text-burgundy px-2 py-1 border border-burgundy/50 rounded-full">
              Active
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Full access to all identity features, unlimited clubs, and your complete listening archive.
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Member since {safeUser.memberSince}</span>
            <span className="text-tobacco flex items-center gap-1">
              Manage
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </span>
          </div>
        </Link>
      </section>

      {/* ── Archive Stats ─────────────────────────────────────────────────── */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-border/20">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">Your Archive</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 border border-border/20">
            <p className="font-serif text-3xl text-cream mb-1">
              {safeUser.archiveSize.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">listening moments</p>
          </div>
          <div className="p-4 border border-border/20">
            <p className="font-serif text-3xl text-cream mb-1">{safeUser.savedMoments}</p>
            <p className="text-xs text-muted-foreground">saved reflections</p>
          </div>
        </div>

        <Link
          href="/listening-life"
          className="block mt-4 text-sm text-tobacco hover:text-cream transition-colors"
        >
          Explore your listening life →
        </Link>
      </section>

      {/* ── Connected Services ────────────────────────────────────────────── */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-border/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Connected Services</h2>
          <button className="text-xs text-tobacco hover:text-cream transition-colors">
            Add service
          </button>
        </div>

        <div className="space-y-3">
          {CONNECTED_SERVICES.map(service => (
            <div
              key={service.name}
              className="flex items-center justify-between p-4 border border-border/20"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${service.connected ? 'bg-olive' : 'bg-muted'}`} />
                <span className="text-cream">{service.name}</span>
              </div>
              {service.connected ? (
                <span className="text-xs text-muted-foreground">Synced {service.lastSync}</span>
              ) : (
                <button className="text-xs text-tobacco hover:text-cream transition-colors">
                  Connect
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Joined Rooms ──────────────────────────────────────────────────── */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-border/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Your Rooms</h2>
          <Link href="/rooms" className="text-xs text-tobacco hover:text-cream transition-colors">
            Discover rooms
          </Link>
        </div>

        <div className="space-y-3">
          {JOINED_ROOMS.map(room => (
            <Link
              key={room.name}
              href={`/rooms/${room.name.toLowerCase().replace(/\s+/g, '-')}`}
              className="flex items-center justify-between p-4 border border-border/20 hover:border-border/40 transition-colors"
            >
              <div>
                <h3 className="font-serif text-cream">{room.name}</h3>
                <p className="text-xs text-muted-foreground">Joined {room.joined}</p>
              </div>
              <svg
                className="w-4 h-4 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Settings ──────────────────────────────────────────────────────── */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-border/20">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">Settings</h2>
        <div className="space-y-2">
          <SettingsLink label="Privacy" description="Control who sees your listening" />
          <SettingsLink label="Notifications" description="Manage email and push alerts" />
          <SettingsLink label="Export Data" description="Download your archive" />
          <SettingsLink label="Account" description="Email, password, and security" />
        </div>
      </section>

      {/* ── Identity Link ─────────────────────────────────────────────────── */}
      <section className="mx-6 md:mx-12 lg:mx-24 my-8">
        <Link
          href="/identity"
          className="block p-6 bg-burgundy/10 border border-burgundy/30 hover:bg-burgundy/15 transition-all duration-500"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-xl text-cream mb-2">Your Listening Identity</h3>
              <p className="text-sm text-muted-foreground">
                Explore your archetype, taste portrait, and emotional dimensions.
              </p>
            </div>
            <svg
              className="w-6 h-6 text-burgundy"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
            </svg>
          </div>
        </Link>
      </section>

      {/* ── Sign Out ──────────────────────────────────────────────────────── */}
      <section className="px-6 py-8 md:px-12 lg:px-24">
        {!authLoading && isAuthenticated ? (
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="text-sm text-muted-foreground hover:text-cream transition-colors disabled:opacity-50"
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        ) : !authLoading ? (
          <Link
            href="/onboarding"
            className="text-sm text-tobacco hover:text-cream transition-colors"
          >
            Sign in →
          </Link>
        ) : null}
      </section>

      {/* ── Auth & Debug Panel ────────────────────────────────────────────── */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t-2 border-dashed border-tobacco/20 bg-card/5">
        <p className="text-[10px] uppercase tracking-[0.3em] text-tobacco/60 mb-5">
          Auth Debug Panel
        </p>

        <div className="space-y-3 mb-6 font-mono text-xs">
          <DebugRow label="current route">
            <span className="text-cream text-right break-all">{pathname}</span>
          </DebugRow>

          <DebugRow label="supabase session">
            {authLoading ? (
              <span className="text-tobacco/50">loading…</span>
            ) : isAuthenticated && user ? (
              <span className="text-olive text-right break-all">{user.email}</span>
            ) : (
              <span className="text-red-400/70">not signed in</span>
            )}
          </DebugRow>

          <DebugRow label="auth user id">
            {authLoading ? (
              <span className="text-tobacco/50">loading…</span>
            ) : isAuthenticated && user ? (
              <span className="text-cream/60 text-right break-all text-[10px]">{user.id}</span>
            ) : (
              <span className="text-muted-foreground/40">—</span>
            )}
          </DebugRow>

          <DebugRow label="hydrated profile id">
            {isHydrating ? (
              <span className="text-tobacco/50">loading…</span>
            ) : dbProfile ? (
              <span className="text-olive text-right break-all text-[10px]">{dbProfile.id}</span>
            ) : isAuthenticated ? (
              <span className="text-red-400/70 text-right break-all text-[10px]">
                {profileError ? `error: ${profileError.slice(0, 50)}` : 'not found in db'}
              </span>
            ) : (
              <span className="text-muted-foreground/40">—</span>
            )}
          </DebugRow>

          <DebugRow label="demo mode">
            {isHydrating ? (
              <span className="text-tobacco/50">loading…</span>
            ) : displayUser?.isDemo ? (
              <span className="text-red-400/70">active — no authenticated session</span>
            ) : (
              <span className="text-olive">inactive — real user data</span>
            )}
          </DebugRow>

          <DebugRow label="localStorage">
            {localState === null ? (
              <span className="text-tobacco/50">reading…</span>
            ) : localState.completed ? (
              <span className="text-olive text-right">
                complete · {localState.archetype ?? 'no archetype'}
              </span>
            ) : (
              <span className="text-red-400/70">not complete</span>
            )}
          </DebugRow>

          <DebugRow label="supabase db">
            {supabaseStatus === null ? (
              <span className="text-tobacco/50">loading…</span>
            ) : !supabaseStatus.authenticated ? (
              <span className="text-muted-foreground/50">not authenticated</span>
            ) : supabaseStatus.onboardingCompleted ? (
              <span className="text-olive">onboarding_completed = true</span>
            ) : (
              <span className="text-red-400/70">onboarding_completed = false</span>
            )}
          </DebugRow>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRestartOnboarding}
            className="px-4 py-2 border border-tobacco/40 text-tobacco hover:bg-tobacco/10 text-xs transition-all duration-300"
          >
            Clear localStorage + Start Onboarding
          </button>

          <Link
            href="/onboarding"
            className="px-4 py-2 border border-border/30 text-muted-foreground hover:text-cream hover:border-border/60 text-xs transition-all duration-300"
          >
            Go to /onboarding directly
          </Link>
        </div>

        <p className="text-[10px] text-muted-foreground/30 mt-4">
          This panel is visible in all environments for testing. Remove before launch.
        </p>
      </section>
    </div>
  )
}

function DebugRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/10">
      <span className="text-muted-foreground/60 shrink-0">{label}</span>
      {children}
    </div>
  )
}

function SettingsLink({ label, description }: { label: string; description: string }) {
  return (
    <button className="w-full flex items-center justify-between p-4 border border-border/20 hover:border-border/40 transition-colors text-left">
      <div>
        <h3 className="text-cream">{label}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <svg
        className="w-4 h-4 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  )
}
