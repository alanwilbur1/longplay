'use client'

/**
 * MomentsArchive — client component for /archive/moments.
 * Renders the current user's moments with type-filter tabs.
 * No feed behaviour: owner-only, private by default.
 */

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function MomentsArchive({ moments }: MomentsArchiveProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')

  // Empty / not-yet-seeded state
  if (!moments || moments.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif text-xl text-cream/40 mb-4">No moments yet.</p>
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
              onClick={() => setActiveFilter(tab.key)}
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
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground/40 py-8">
          No {activeFilter} moments yet.
        </p>
      ) : (
        <div className="space-y-px">
          {filtered.map(moment => (
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
                  <p className="text-[11px] text-muted-foreground/40 font-mono truncate">
                    {moment.albumId}
                  </p>
                </div>

                {/* Center: content */}
                <div className="flex-1 min-w-0">
                  {moment.content && moment.content !== '✓' && moment.content !== '⭐ saved' ? (
                    <p className="font-serif text-cream/80 leading-relaxed line-clamp-3">
                      {moment.content}
                    </p>
                  ) : (
                    <p className="text-muted-foreground/30 italic text-sm">
                      {moment.type === 'mark' ? 'Marked' : 'Saved'}
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
          ))}
        </div>
      )}
    </div>
  )
}
