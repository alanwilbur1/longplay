/**
 * ProtectedLayout — kept as a thin wrapper so existing pages don't need
 * to be edited. Authentication gating now happens at the edge (proxy.ts),
 * which redirects unauthenticated visitors to /sign-in and signed-in
 * visitors away from /sign-in. The previous client-side gate added a
 * second decision layer with a different redirect target (/onboarding)
 * and a 3-second timeout that briefly allowed protected content to
 * render even before auth resolved — both behaviors are now removed.
 *
 * Onboarding-completion routing belongs to the specific surfaces that
 * care (the page that wraps the OnboardingScreen, the verifyCode action
 * after sign-in). Don't bring it back into a global wrapper.
 */
export function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
