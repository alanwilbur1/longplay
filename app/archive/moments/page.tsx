import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { ProtectedLayout } from '@/components/protected-layout'
import { MomentsArchive } from '@/components/moments-archive'
import { getMyArchiveMoments } from '@/lib/data/moments'

export const metadata = {
  title: 'My Moments | LongPlay',
  description: 'Your private archive of marked, annotated, and saved moments.',
}

export default async function MomentsArchivePage() {
  let moments = undefined
  try {
    const dbMoments = await getMyArchiveMoments()
    moments = dbMoments
  } catch {
    // DB not yet applied — MomentsArchive shows empty state
    if (process.env.NODE_ENV === 'development') {
      console.warn('[/archive/moments] moments table not reachable — showing empty state')
    }
  }

  return (
    <ProtectedLayout>
      <Navigation />
      <main className="min-h-screen pb-20 md:pb-0 md:pt-16">
        <div className="px-6 pt-8 pb-20 md:px-12 lg:px-24 max-w-4xl mx-auto">

          {/* Header */}
          <div className="mb-12">
            <Link
              href="/archive"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-cream transition-colors mb-8"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <span>Archive</span>
            </Link>

            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 mb-3">
              Archive
            </p>
            <h1 className="font-serif text-4xl md:text-5xl text-cream mb-4 tracking-tight">
              My Moments
            </h1>
            <p className="text-muted-foreground/60 text-lg font-serif">
              Everything you&apos;ve marked, annotated, reflected on, and saved. Private by default.
            </p>
          </div>

          <MomentsArchive moments={moments} />
        </div>
      </main>
    </ProtectedLayout>
  )
}
