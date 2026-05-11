import { OnboardingScreen } from '@/components/onboarding-screen'

export const metadata = {
  title: 'Welcome to LongPlay',
  description: 'Begin your listening identity journey.',
}

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-background">
      <OnboardingScreen />
    </main>
  )
}
