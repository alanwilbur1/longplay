'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const REASON_MESSAGES: Record<string, string> = {
  no_token:
    'No authentication token was found in the sign-in link. The link may be malformed or incomplete.',
  otp_failed:
    'The sign-in link could not be verified. It may have expired (links are valid for 1 hour) or already been used (links are single-use).',
  code_failed:
    'The PKCE code exchange failed. This is usually caused by a missing code-verifier cookie — see the technical details below.',
  no_user:
    'Authentication completed but no user record was returned. Please try signing in again.',
}

const MODE_LABELS: Record<string, string> = {
  otp: 'OTP / token_hash flow',
  pkce: 'PKCE / code flow',
  none: 'no token detected',
  unknown: 'unknown',
}

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason') ?? 'unknown'
  const mode = searchParams.get('mode') ?? null
  const msg = searchParams.get('msg') ?? null
  const hadVerifier = searchParams.get('had_verifier') ?? null
  const params = searchParams.get('params') ?? null

  const friendlyMessage = REASON_MESSAGES[reason] ?? 'An unexpected error occurred. Please try again.'

  return (
    <div className="max-w-md w-full animate-fade-in">
      <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-8">
        Authentication
      </p>

      <h1 className="font-serif text-3xl text-cream mb-6">
        Something went wrong
      </h1>

      <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-8" />

      <p className="text-muted-foreground leading-relaxed mb-8">
        {friendlyMessage}
      </p>

      {/* Technical detail panel — visible for debugging, remove before launch */}
      <div className="mb-8 p-4 border border-border/20 bg-card/10 text-left space-y-2">
        <p className="text-[9px] uppercase tracking-[0.3em] text-tobacco/50 mb-3">
          Technical details
        </p>

        <div className="space-y-1 font-mono text-[11px]">
          <div className="flex gap-3">
            <span className="text-muted-foreground/50 shrink-0 w-28">reason</span>
            <span className="text-cream/70 break-all">{reason}</span>
          </div>

          {mode && (
            <div className="flex gap-3">
              <span className="text-muted-foreground/50 shrink-0 w-28">callback mode</span>
              <span className="text-cream/70 break-all">{MODE_LABELS[mode] ?? mode}</span>
            </div>
          )}

          {msg && (
            <div className="flex gap-3">
              <span className="text-muted-foreground/50 shrink-0 w-28">supabase error</span>
              <span className="text-red-400/80 break-all">{msg}</span>
            </div>
          )}

          {hadVerifier !== null && (
            <div className="flex gap-3">
              <span className="text-muted-foreground/50 shrink-0 w-28">had verifier</span>
              <span className={hadVerifier === 'true' ? 'text-olive' : 'text-red-400/80'}>
                {hadVerifier === 'true' ? 'yes' : 'no — SameSite cookie issue likely'}
              </span>
            </div>
          )}

          {params && (
            <div className="flex gap-3">
              <span className="text-muted-foreground/50 shrink-0 w-28">url params</span>
              <span className="text-cream/50 break-all">{params}</span>
            </div>
          )}
        </div>
      </div>

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
      <Suspense
        fallback={
          <div className="max-w-sm">
            <p className="text-muted-foreground">Loading…</p>
          </div>
        }
      >
        <AuthErrorContent />
      </Suspense>
    </div>
  )
}
