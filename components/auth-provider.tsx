'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

interface AuthContextValue {
  user: User | null
  session: Session | null
  isLoading: boolean
  isAuthenticated: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  isLoading: true,
  isAuthenticated: false,
  refresh: async () => {},
})

const DEV_MODE = process.env.NODE_ENV === 'development'

/**
 * AuthProvider — single source of CLIENT identity state.
 *
 * Sync rules:
 *
 *   1. On mount: read session once.
 *   2. Subscribe to onAuthStateChange (handles client-side auth actions).
 *   3. ALSO re-read the session on every pathname change. This is the
 *      bridge for the case where a server action or server-side redirect
 *      wrote auth cookies (e.g. /sign-in's verifyCode, the onboarding
 *      completion upsert) but the browser client's internal cache stayed
 *      stale — onAuthStateChange does NOT fire for server-side cookie
 *      writes, so without this we'd render "signed out" for any client
 *      component reading useAuth() until a full page reload.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const pathname = usePathname()

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    setUser(data.session?.user ?? null)
  }, [])

  // Mount-time + auth-state-change subscription.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setIsLoading(false)
      if (DEV_MODE) {
        console.log('[auth-provider] initial getSession', {
          hasSession: !!data.session,
          userId: data.session?.user?.id ?? null,
        })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess)
      setUser(sess?.user ?? null)
      setIsLoading(false)
      if (DEV_MODE) {
        console.log('[auth-provider] onAuthStateChange', {
          event,
          hasSession: !!sess,
          userId: sess?.user?.id ?? null,
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Re-sync on route change. Soft navigations after a server-side cookie
  // write (sign-in, onboarding completion) would otherwise leave the
  // client cache stale — onAuthStateChange doesn't fire when the server
  // sets the cookie. A pathname-change read bridges that gap.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data, error }) => {
      const next = data.user ?? null
      setUser((prev) => {
        if (prev?.id === next?.id) return prev
        if (DEV_MODE) {
          console.log('[auth-provider] route-change resync', {
            pathname,
            prevUserId: prev?.id ?? null,
            nextUserId: next?.id ?? null,
            error: error?.message ?? null,
          })
        }
        return next
      })
      if (next) {
        supabase.auth.getSession().then(({ data: sessData }) => {
          setSession(sessData.session)
        })
      } else {
        setSession(null)
      }
    })
  }, [pathname])

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isLoading,
      isAuthenticated: !!user,
      refresh,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
