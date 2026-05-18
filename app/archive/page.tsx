import { Navigation } from '@/components/navigation'
import { ListeningLifeScreen } from '@/components/listening-life-screen'
import { ProtectedLayout } from '@/components/protected-layout'
import { listMyMoments } from '@/lib/actions/moments'
import { getMyArchiveSpan } from '@/lib/memory'
import { getSpokenResonances } from '@/lib/resonance'
import { getUserContinuity } from '@/lib/continuity'

export const metadata = {
  title: 'Your Listening Life | LongPlay',
  description: 'A private archive that grows as you listen.',
}

/**
 * /archive — the canonical entry point to the listener's archive.
 * Renders honest counters (real moment + reflection counts), the real
 * archive timespan (from the memory layer), plus directory links to
 * the two real archive surfaces:
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

  // Memory: real archive span (first/last moment, total, event count).
  // Soft-failing — the page renders honestly without the span if the
  // memory layer is unreachable.
  const archiveSpan = await getMyArchiveSpan().catch(() => undefined)

  // Resonance: things that keep returning across cycles. Empty array
  // for new users / weak evidence; the surface renders nothing in
  // that case.
  const resonances = await getSpokenResonances().catch(() => [])

  // Phase 5A continuity: the archive is one of the slowest surfaces
  // in the product — returning-after-absence is most felt here.
  const continuity = await getUserContinuity().catch(() => null)

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <ListeningLifeScreen
          totalMoments={totalMoments}
          reflectionCount={reflectionCount}
          archiveSpan={archiveSpan}
          resonances={resonances}
          continuityLine={continuity?.line ?? null}
        />
      </main>
    </ProtectedLayout>
  )
}
