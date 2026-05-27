'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  readRoomAdjacency,
  readRoomEcology,
  type AdjacentRoomEntry,
  type RoomEcologyEnvelope,
} from '@/lib/actions/room-ecology'
import { adjacencyBandLabel } from '@/lib/ecology/computation'
import { TRAIT_DISPLAY, relativeTimeAgo } from '@/lib/identity/presentation'
import type { TraitKey } from '@/lib/identity/traits'

/**
 * RoomEcologySection — Phase 6A.11
 *
 * Renders the room's current ecology snapshot + top adjacent rooms.
 * Drops into the room detail page. Auto-hides when no snapshot is
 * available yet (new room, first cron tick pending) — never
 * fabricates ecology.
 *
 * Design rules:
 *   - Restrained typography. Lists, not dashboards.
 *   - Qualitative bands and modal-band-with-share, never raw
 *     percentages presented as precision.
 *   - Honest fallback when active_listener_count < a minimum
 *     threshold ("Ecology forming") — same posture as the identity
 *     forming state from Phase 6A.7.
 *   - Adjacency section only renders when ≥1 adjacent room exists.
 */

interface Props {
  roomSlug: string
}

const MIN_ACTIVE_FOR_DISPLAY = 3

export function RoomEcologySection({ roomSlug }: Props) {
  const [ecology, setEcology] = useState<RoomEcologyEnvelope | null>(null)
  const [adjacency, setAdjacency] = useState<AdjacentRoomEntry[] | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([readRoomEcology(roomSlug), readRoomAdjacency(roomSlug, 4)])
      .then(([eco, adj]) => {
        if (cancelled) return
        setEcology(eco)
        setAdjacency(adj)
      })
      .catch(() => {
        if (cancelled) return
        setEcology({ state: 'unknown_room' })
        setAdjacency([])
      })
    return () => {
      cancelled = true
    }
  }, [roomSlug])

  if (!ecology || adjacency === null) return null
  if (ecology.state === 'unknown_room') return null

  return (
    <>
      <EcologyBlock ecology={ecology} />
      {adjacency.length > 0 && <AdjacencyBlock entries={adjacency} />}
    </>
  )
}

function EcologyBlock({ ecology }: { ecology: RoomEcologyEnvelope }) {
  if (ecology.state === 'forming') {
    return (
      <section className="px-6 py-12 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
            Room ecology
          </h2>
          <p className="text-sm text-cream/60 leading-relaxed max-w-md">
            Ecology forming. The first portrait of who listens here
            arrives on the next ecology recompute.
          </p>
        </div>
      </section>
    )
  }

  const active = ecology.active_listener_count ?? 0
  if (active < MIN_ACTIVE_FOR_DISPLAY) {
    return (
      <section className="px-6 py-12 md:px-12 lg:px-24 border-t border-border/10">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
            Room ecology
          </h2>
          <p className="text-sm text-cream/60 leading-relaxed max-w-md">
            Not enough resonant listeners yet to characterize this
            room. The portrait fills in as more listeners join its
            orbit.
          </p>
        </div>
      </section>
    )
  }

  const dominantArchetypes = ecology.dominant_archetypes ?? []
  const dominantTraits = ecology.dominant_traits ?? {}
  const dominantGenres = ecology.dominant_genres ?? []
  const drift = ecology.drift_summary

  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-baseline justify-between gap-4 mb-10 flex-wrap">
          <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Room ecology
          </h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-tobacco/70">
            {active} resonant listener{active === 1 ? '' : 's'}
          </p>
        </div>

        {dominantArchetypes.length > 0 && (
          <div className="mb-10">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 mb-4">
              Who listens here
            </p>
            <ul className="space-y-2">
              {dominantArchetypes.slice(0, 4).map((a) => (
                <li
                  key={a.archetype_key}
                  className="flex items-baseline gap-3 border-b border-border/10 pb-2 last:border-0"
                >
                  <span className="font-serif text-sm text-cream flex-1">
                    {a.archetype_label}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {Math.round(a.share * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Object.keys(dominantTraits).length > 0 && (
          <div className="mb-10">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 mb-4">
              Listening posture
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3">
              {Object.entries(dominantTraits).map(([key, t]) => {
                if (!t) return null
                const display = TRAIT_DISPLAY[key as TraitKey]
                if (!display) return null
                return (
                  <div
                    key={key}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="text-sm text-cream">{display.label}</span>
                    <span className="text-xs uppercase tracking-[0.15em] text-tobacco/70">
                      leans {t.modal_band}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {dominantGenres.length > 0 && (
          <div className="mb-10">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 mb-4">
              Genre gravity
            </p>
            <ul className="flex flex-wrap gap-2">
              {dominantGenres.slice(0, 8).map((g) => (
                <li
                  key={g.genre}
                  className="text-xs uppercase tracking-[0.15em] text-tobacco/80 border border-tobacco/20 px-3 py-1"
                >
                  {g.genre}
                </li>
              ))}
            </ul>
          </div>
        )}

        {drift && drift.has_meaningful_change && <DriftBlock drift={drift} />}

        {ecology.snapshot_at && (
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
            Updated {relativeTimeAgo(ecology.snapshot_at)}
          </p>
        )}
      </div>
    </section>
  )
}

function DriftBlock({
  drift,
}: {
  drift: NonNullable<RoomEcologyEnvelope['drift_summary']>
}) {
  const lines: string[] = []
  for (const s of drift.archetype_shifts.slice(0, 2)) {
    if (s.delta > 0) {
      lines.push(`${s.archetype_label} listeners increased here.`)
    } else {
      lines.push(`${s.archetype_label} listeners eased here.`)
    }
  }
  for (const t of drift.trait_modal_shifts.slice(0, 2)) {
    const display = TRAIT_DISPLAY[t.trait_key]
    if (!display) continue
    if (lines.length >= 3) break
    lines.push(
      `${display.label} now leans ${t.curr_modal} (was ${t.prev_modal}).`,
    )
  }
  for (const g of drift.emerging_genres.slice(0, 1)) {
    if (lines.length >= 3) break
    lines.push(`${g.genre} entered the room's genre gravity.`)
  }
  if (lines.length === 0) return null
  return (
    <div className="mb-10">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 mb-4">
        Recent shift
      </p>
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="text-sm text-cream/70 leading-relaxed">
            {l}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AdjacencyBlock({ entries }: { entries: AdjacentRoomEntry[] }) {
  return (
    <section className="px-6 py-16 md:py-20 md:px-12 lg:px-24 border-t border-border/10 bg-card/20">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-8">
          Adjacent rooms
        </h2>
        <ul className="space-y-4">
          {entries.map((e) => (
            <li key={e.room_id}>
              {e.slug ? (
                <Link
                  href={`/rooms/${e.slug}`}
                  className="group flex items-baseline gap-4 border-b border-border/10 hover:border-border/40 pb-3 last:border-0 transition-colors duration-500"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-serif text-base text-cream group-hover:text-cream/80 transition-colors duration-500">
                      {e.name ?? e.slug}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 mt-1">
                      {adjacencyBandLabel(e.band)}
                      {e.listener_overlap_count > 0 && (
                        <>
                          {' · '}
                          {e.listener_overlap_count} shared listener
                          {e.listener_overlap_count === 1 ? '' : 's'}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-xs text-tobacco shrink-0">→</span>
                </Link>
              ) : (
                <div className="flex items-baseline gap-4 border-b border-border/10 pb-3 last:border-0">
                  <span className="font-serif text-base text-cream flex-1">
                    {e.name ?? e.room_id}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
