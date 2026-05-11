import { Navigation } from '@/components/navigation'
import { MembershipScreen } from '@/components/membership-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export const metadata = {
  title: 'Membership | LongPlay',
  description: 'Support a culture of intentional listening. Join as a Member or Patron.',
}

export default function MembershipPage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <MembershipScreen />
      </main>
    </ProtectedLayout>
  )
}
