import { Navigation } from '@/components/navigation'
import { PastCyclesArchive } from '@/components/past-cycles-archive'
import { ProtectedLayout } from '@/components/protected-layout'

export const metadata = {
  title: 'Past Cycles | LongPlay',
  description: 'Your archive of previous listening cycles. Each cycle is a preserved cultural artifact—a chapter in your listening life.',
}

export default function CyclesArchivePage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <PastCyclesArchive />
      </main>
    </ProtectedLayout>
  )
}
