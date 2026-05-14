export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8 text-center">
      <div className="max-w-sm animate-fade-in">
        <p className="text-[10px] uppercase tracking-[0.5em] text-tobacco mb-8">
          Check your email
        </p>

        <h1 className="font-serif text-3xl text-cream mb-6">
          A link is on its way
        </h1>

        <div className="w-16 h-px bg-gradient-to-r from-transparent via-tobacco/30 to-transparent mx-auto mb-8" />

        <p className="text-muted-foreground leading-relaxed mb-4">
          We sent a sign-in link to your email address.
        </p>

        <p className="text-muted-foreground text-sm leading-relaxed">
          Click the link in that email and you will be brought back here with your identity saved.
        </p>

        <div className="mt-12 pt-8 border-t border-border/20">
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            No email? Check your spam folder.
          </p>
        </div>
      </div>
    </div>
  )
}
