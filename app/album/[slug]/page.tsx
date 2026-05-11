import { Navigation } from '@/components/navigation'
import { AlbumDetailScreen } from '@/components/album-detail-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export default function AlbumPage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <AlbumDetailScreen />
      </main>
    </ProtectedLayout>
  )
}
