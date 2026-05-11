import { Navigation } from '@/components/navigation'
import { RoomsScreen } from '@/components/rooms-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export const metadata = {
  title: 'Listening Rooms | LongPlay',
  description: 'Discover rooms for the kind of listener you are.',
}

export default function RoomsPage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen bg-background">
        <RoomsScreen />
      </main>
    </ProtectedLayout>
  )
}
