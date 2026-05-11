import { Navigation } from '@/components/navigation'
import { YearInReviewScreen } from '@/components/year-in-review-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export default function YearInReviewPage() {
  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <YearInReviewScreen />
      </main>
    </ProtectedLayout>
  )
}
