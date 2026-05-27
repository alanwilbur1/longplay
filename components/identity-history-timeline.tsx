'use client'

import { useEffect, useState } from 'react'
import {
  readMyIdentityHistory,
  type IdentityHistoryEntry,
  type IdentityHistoryEnvelope,
} from '@/lib/actions/identity-history'
import {
  driftSummaryLines,
  windowDaysPhrase,
} from '@/lib/identity/drift-presentation'
import { relativeTimeAgo } from '@/lib/identity/presentation'

/**
 * IdentityHistoryTimeline — Phase 6A.9
 *
 * Renders the user's listening evolution as a restrained,
 * reverse-chronological timeline. Each row carries:
 *   - the snapshot's date (relative + absolute)
 *   - the primary archetype as it stood at that time
 *   - 1-3 grounded drift observations vs. the previous snapshot
 *   - never more than that
 *
 * Design rules:
 *   - Observational only. Sentences come from
 *     lib/identity/drift-presentation.ts; no AI prose.
 *   - Quiet typography — same restrained vocabulary as
 *     IdentityProfileScreen (cream/tobacco, serif headings,
 *     uppercase tracking for labels).
 *   - Empty / forming states say so honestly. We never fabricate
 *     evolution from a single data point.
 *
 * Drops into the /identity page below the main archetype display.
 * Renders nothing when the envelope is empty (fewer than 1 history
 * row exists — first sync hasn't produced one yet).
 */

export function IdentityHistoryTimeline() {
  const [envelope, setEnvelope] = useState<IdentityHistoryEnvelope | null>(null)

  useEffect(() => {
    let cancelled = false
    readMyIdentityHistory(20)
      .then((env) => {
        if (!cancelled) setEnvelope(env)
      })
      .catch(() => {
        if (!cancelled) setEnvelope(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!envelope) return null
  if (envelope.state === 'unauthenticated') return null
  if (envelope.state === 'empty') {
    return <EmptyTimeline />
  }
  return <ReadyTimeline entries={envelope.entries} />
}

function EmptyTimeline() {
  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">
          Listening evolution
        </h2>
        <p className="text-sm text-cream/60 leading-relaxed max-w-md mx-auto">
          Your timeline will fill in as listening accumulates. New
          entries land when there's a meaningful change in your
          identity — typically every week or so.
        </p>
      </div>
    </section>
  )
}

function ReadyTimeline({ entries }: { entries: IdentityHistoryEntry[] }) {
  // Single-entry timeline: not a real history yet, just the first
  // snapshot. Render a quiet "history forming" notice rather than a
  // misleading "you've always been this" timeline.
  if (entries.length === 1) {
    return (
      <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-6">
            Listening evolution
          </h2>
          <p className="text-sm text-cream/60 leading-relaxed max-w-md mx-auto">
            Your timeline is forming. A new entry appears here when
            your listening shifts in a meaningful way.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-10">
          Listening evolution
        </h2>
        <ol className="space-y-10 relative">
          {entries.map((entry, i) => (
            <TimelineRow
              key={entry.id}
              entry={entry}
              isFirst={i === 0}
              isLast={i === entries.length - 1}
            />
          ))}
        </ol>
      </div>
    </section>
  )
}

function TimelineRow({
  entry,
  isFirst,
  isLast,
}: {
  entry: IdentityHistoryEntry
  isFirst: boolean
  isLast: boolean
}) {
  const drift = entry.drift_summary
  const driftLines = drift ? driftSummaryLines(drift) : []
  const windowPhrase = drift ? windowDaysPhrase(drift.window_days) : null
  const dateLabel = isFirst ? 'Now' : relativeTimeAgo(entry.snapshot_at)
  return (
    <li className="relative pl-8">
      {/* Vertical rail */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[5px] top-3 bottom-[-2.5rem] w-px bg-border/20"
        />
      )}
      {/* Marker dot — slightly larger + tobacco for the current row */}
      <span
        aria-hidden="true"
        className={
          'absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border ' +
          (isFirst
            ? 'bg-tobacco border-tobacco'
            : 'bg-background border-border/40')
        }
      />
      <div className="flex items-baseline gap-3 mb-1 flex-wrap">
        <p className="text-[10px] uppercase tracking-[0.2em] text-tobacco/70">
          {dateLabel}
        </p>
        {windowPhrase && (
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
            {windowPhrase}
          </p>
        )}
      </div>
      <h3 className="font-serif text-lg md:text-xl text-cream leading-tight mb-2">
        {entry.primary_archetype_label ?? 'No archetype matched'}
      </h3>
      {driftLines.length > 0 ? (
        <ul className="space-y-1">
          {driftLines.map((line, j) => (
            <li
              key={j}
              className="text-sm text-cream/70 leading-relaxed"
            >
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          {isFirst
            ? 'Current identity, unchanged since last entry.'
            : 'No drift recorded for this entry.'}
        </p>
      )}
    </li>
  )
}
