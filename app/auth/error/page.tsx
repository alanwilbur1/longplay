import Link from 'next/link'

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8 text-center">
      <div className="max-w-sm animate-fade-in">
        <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-8">
          Authentication
        </p>

        <h1 className="font-serif text-3xl text-cream mb-6">
          Something went wrong
        </h1>

        <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-8" />

        <p className="text-muted-foreground leading-relaxed mb-8">
          The sign-in link may have expired or already been used.
          Links are valid for a single use.
        </p>

        <Link
          href="/"
          className="inline-block px-8 py-3 border border-cream/30 text-cream hover:bg-cream/5 transition-all duration-500 text-sm"
        >
          Return home
        </Link>
      </div>
    </div>
  )
}
