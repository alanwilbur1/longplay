import { Navigation } from '@/components/navigation'
import { YearInReviewScreen } from '@/components/year-in-review-screen'
import { ProtectedLayout } from '@/components/protected-layout'

export const metadata = {
  title: '2026 Year In Review | LongPlay',
  description: 'A beautifully written personal essay about your listening year. Not Spotify Wrapped—a literary reflection on who you became through music.',
}

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
