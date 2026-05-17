'use client'

/**
 * MomentsArchive — client component for /archive/moments (hardened).
 * Renders the current user's moments with type-filter tabs and load-more pagination.
 * Shows album title/artist instead of raw slug where available.
 * No feed behaviour: owner-only, private by default.
 */

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getAlbumById } from '@/lib/albums'
import { useRitualPhase, emptyStateLine } from '@/lib/cadence'
import type { Moment, MomentType } from '@/lib/actions/moments'

interface MomentsArchiveProps {
  moments?: Moment[]
}

const TYPE_LABELS: Record<MomentType, string> = {
  mark: 'Mark',
  annotation: 'Annotation',
  reflection: 'Reflection',
  prompt_response: 'Prompt',
  rating: 'Rating',
  reply: 'Reply',
  save: 'Save',
}

const VISIBILITY_LABELS: Record<Moment['visibility'], string> = {
  private: 'Private',
  club: 'Club',
  connection: 'Connection',
  public: 'Public',
}

type FilterTab = 'all' | MomentType

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mark', label: 'Marks' },
  { key: 'annotation', label: 'Annotations' },
  { key: 'reflection', label: 'Reflections' },
  { key: 'save', label: 'Saves' },
]

const PAGE_SIZE = 20

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Resolve album slug to display label e.g. "For Emma, Forever Ago — Bon Iver" */
function resolveAlbum(albumId: string): { title: string; artist: string } | null {
  const album = getAlbumById(albumId)
  return album ? { title: album.title, artist: album.artist } : null
}

export function MomentsArchive({ moments }: MomentsArchiveProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const ritualPhase = useRitualPhase()

  // Empty / not-yet-seeded state
  if (!moments || moments.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif text-xl text-cream/40 mb-4">
          {ritualPhase
            ? emptyStateLine('no-moments-archive', ritualPhase.phase)
            : 'No moments yet.'}
        </p>
        <p className="text-sm text-muted-foreground/40 max-w-sm mx-auto mb-8">
          Moments you mark, annotate, reflect on, or save while listening will appear here.
          They are private by default — only you can see them.
        </p>
        {!moments && (
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/30 mb-6">
            Apply lib/schema-phase3a-moments.sql in Supabase to enable moments.
          </p>
        )}
        <Link
          href="/rooms"
          className="text-xs uppercase tracking-[0.3em] text-tobacco hover:text-cream transition-colors"
        >
          Go to Rooms
        </Link>
      </div>
    )
  }

  const filtered = activeFilter === 'all'
    ? moments
    : moments.filter(m => m.type === activeFilter)

  const visible = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  // Reset page when filter changes
  const handleFilterChange = (tab: FilterTab) => {
    setActiveFilter(tab)
    setVisibleCount(PAGE_SIZE)
  }

  return (
    <div>
      {/* Summary */}
      <p className="text-sm text-muted-foreground/50 mb-8">
        {moments.length} moment{moments.length !== 1 ? 's' : ''} across all albums
      </p>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border/10 mb-10">
        {FILTER_TABS.map(tab => {
          const count = tab.key === 'all'
            ? moments.length
            : moments.filter(m => m.type === tab.key).length
          if (count === 0 && tab.key !== 'all') return null
          return (
            <button
              key={tab.key}
              onClick={() => handleFilterChange(tab.key)}
              className={cn(
                'px-4 py-2 text-[11px] uppercase tracking-[0.3em] transition-colors duration-300',
                activeFilter === tab.key
                  ? 'text-tobacco border-b border-tobacco -mb-px'
                  : 'text-muted-foreground/40 hover:text-muted-foreground/70'
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 text-muted-foreground/30">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Moment list */}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground/40 py-8">
          No {activeFilter} moments yet.
        </p>
      ) : (
        <div className="space-y-px">
          {visible.map(moment => {
            const album = resolveAlbum(moment.albumId)
            return (
              <div
                key={moment.id}
                className="group py-5 border-b border-border/10 hover:border-border/20 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-6">
                  {/* Left: type + album */}
                  <div className="md:w-48 shrink-0">
                    <span className={cn(
                      'inline-block text-[10px] uppercase tracking-[0.25em] px-2 py-0.5 border mb-2',
                      moment.type === 'mark' && 'border-tobacco/30 text-tobacco',
                      moment.type === 'annotation' && 'border-burgundy/30 text-burgundy',
                      moment.type === 'reflection' && 'border-olive/30 text-olive',
                      moment.type === 'save' && 'border-navy/50 text-cream/50',
                      !['mark', 'annotation', 'reflection', 'save'].includes(moment.type) &&
                        'border-border/30 text-muted-foreground/50'
                    )}>
                      {TYPE_LABELS[moment.type]}
                    </span>
                    {album ? (
                      <div>
                        <p className="text-[11px] text-muted-foreground/60 leading-tight">
                          {album.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground/30 mt-0.5">
                          {album.artist}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/30 font-mono truncate">
                        {moment.albumId}
                      </p>
                    )}
                  </div>

                  {/* Center: content */}
                  <div className="flex-1 min-w-0">
                    {moment.content && moment.content !== '✓' && moment.content !== '⭐ saved' ? (
                      <p className="font-serif text-cream/80 leading-relaxed break-words whitespace-pre-wrap">
                        {moment.content}
                      </p>
                    ) : (
                      <p className="text-muted-foreground/30 italic text-sm">
                        {moment.type === 'mark' ? 'Marked' : 'Saved'}
                      </p>
                    )}
                    {moment.trackId && (
                      <p className="text-[10px] text-muted-foreground/30 mt-1 font-mono">
                        track {moment.trackId}
                      </p>
                    )}
                    {moment.parentMomentId && (
                      <p className="text-[10px] text-muted-foreground/30 mt-1">
                        ↱ branch of earlier moment
                      </p>
                    )}
                  </div>

                  {/* Right: meta */}
                  <div className="md:text-right shrink-0">
                    <p className="text-[10px] text-muted-foreground/40 mb-1">
                      {formatDate(moment.createdAt)}
                    </p>
                    {moment.createdLocalTime && (
                      <p className="text-[10px] text-muted-foreground/25 mb-1 font-mono">
                        {moment.createdLocalTime}
                      </p>
                    )}
                    <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/30">
                      {VISIBILITY_LABELS[moment.visibility]}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-10 text-center">
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="text-xs uppercase tracking-[0.3em] text-tobacco hover:text-cream transition-colors border border-tobacco/20 hover:border-tobacco/50 px-6 py-3"
          >
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
