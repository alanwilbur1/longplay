'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const REASON_MESSAGES: Record<string, string> = {
  no_token: 'No authentication token was found in the link. The link may be malformed.',
  otp_failed: 'The sign-in link could not be verified. It may have expired or already been used. Links are single-use only.',
  code_failed: 'The OAuth code exchange failed. Please try signing in again.',
  no_user: 'Authentication succeeded but no user record was returned. Please try again.',
}

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')
  const message = reason ? REASON_MESSAGES[reason] : null

  return (
    <div className="max-w-sm animate-fade-in">
      <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-8">
        Authentication
      </p>

      <h1 className="font-serif text-3xl text-cream mb-6">
        Something went wrong
      </h1>

      <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-8" />

      <p className="text-muted-foreground leading-relaxed mb-4">
        {message ?? 'The sign-in link may have expired or already been used. Links are valid for a single use.'}
      </p>

      {reason && (
        <p className="text-[10px] font-mono text-muted-foreground/40 mb-8">
          reason: {reason}
        </p>
      )}

      <div className="flex flex-col gap-3 items-center">
        <Link
          href="/onboarding"
          className="inline-block px-8 py-3 border border-tobacco/40 text-tobacco hover:bg-tobacco/10 transition-all duration-500 text-sm"
        >
          Try again
        </Link>
        <Link
          href="/"
          className="inline-block px-8 py-3 border border-cream/20 text-cream/60 hover:bg-cream/5 transition-all duration-500 text-sm"
        >
          Return home
        </Link>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8 text-center">
      <Suspense fallback={
        <div className="max-w-sm">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      }>
        <AuthErrorContent />
      </Suspense>
    </div>
  )
}
