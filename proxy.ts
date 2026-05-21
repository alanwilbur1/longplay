import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Next 16 edge proxy. Two responsibilities:
 *
 *   1. Refresh the Supabase session token on every request so server
 *      components and server actions read an up-to-date session.
 *   2. Gate authenticated surfaces. Unauthenticated visitors hitting a
 *      protected route are redirected to /sign-in with ?next= so they
 *      bounce back to where they were heading after the OTP verify.
 *
 * Auth is OTP-only (no magic links, no callbacks). /sign-in is the
 * canonical entry point.
 */

const PROTECTED_PREFIXES = [
  '/archive',
  '/listening-life',
  '/identity',
  '/profile',
  '/membership',
  '/compatibility',
  '/share',
  '/year-in-review',
  '/onboarding',
  '/affinity',
  '/club',
  '/clubs',
  '/room',
  '/rooms',
  '/album',
]

const AUTH_ROUTES = ['/sign-in', '/sign-out']

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refreshes the session token if expired. Required for downstream
  // server components — do NOT remove.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl

  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = ''
    url.searchParams.set('next', pathname + search)
    return NextResponse.redirect(url)
  }

  // Signed-in listeners hitting /sign-in or /sign-out → bounce home.
  // /sign-out is a POST endpoint so this only matters for GET probes.
  if (user && isAuthRoute(pathname) && pathname !== '/sign-out') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

export default proxy
