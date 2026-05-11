import { Metadata } from 'next'
import { RoomsScreen } from '@/components/rooms-screen'
import { Navigation } from '@/components/navigation'
import { ProtectedLayout } from '@/components/protected-layout'

export const metadata: Metadata = {
  title: 'Listening Clubs | LongPlay',
  description: 'Find your listening communities. Curated clubs for every kind of listener.',
}

export default function ClubsPage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="pt-0 md:pt-16">
        <RoomsScreen />
      </main>
    </ProtectedLayout>
  )
}
