import { Navigation } from '@/components/navigation'
import { IdentityProfileScreen } from '@/components/identity-profile-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export default function IdentityPage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <IdentityProfileScreen />
      </main>
    </ProtectedLayout>
  )
}
