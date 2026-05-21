import {
  cancelPendingSignIn,
  readPendingSignIn,
  requestCode,
  resendCode,
  verifyCode,
} from './actions'
import { CodeEntry } from './code-entry'

export const metadata = {
  title: 'Sign in | LongPlay',
}

interface SignInPageProps {
  searchParams: Promise<{
    next?: string
    error?: string
    resent?: string
  }>
}

function errorCopy(error: string | undefined): string | null {
  switch (error) {
    case 'invalid_email':
      return 'That doesn’t look like an email address.'
    case 'invalid_code':
      return 'Enter the 8-digit code we sent.'
    case 'send_failed':
      return 'We couldn’t send the code. Try again in a moment.'
    case 'verify_failed':
      return 'That code didn’t match. Check the email — codes are case-sensitive.'
    case 'expired':
      return 'The session expired before the code was entered. Send a new one.'
    case 'session_lost':
      return 'Something went wrong establishing your session. Try again.'
    default:
      return null
  }
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams
  const next = params.next ?? '/'
  const pending = await readPendingSignIn()
  const error = errorCopy(params.error)
  const resent = params.resent === '1'

  // ── Step 2: code entry ────────────────────────────────────────────────
  if (pending) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-24 bg-background">
        <div className="w-full max-w-sm text-center">
          <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-12">
            LongPlay
          </p>

          <h1 className="font-serif text-3xl text-cream/90 mb-6 leading-[1.2]">
            Enter the code
          </h1>

          <p className="font-serif text-base text-cream/55 italic leading-relaxed mb-16 max-w-xs mx-auto">
            We sent an eight-digit code to
            <br />
            <span className="text-cream/75 not-italic">{pending.email}</span>
          </p>

          <form id="verify-form" action={verifyCode} className="space-y-12">
            <CodeEntry formId="verify-form" />

            <button
              type="submit"
              className="w-full py-3 border border-cream/15 text-cream/80 text-sm tracking-wide hover:bg-cream/[0.03] hover:border-cream/30 transition-colors duration-500"
            >
              Enter
            </button>

            {error && (
              <p className="font-serif text-sm text-burgundy/70 italic">{error}</p>
            )}
            {!error && resent && (
              <p className="font-serif text-sm text-cream/45 italic">
                A new code is on its way.
              </p>
            )}
          </form>

          <div className="mt-16 flex flex-col items-center gap-4 text-xs text-muted-foreground/55">
            <form action={resendCode}>
              <button
                type="submit"
                className="font-serif italic tracking-wide hover:text-cream/70 transition-colors duration-500"
              >
                Send another code
              </button>
            </form>
            <form action={cancelPendingSignIn}>
              <button
                type="submit"
                className="font-serif italic tracking-wide hover:text-cream/70 transition-colors duration-500"
              >
                Use a different email
              </button>
            </form>
          </div>
        </div>
      </main>
    )
  }

  // ── Step 1: email entry ───────────────────────────────────────────────
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-24 bg-background">
      <div className="w-full max-w-sm text-center">
        <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-12">
          LongPlay
        </p>

        <h1 className="font-serif text-3xl text-cream/90 mb-6 leading-[1.2]">
          Sign in
        </h1>

        <p className="font-serif text-base text-cream/55 italic leading-relaxed mb-16 max-w-xs mx-auto">
          We’ll send a quiet code to your inbox.
          <br />
          Nothing to remember, nothing to install.
        </p>

        <form action={requestCode} className="space-y-10">
          <input type="hidden" name="next" value={next} />
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            spellCheck={false}
            autoCapitalize="none"
            placeholder="you@example.com"
            className="w-full bg-transparent text-center font-serif text-lg text-cream placeholder:text-cream/25 border-b border-cream/15 py-3 focus:outline-none focus:border-tobacco transition-colors duration-500"
          />
          <button
            type="submit"
            className="w-full py-3 border border-cream/15 text-cream/80 text-sm tracking-wide hover:bg-cream/[0.03] hover:border-cream/30 transition-colors duration-500"
          >
            Send the code
          </button>

          {error && (
            <p className="font-serif text-sm text-burgundy/70 italic">{error}</p>
          )}
        </form>
      </div>
    </main>
  )
}
