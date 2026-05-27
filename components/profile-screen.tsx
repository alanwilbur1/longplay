'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { clearLastRoom } from '@/lib/last-room'
import { useAuth } from '@/components/auth-provider'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { getOnboardingStatus } from '@/lib/actions/onboarding'
import { getMyMemberships } from '@/lib/actions/membership'
import { listMyMoments } from '@/lib/actions/moments'
import {
  disconnectConnection,
  initiateConnection,
  listMyConnections,
} from '@/lib/actions/streaming'
import { SyncConnectionButton } from '@/components/sync-connection-button'

/**
 * ProfileScreen
 *
 * Identity source of truth: Supabase session + `user_profiles` row.
 * If there is no session, this screen renders a signed-out state —
 * never a demo identity. localStorage no longer participates in identity
 * decisions.
 *
 * Phase 6A.13: Debug surfaces (auth panel + connection row state) are
 * now gated behind isProfileDebugEnabled() — same posture as the sync
 * button. Production users never see raw UUIDs, internal table state,
 * or Postgres error codes. Operators can flip on with ?debug=profile,
 * NEXT_PUBLIC_SHOW_PROFILE_DEBUG=1, or any non-prod NODE_ENV.
 */

function isProfileDebugEnabled(): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  if (process.env.NEXT_PUBLIC_SHOW_PROFILE_DEBUG === '1') return true
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('debug') === 'profile') return true
  }
  return false
}

interface DbProfile {
  id: string
  display_name: string | null
  onboarding_completed: boolean
  preferences: Record<string, unknown> | null
  created_at: string
  membership_tier: string | null
}

type DisplayUser = {
  name: string
  handle: string
  avatar: string | null
  memberSince: string
  tier: string
  archiveSize: number
  savedMoments: number
}

// Streaming services rendered in the Connected Services section. State
// (connected vs available) comes from listening_connections; this list
// is just the catalog of what we currently offer + the honest scaffold
// label for in-progress providers.
const STREAMING_PROVIDER_CATALOG = [
  { sourceId: 'spotify' as const, name: 'Spotify', available: true },
  { sourceId: 'apple_music' as const, name: 'Apple Music', available: false },
] as const

type JoinedRoomEntry = { name: string; slug: string; role: string; joined: string }

export function ProfileScreen() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const [joinedRooms, setJoinedRooms] = useState<JoinedRoomEntry[]>([])
  // Phase 6A.13: client-only flag; evaluated after mount so SSR
  // doesn't accidentally render the debug panel for the first paint.
  const [showDebug, setShowDebug] = useState(false)
  useEffect(() => {
    setShowDebug(isProfileDebugEnabled())
  }, [])

  const [supabaseStatus, setSupabaseStatus] = useState<{
    authenticated: boolean
    onboardingCompleted: boolean
  } | null>(null)

  const [isSigningOut, setIsSigningOut] = useState(false)
  const [dbProfile, setDbProfile] = useState<DbProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [momentCounts, setMomentCounts] = useState({ total: 0, reflections: 0 })

  // Real streaming connections from listening_connections (DB-backed).
  // No hardcoded "Synced 2 hours ago" — last_sync_at carries the truth.
  // We also keep the read-error info so the debug strip can render
  // missing-table state ("source:error code:PGRST205 ...") instead of
  // silently showing the Connect button.
  const [connections, setConnections] = useState<
    Array<{
      id: string
      source_id: 'spotify' | 'apple_music'
      external_account_id: string | null
      display_name: string | null
      status: string
      connected_at: string
      last_sync_at: string | null
    }>
  >([])
  const [connectionsError, setConnectionsError] = useState<{
    code: string | null
    message: string
  } | null>(null)
  const [connectionsQueriedAs, setConnectionsQueriedAs] = useState<string | null>(null)
  const [connectionsLoading, setConnectionsLoading] = useState(true)
  const searchParams = useSearchParams()

  // ── Profile hydration ─────────────────────────────────────────────────────
  // Fetch user_profiles row using the browser Supabase client.
  // Runs once when auth resolves. Re-runs if the user id changes.
  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated || !user) {
      setDbProfile(null)
      setProfileLoading(false)
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
        .maybeSingle(),
      supabase
        .from('user_memberships')
        .select('tier')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])
      .then(([profileRes, membershipRes]) => {
        if (profileRes.error) {
          setProfileError(profileRes.error.message)
          setProfileLoading(false)
          return
        }
        if (!profileRes.data) {
          // Trigger race — the auth.users row exists but user_profiles
          // hasn't materialized yet. Treat as "no profile yet" without
          // failing.
          setDbProfile(null)
          setProfileLoading(false)
          return
        }
        const profile: DbProfile = {
          ...profileRes.data,
          membership_tier: membershipRes.data?.tier ?? null,
        }
        setDbProfile(profile)
        setProfileLoading(false)
      })
      .catch(err => {
        setProfileError(String(err))
        setProfileLoading(false)
      })
  }, [authLoading, isAuthenticated, user?.id])

  // ── Supabase onboarding status ────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading) {
      getOnboardingStatus().then(setSupabaseStatus).catch(() => {})
    }
  }, [authLoading, isAuthenticated])

  // ── Listening connections (real DB-backed; no fake demo state) ────────────
  // Re-loads when the URL search params change so a successful OAuth
  // round-trip (which lands back here with ?connection=connected) shows
  // the freshly-persisted row immediately. Also re-called by the
  // SyncButton after a sync completes so last_sync_at refreshes
  // without a hard reload.
  const refetchConnections = useCallback(async () => {
    setConnectionsLoading(true)
    setConnectionsError(null)
    try {
      const result = await listMyConnections()
      setConnections(result.rows)
      setConnectionsError(result.error)
      setConnectionsQueriedAs(result.queriedAs)
    } catch (err) {
      setConnections([])
      setConnectionsError({
        code: 'EXCEPTION',
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setConnectionsLoading(false)
    }
  }, [])

  const connectionRefreshKey = searchParams?.toString() ?? ''
  useEffect(() => {
    if (!isAuthenticated) {
      setConnections([])
      setConnectionsError(null)
      setConnectionsQueriedAs(null)
      setConnectionsLoading(false)
      return
    }
    void refetchConnections()
  }, [isAuthenticated, connectionRefreshKey, refetchConnections])

  // ── Moment counts from DB ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return
    listMyMoments()
      .then(result => {
        if (result.success && result.data) {
          setMomentCounts({
            total: result.data.length,
            reflections: result.data.filter(m => m.type === 'reflection').length,
          })
        }
      })
      .catch(() => {})
  }, [isAuthenticated])

  // ── Joined rooms from DB ───────────────────────────────────────────────────
  useEffect(() => {
    if (isAuthenticated) {
      getMyMemberships()
        .then(memberships => {
          setJoinedRooms(
            memberships.map(m => ({
              name: m.roomName,
              slug: m.roomSlug,
              role: m.role === 'member' ? 'Member' : m.role,
              joined: new Date(m.joinedAt).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              }),
            })),
          )
        })
        .catch(() => {})
    } else {
      setJoinedRooms([])
    }
  }, [isAuthenticated])

  const isHydrating = authLoading || (isAuthenticated && profileLoading)

  // displayUser is null until we have a real authenticated session +
  // (optionally) a hydrated profile row. There is no demo fallback.
  const displayUser: DisplayUser | null =
    isHydrating || !isAuthenticated || !user
      ? null
      : {
          name:
            dbProfile?.display_name ??
            (user.user_metadata?.name as string | undefined) ??
            (user.user_metadata?.full_name as string | undefined) ??
            user.email?.split('@')[0] ??
            'Listener',
          handle: `@${(
            user.email?.split('@')[0] ?? 'listener'
          ).toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          avatar: (user.user_metadata?.avatar_url as string | undefined) ?? null,
          memberSince: new Date(
            dbProfile?.created_at ?? user.created_at
          ).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          tier:
            dbProfile?.membership_tier === 'member'
              ? 'LongPlay Member'
              : 'LongPlay Explorer',
          archiveSize: momentCounts.total,
          savedMoments: momentCounts.reflections,
        }

  // ── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    setIsSigningOut(true)
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    sessionStorage.removeItem('longplay_onboarding_synced')
    clearLastRoom()
    router.push('/sign-in')
  }

  // ── Signed-out view ───────────────────────────────────────────────────────
  // Renders if the proxy ever lets an unauthenticated request through to
  // this surface (defense in depth). The proxy is supposed to redirect
  // /profile to /sign-in, but if it doesn't, we never pretend to be
  // logged in.
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="grain min-h-[60svh] flex items-center justify-center px-6 py-24">
        <div className="text-center max-w-sm">
          <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-10">
            Your Profile
          </p>
          <h1 className="font-serif text-3xl text-cream/90 mb-6 leading-[1.2]">
            Not signed in
          </h1>
          <p className="font-serif text-base text-cream/55 italic leading-relaxed mb-12">
            Your archive lives behind the sign-in.
            <br />
            Enter your email and we&rsquo;ll send a code.
          </p>
          <Link
            href="/sign-in?next=/profile"
            className="inline-block px-6 py-3 border border-cream/15 text-cream/80 text-sm tracking-wide hover:bg-cream/[0.03] hover:border-cream/30 transition-colors duration-500"
          >
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="grain relative pb-32 md:pb-16 md:pt-24">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <section className="px-6 pt-16 pb-8 md:px-12 lg:px-24">
        {isHydrating || !displayUser ? (
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
              {displayUser.avatar && (
                <AvatarImage src={displayUser.avatar} alt={displayUser.name} />
              )}
              <AvatarFallback className="bg-tobacco/20 text-cream text-xl">
                {displayUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <h1 className="font-serif text-2xl md:text-3xl text-cream mb-1">
                {displayUser.name}
              </h1>
              <p className="text-muted-foreground text-sm mb-3">{displayUser.handle}</p>
              <p className="text-xs text-tobacco">Member since {displayUser.memberSince}</p>
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
            <h3 className="font-serif text-lg text-cream">{displayUser?.tier ?? '—'}</h3>
            <span className="text-xs text-burgundy px-2 py-1 border border-burgundy/50 rounded-full">
              Active
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Full access to all identity features, unlimited clubs, and your complete listening archive.
          </p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {displayUser ? `Member since ${displayUser.memberSince}` : '—'}
            </span>
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
              {(displayUser?.archiveSize ?? 0).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">listening moments</p>
          </div>
          <div className="p-4 border border-border/20">
            <p className="font-serif text-3xl text-cream mb-1">
              {displayUser?.savedMoments ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">reflections</p>
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
      {/* Real DB-backed connection state. No hardcoded "Synced 2 hours ago".
         Spotify connects via OAuth (initiateConnection). Apple Music is
         scaffold-honest until MusicKit lands. */}
      <section className="px-6 py-6 md:px-12 lg:px-24 border-t border-border/20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Connected Services
          </h2>
        </div>

        {searchParams?.get('connection') === 'connected' && (
          <p className="text-xs text-olive mb-3">
            Connected {searchParams.get('source') ?? ''}.
          </p>
        )}
        {searchParams?.get('connection') === 'disconnected' && (
          <p className="text-xs text-muted-foreground mb-3">Disconnected.</p>
        )}
        {searchParams?.get('connection_error') && (
          <p className="text-xs text-burgundy/80 mb-3">
            Could not connect ({searchParams.get('connection_error')}).
          </p>
        )}

        <div className="space-y-3">
          {STREAMING_PROVIDER_CATALOG.map((provider) => {
            const conn = connections.find(
              (c) => c.source_id === provider.sourceId && c.status === 'active',
            )
            const isConnected = !!conn

            // Apple Music: honest scaffold state until MusicKit JWT mint is wired
            if (!provider.available) {
              return (
                <div
                  key={provider.sourceId}
                  className="flex items-center justify-between p-4 border border-border/20 opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-muted" />
                    <span className="text-cream">{provider.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Coming soon</span>
                </div>
              )
            }

            return (
              <div key={provider.sourceId} className="flex flex-col">
                <div className="flex items-center justify-between p-4 border border-border/20">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${isConnected ? 'bg-olive' : 'bg-muted'}`}
                    />
                    <div className="flex flex-col items-start text-left">
                      <span className="text-cream">{provider.name}</span>
                      {isConnected && conn.display_name && (
                        <span className="text-[11px] text-muted-foreground/70 mt-0.5">
                          {conn.display_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Loading placeholder is only shown on the INITIAL
                      load (no rows yet). A refetch triggered by the
                      SyncButton's onSynced callback would otherwise
                      unmount the button mid-flight and drop its
                      `result` state — including the hydration audit
                      strip. */}
                  {connectionsLoading && connections.length === 0 ? (
                    <span className="text-xs text-muted-foreground/50">…</span>
                  ) : isConnected ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-olive uppercase tracking-wider">
                        {conn.last_sync_at
                          ? `Synced ${new Date(conn.last_sync_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}`
                          : 'Connected — not yet synced'}
                      </span>
                      <SyncConnectionButton
                        sourceId={provider.sourceId}
                        onSynced={() => {
                          void refetchConnections()
                        }}
                      />
                      <form action={disconnectConnection}>
                        <input type="hidden" name="source" value={provider.sourceId} />
                        <button
                          type="submit"
                          className="text-xs text-muted-foreground hover:text-burgundy/80 transition-colors"
                        >
                          Disconnect
                        </button>
                      </form>
                    </div>
                  ) : (
                    <form action={initiateConnection}>
                      <input type="hidden" name="source" value={provider.sourceId} />
                      <input type="hidden" name="returnTo" value="/profile" />
                      <button
                        type="submit"
                        className="text-xs text-tobacco hover:text-cream transition-colors"
                      >
                        Connect
                      </button>
                    </form>
                  )}
                </div>

                {/* Phase 6A.13: connection diagnostics moved behind the
                    profile debug surface. Production users see only the
                    Connect / Sync now / Disconnect controls — no raw row
                    ids, status enums, or Postgres error codes. Flip on
                    with ?debug=profile or NEXT_PUBLIC_SHOW_PROFILE_DEBUG=1. */}
                {showDebug && (
                  <div className="px-4 py-1 text-[10px] font-mono text-muted-foreground/40 leading-tight">
                    <div>
                      source:
                      {connectionsLoading
                        ? 'loading'
                        : connectionsError
                          ? 'error'
                          : conn
                            ? 'db-row'
                            : 'none'}
                      {'  '}
                      row_id:{conn ? `${conn.id.slice(0, 8)}…` : '—'}
                      {'  '}
                      status:{conn ? conn.status : '—'}
                      {'  '}
                      last_sync_at:{conn ? String(conn.last_sync_at ?? 'null') : '—'}
                    </div>
                    <div>
                      queried_as:
                      {connectionsQueriedAs
                        ? `${connectionsQueriedAs.slice(0, 8)}…`
                        : '—'}
                    </div>
                    {connectionsError && (
                      <div className="text-burgundy/60">
                        read_error: code={String(connectionsError.code ?? 'null')}{' '}
                        msg={connectionsError.message.slice(0, 80)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
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
          {joinedRooms.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              No rooms joined yet.{' '}
              <Link href="/rooms" className="text-tobacco hover:text-cream transition-colors">
                Discover rooms →
              </Link>
            </p>
          )}
          {joinedRooms.map(room => (
            <Link
              key={room.slug}
              href={`/rooms/${room.slug}`}
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
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="text-sm text-muted-foreground hover:text-cream transition-colors disabled:opacity-50"
        >
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>

      {/* Phase 6A.13: Auth debug panel — operator-only. Previously
          rendered to all users in production, exposing UUIDs, email,
          and internal onboarding flags. Now gated behind
          isProfileDebugEnabled() with the same posture as the sync
          button debug surface. */}
      {showDebug && (
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
        </section>
      )}
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
