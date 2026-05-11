import { Navigation } from '@/components/navigation'
import { ShareScreen } from '@/components/share-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export const metadata = {
  title: 'Share Your Identity | LongPlay',
  description: 'Beautiful artifacts of your listening identity.',
}

export default function SharePage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen bg-background">
        <ShareScreen />
      </main>
    </ProtectedLayout>
  )
}
