import { Navigation } from '@/components/navigation'
import { ListeningAffinityScreen } from '@/components/listening-affinity-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export default function AffinityPage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <ListeningAffinityScreen />
      </main>
    </ProtectedLayout>
  )
}
