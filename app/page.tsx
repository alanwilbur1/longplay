import { redirect } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { HomeScreen } from '@/components/home-screen'
import { PublicLanding } from '@/components/public-landing'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { listAllRooms } from '@/lib/data/rooms'
import { getMyMemberships } from '@/lib/actions/membership'
import { EDITORIAL_ROOMS, GENRE_ROOMS, CREATOR_ROOMS } from '@/lib/rooms'
import type { Room } from '@/lib/rooms'

/**
 * Root route.
 *
 * Three states based on the Supabase session + user_profiles row:
 *   1. signed-out          → PublicLanding (no app nav, two CTAs)
 *   2. signed-in, !onboarded → redirect to /onboarding
 *   3. signed-in, onboarded → app shell (Navigation + HomeScreen)
 *
 * Supabase session is the only identity source. localStorage plays no
 * role in this decision.
 */
export default async function HomePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ── 1. Signed out → public landing ────────────────────────────────────────
  if (!user) {
    return <PublicLanding />
  }

  // ── 2. Signed in but not onboarded → /onboarding ──────────────────────────
  // .maybeSingle() so a transient missing profile row (handle_new_user
  // trigger race) doesn't 406; treat null as "not onboarded yet".
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .maybeSingle()

  const onboardingCompleted = (profile as { onboarding_completed: boolean } | null)
    ?.onboarding_completed ?? false

  if (!onboardingCompleted) {
    redirect('/onboarding')
  }

  // ── 3. Signed in + onboarded → app shell ──────────────────────────────────
  let allRooms: Room[] = []
  try {
    allRooms = await listAllRooms()
    if (!allRooms.length) throw new Error('no data')
  } catch {
    allRooms = [...EDITORIAL_ROOMS, ...GENRE_ROOMS, ...CREATOR_ROOMS]
  }

  let joinedRooms: Room[] = []
  try {
    const memberships = await getMyMemberships()
    joinedRooms = memberships
      .map(m => allRooms.find(r => r.slug === m.roomSlug))
      .filter((r): r is Room => r !== undefined)
  } catch {
    // membership fetch failed — render with empty list
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <HomeScreen joinedRooms={joinedRooms} />
      </main>
    </>
  )
}
