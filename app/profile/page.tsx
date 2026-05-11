import { Navigation } from '@/components/navigation'
import { ProfileScreen } from '@/components/profile-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export const metadata = {
  title: 'Profile | LongPlay',
  description: 'Your LongPlay membership and settings.',
}

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
