import { Navigation } from '@/components/navigation'
import { ListeningLifeScreen } from '@/components/listening-life-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { listMyMoments } from '@/lib/actions/moments'

export default async function ListeningLifePage() {
  let totalMoments = 0
  let reflectionCount = 0
  try {
    const result = await listMyMoments()
    if (result.success && result.data) {
      totalMoments = result.data.length
      reflectionCount = result.data.filter(m => m.type === 'reflection').length
    }
  } catch {
    // moments table not yet applied — page still renders with zero counts
  }

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <ListeningLifeScreen totalMoments={totalMoments} reflectionCount={reflectionCount} />
      </main>
    </ProtectedLayout>
  )
}
