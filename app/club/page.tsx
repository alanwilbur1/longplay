import { Navigation } from '@/components/navigation'
import { ListeningClubScreen } from '@/components/listening-club-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export default function ClubPage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <ListeningClubScreen />
      </main>
    </ProtectedLayout>
  )
}
