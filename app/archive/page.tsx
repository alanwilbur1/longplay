import { Navigation } from '@/components/navigation'
import { ListeningLifeScreen } from '@/components/listening-life-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { listMyMoments } from '@/lib/actions/moments'

export const metadata = {
  title: 'Your Listening Life | LongPlay',
  description: 'A private archive that grows as you listen.',
}

/**
 * /archive — the canonical entry point to the listener's archive.
 * Renders honest counters (real moment + reflection counts) plus
 * directory links to the two real archive surfaces:
 *   - /archive/moments   (per-user moments)
 *   - /archive/cycles    (past cycles)
 *
 * /listening-life still exists and renders the same surface for now;
 * it should be considered the legacy alias of this canonical URL.
 */
export default async function ArchivePage() {
  let totalMoments = 0
  let reflectionCount = 0
  try {
    const result = await listMyMoments()
    if (result.success && result.data) {
      totalMoments = result.data.length
      reflectionCount = result.data.filter(m => m.type === 'reflection').length
    }
  } catch {
    // moments table not yet reachable — surface still renders with zeros
  }

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <ListeningLifeScreen
          totalMoments={totalMoments}
          reflectionCount={reflectionCount}
        />
      </main>
    </ProtectedLayout>
  )
}
