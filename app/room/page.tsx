import { Navigation } from '@/components/navigation'
import { ListeningRoomScreen } from '@/components/listening-room-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export default function RoomPage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <ListeningRoomScreen />
      </main>
    </ProtectedLayout>
  )
}
