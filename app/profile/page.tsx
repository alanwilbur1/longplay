import { Navigation } from '@/components/navigation'
import { ProfileScreen } from '@/components/profile-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export const metadata = {
  title: 'Profile | LongPlay',
  description: 'Your LongPlay membership and settings.',
}

// The profile surface is entirely user-specific (auth, listening
// connections, memberships, moments). It also reads ?connection=...
// from the URL via useSearchParams to show OAuth callback feedback,
// which forces Next out of static prerender. Explicit opt-out keeps
// the build deterministic.
export const dynamic = 'force-dynamic'

export default function ProfilePage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen bg-background">
        <ProfileScreen />
      </main>
    </ProtectedLayout>
  )
}
