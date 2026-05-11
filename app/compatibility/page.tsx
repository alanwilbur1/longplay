import { Navigation } from '@/components/navigation'
import { CompatibilityScreen } from '@/components/compatibility-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export default function CompatibilityPage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <CompatibilityScreen />
      </main>
    </ProtectedLayout>
  )
}
