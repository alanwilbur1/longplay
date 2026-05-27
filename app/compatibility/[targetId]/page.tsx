import { Navigation } from '@/components/navigation'
import { ProtectedLayout } from '@/components/protected-layout'
import { CompatibilityDetailScreen } from '@/components/compatibility-detail-screen'

/**
 * /compatibility/[targetId] — Phase 6A.10
 *
 * Detail page for one (caller, target) pair. The screen reads the
 * compatibility envelope via the cookie-aware server action and
 * renders shared traits / genres / rooms / archetype alignment +
 * an explicit divergence section.
 */
export default async function CompatibilityTargetPage({
  params,
}: {
  params: Promise<{ targetId: string }>
}) {
  const { targetId } = await params
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <CompatibilityDetailScreen targetUserId={targetId} />
      </main>
    </ProtectedLayout>
  )
}
