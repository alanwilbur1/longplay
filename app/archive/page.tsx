import { Navigation } from '@/components/navigation'
import { ListeningLifeScreen } from '@/components/listening-life-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export const metadata = {
  title: 'Your Listening Life | LongPlay',
  description: 'A lifelong emotional archive. Not statistics—a private museum of who you became through the music that accompanied you.',
}

export default function ArchivePage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <ListeningLifeScreen />
      </main>
    </ProtectedLayout>
  )
}
