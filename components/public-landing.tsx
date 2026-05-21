'use client'

import Link from 'next/link'

/**
 * PublicLanding — the unauthenticated homepage.
 *
 * Renders only when there is no Supabase session. Has no app
 * navigation, no "Your Rooms" shell, no avatar. Two paths into the
 * product: Begin (new listener) and Sign in (returning listener). Both
 * route to /sign-in; the OTP flow at that surface handles new vs.
 * returning automatically via `shouldCreateUser: true`.
 *
 * Tone matches /sign-in: minimal, serif, calm.
 */
export function PublicLanding() {
  return (
    <main className="grain min-h-screen flex items-center justify-center px-6 py-24 bg-background">
      <div className="w-full max-w-lg text-center">
        <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-12">
          A Listening Club
        </p>

        <h1 className="font-serif text-5xl md:text-6xl text-cream mb-8 tracking-tight leading-none">
          <span>Long</span>
          <span className="italic">Play</span>
        </h1>

        <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/40 to-transparent mx-auto mb-10" />

        <p className="font-serif text-xl md:text-2xl text-cream/75 italic leading-relaxed mb-4">
          Where listening becomes identity.
        </p>

        <p className="font-serif text-base text-cream/55 leading-relaxed mb-16 max-w-md mx-auto">
          Most platforms track what you play.
          <br />
          LongPlay traces how music shapes you.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <Link
            href="/sign-in"
            className="w-full sm:w-auto px-10 py-3 border border-cream/25 text-cream/90 text-sm tracking-wide hover:bg-cream/[0.04] hover:border-cream/40 transition-colors duration-500"
          >
            Begin
          </Link>
          <Link
            href="/sign-in"
            className="w-full sm:w-auto px-10 py-3 text-sm tracking-wide text-muted-foreground/80 hover:text-cream/80 transition-colors duration-500"
          >
            Sign in
          </Link>
        </div>

        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/40">
          No password. We send a quiet code.
        </p>
      </div>
    </main>
  )
}
