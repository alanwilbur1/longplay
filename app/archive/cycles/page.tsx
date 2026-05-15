import { Navigation } from '@/components/navigation'
import { PastCyclesArchive } from '@/components/past-cycles-archive'
import { ProtectedLayout } from '@/components/protected-layout'
import { getPastCycles } from '@/lib/data/cycles'

export const metadata = {
  title: 'Past Cycles | LongPlay',
  description:
    'Your archive of previous listening cycles. Each cycle is a preserved cultural artifact—a chapter in your listening life.',
}

export default async function CyclesArchivePage() {
  // Attempt to load archived cycles from DB; component falls back to static PAST_CYCLES if empty.
  let pastCycles = undefined
  try {
    const dbCycles = await getPastCycles()
    if (dbCycles.length > 0) pastCycles = dbCycles
  } catch {
    // DB not seeded yet — PastCyclesArchive uses static fallback
  }

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <PastCyclesArchive pastCycles={pastCycles} />
      </main>
    </ProtectedLayout>
  )
}
