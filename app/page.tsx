import { Navigation } from '@/components/navigation'
import { HomeScreen } from '@/components/home-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export default function HomePage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <HomeScreen />
      </main>
    </ProtectedLayout>
  )
}
