'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { listMySharedRoomPeers } from '@/lib/actions/compatibility'

/**
 * CompatibilityScreen — Phase 6A.10 (rewrite)
 *
 * Index page for the /compatibility surface. Lists peers the caller
 * shares at least one joined room with, sorted by shared-room count.
 *
 * Why shared-room peers and not a follower/friend graph: LongPlay
 * has no social/follower system (deliberate). Joined rooms are the
 * only existing co-presence signal — a peer who joined the same
 * room is a meaningful candidate for compatibility comparison
 * without inventing a social product.
 *
 * Tone constraints (Phase 6A.10):
 *   - No leaderboard, no "top friends".
 *   - No vanity metrics in the list rows. Just "you've both been in
 *     N rooms" as a quiet count.
 *   - Empty state: honest about why the list is empty (no joined
 *     rooms yet → no peers visible).
 *
 * Each row links to /compatibility/[user_id] for the full envelope.
 * The detail page recomputes/caches lazily on first view.
 *
 * Replaces the previous demo screen entirely. No hardcoded archetype
 * pairs, no fabricated "you and Jamie share late-night listening"
 * copy.
 */

export function CompatibilityScreen() {
  const [peers, setPeers] = useState<
    { user_id: string; shared_room_count: number }[] | null
  >(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listMySharedRoomPeers(20)
      .then((rows) => {
        if (!cancelled) setPeers(rows)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="grain relative pb-32 md:pb-16 md:pt-24">
      <section className="px-6 pt-16 pb-12 md:px-12 lg:px-24">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl md:text-5xl text-cream mb-6 leading-tight">
            Listening compatibility
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Listeners you share rooms with. Each entry opens a deeper
            look at where your listening overlaps and where it diverges.
          </p>
        </div>
      </section>

      <section className="px-6 py-8 md:px-12 lg:px-24 border-t border-border/15">
        {error ? (
          <ErrorState message={error} />
        ) : peers === null ? (
          <LoadingState />
        ) : peers.length === 0 ? (
          <EmptyState />
        ) : (
          <PeerList peers={peers} />
        )}
      </section>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="max-w-2xl">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground animate-fade-in">
        Loading…
      </p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs uppercase tracking-[0.2em] text-burgundy mb-2">
        Couldn&apos;t load peers
      </p>
      <p className="text-sm text-cream/70">{message}</p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="max-w-2xl">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
        No shared rooms yet
      </p>
      <p className="text-sm text-cream/70 leading-relaxed mb-6 max-w-md">
        Compatibility surfaces here once you&apos;ve joined a room with
        someone else. Find a room that resonates, and listeners who
        share it will appear in this list.
      </p>
      <Link
        href="/rooms"
        className="inline-flex items-center gap-2 text-sm text-tobacco hover:text-cream transition-colors duration-500 border-b border-tobacco/30 pb-1"
      >
        <span>Browse listening rooms</span>
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  )
}

function PeerList({
  peers,
}: {
  peers: { user_id: string; shared_room_count: number }[]
}) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">
        Listeners you share rooms with
      </h2>
      <ul className="space-y-3">
        {peers.map((p) => (
          <li key={p.user_id}>
            <Link
              href={`/compatibility/${p.user_id}`}
              className="group flex items-baseline gap-4 border-b border-border/10 hover:border-border/40 pb-3 last:border-0 transition-colors duration-500"
            >
              <span className="font-serif text-base text-cream group-hover:text-cream/80 transition-colors duration-500 flex-1 truncate">
                Listener {p.user_id.slice(0, 8)}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {p.shared_room_count} shared room
                {p.shared_room_count === 1 ? '' : 's'}
              </span>
              <span className="text-xs text-tobacco shrink-0">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
