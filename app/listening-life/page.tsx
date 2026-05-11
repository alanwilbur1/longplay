import { Navigation } from '@/components/navigation'
import { ListeningLifeScreen } from '@/components/listening-life-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export default function ListeningLifePage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <ListeningLifeScreen />
      </main>
    </ProtectedLayout>
  )
}
