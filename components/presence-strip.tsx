'use client'

/**
 * PresenceStrip — Phase 3B.1A ambient presence component.
 *
 * Tier semantics:
 *   invisible   → row removed from room_presence entirely
 *   counted     → row with visibility_tier='counted'  (in count, no face)
 *   identified  → row with visibility_tier='identified' (in count + face)
 *
 * Heartbeat is managed here instead of via usePresenceHeartbeat so:
 *   - The correct tier is sent on every beat
 *   - The heartbeat is a no-op when tier=invisible (prevents row re-creation)
 */

import { Fragment, useState, useEffect, useRef, useMemo } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { presenceCountLabel } from '@/lib/presence/count-language'
import { absenceFiller, sessionDurationLabel } from '@/lib/presence/atmosphere'
import {
  upsertPresence,
  removePresence,
  getPresenceSnapshotAction,
} from '@/lib/actions/presence'
import type { PresenceVisibility } from '@/lib/actions/presence'
import type { PresenceSnapshot, PresenceFace } from '@/lib/data/presence'
import { useAuth } from '@/components/auth-provider'

interface PresenceStripProps {
  cycleId: string
  initialSnapshot: PresenceSnapshot
  roomSlug: string
  className?: string
}

type Tier = 'invisible' | 'counted' | 'identified'

const TIERS: Tier[] = ['invisible', 'counted', 'identified']
const TIER_LABELS: Record<Tier, string> = {
  invisible: 'Invisible',
  counted: 'Counted',
  identified: 'Identified',
}

function tierToVisibility(tier: Tier): PresenceVisibility | null {
  if (tier === 'invisible') return null
  return tier as PresenceVisibility
}

const HEARTBEAT_MS = 30_000
const POLL_MS = 30_000
const DEV_MODE = process.env.NODE_ENV === 'development'

export function PresenceStrip({ cycleId, initialSnapshot, roomSlug, className }: PresenceStripProps) {
  const { user } = useAuth()
  const myId = user?.id ?? null

  const [snapshot, setSnapshot] = useState<PresenceSnapshot>(initialSnapshot)
  const [tier, setTier] = useState<Tier>('invisible')

  // Ref so heartbeat interval always reads latest tier without re-registering
  const tierRef = useRef<Tier>('invisible')

  // ── Self-only session duration ────────────────────────────────────
  // Tracks foreground time only. Pauses while the tab is hidden so the
  // line never lies about how long the listener has been present.
  // Never sent to the server; never persisted.
  const accumulatedMsRef = useRef(0)
  const lastVisibleAtRef = useRef<number | null>(null)
  const [sessionMinutes, setSessionMinutes] = useState(0)

  useEffect(() => {
    // Initialise the "visible since" marker on mount (client-only — avoids
    // SSR/hydration mismatch by deferring all timing math to useEffect).
    if (typeof document === 'undefined') return
    lastVisibleAtRef.current = document.hidden ? null : Date.now()

    const onVisibility = () => {
      if (document.hidden) {
        if (lastVisibleAtRef.current != null) {
          accumulatedMsRef.current += Date.now() - lastVisibleAtRef.current
          lastVisibleAtRef.current = null
        }
      } else if (lastVisibleAtRef.current == null) {
        lastVisibleAtRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    const tick = () => {
      const live = lastVisibleAtRef.current != null
        ? Date.now() - lastVisibleAtRef.current
        : 0
      const totalMs = accumulatedMsRef.current + live
      setSessionMinutes(Math.floor(totalMs / 60_000))
    }
    tick() // compute once after mount so SSR placeholder is replaced cleanly
    const minuteId = setInterval(tick, 60_000)

    return () => {
      clearInterval(minuteId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // ── Tier-aware heartbeat ──────────────────────────────────────
  // No-op when invisible — must not re-create a row that was removed.
  useEffect(() => {
    if (!cycleId) return

    const beat = () => {
      if (tierRef.current === 'invisible') return
      upsertPresence({
        cycleId,
        visibilityTier: tierToVisibility(tierRef.current),
      }).catch(() => {})
    }

    // Do NOT fire on mount — user starts invisible, nothing to write
    const heartbeatId = setInterval(beat, HEARTBEAT_MS)

    return () => {
      clearInterval(heartbeatId)
      // Best-effort removal on unmount regardless of tier
      removePresence(cycleId).catch(() => {})
    }
  }, [cycleId])

  // ── Snapshot polling ──────────────────────────────────────────
  useEffect(() => {
    if (!cycleId) return

    const pollId = setInterval(() => {
      getPresenceSnapshotAction(cycleId)
        .then(setSnapshot)
        .catch(() => {})
    }, POLL_MS)

    return () => clearInterval(pollId)
  }, [cycleId])

  // ── Tier change handler ───────────────────────────────────────
  const handleTierChange = (newTier: Tier) => {
    if (newTier === tier) return

    tierRef.current = newTier
    setTier(newTier)

    if (newTier === 'invisible') {
      // Optimistic: remove self from count and faces immediately
      setSnapshot(prev => ({
        presenceCount: Math.max(0, prev.presenceCount - 1),
        faces: myId ? prev.faces.filter(f => f.memberId !== myId) : prev.faces,
      }))
      // Remove row then confirm with a fresh snapshot
      removePresence(cycleId)
        .then(() => getPresenceSnapshotAction(cycleId))
        .then(setSnapshot)
        .catch(() => {})
    } else {
      // Upsert with new tier, confirm with a fresh snapshot
      upsertPresence({ cycleId, visibilityTier: tierToVisibility(newTier) })
        .then(() => getPresenceSnapshotAction(cycleId))
        .then(setSnapshot)
        .catch(() => {})
    }
  }

  const { presenceCount, faces } = snapshot

  // Stable signature so the face row only crossfades when the set of
  // identified members actually changes — not on every 30s poll.
  const facesSignature = useMemo(
    () => faces.slice(0, 8).map(f => f.memberId).sort().join(','),
    [faces],
  )

  // Variant is deterministic from (roomSlug, dayBucket): SSR HTML matches
  // the first client render, rotates once per local day.
  const fillerLine = useMemo(
    () => absenceFiller(roomSlug),
    [roomSlug],
  )

  const sessionLine = sessionDurationLabel(sessionMinutes)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>

      {/* Faces + count label — hidden when presenceCount = 0 */}
      {presenceCount > 0 && (
        <div
          className="flex items-center gap-2.5"
          aria-label={presenceCountLabel(presenceCount)}
        >
          {faces.length > 0 && (
            <div
              key={facesSignature}
              className="flex -space-x-1.5 presence-fade-in"
            >
              {faces.slice(0, 8).map(face => (
                <FaceAvatar key={face.memberId} face={face} />
              ))}
            </div>
          )}
          <span className="text-[10px] text-muted-foreground/40 tracking-wide leading-none">
            {presenceCountLabel(presenceCount)}
          </span>
        </div>
      )}

      {/* Curator-voiced absence filler — only when room is empty.
          Italic, low-contrast, restrained spacing. Replaces no copy — it
          fills the visual slot the count line would have occupied. */}
      {presenceCount === 0 && (
        <p className="text-[11px] italic text-muted-foreground/35 leading-snug max-w-[28ch]">
          {fillerLine}
        </p>
      )}

      {/* Tier control — always visible when strip is mounted */}
      <div className="flex items-center gap-1.5" aria-label="Presence visibility">
        {TIERS.map((t, i) => (
          <Fragment key={t}>
            {i > 0 && (
              <span className="text-[10px] text-muted-foreground/15 select-none">·</span>
            )}
            <button
              onClick={() => handleTierChange(t)}
              className={cn(
                'text-[10px] tracking-wide leading-none transition-colors',
                tier === t
                  ? 'text-muted-foreground/60'
                  : 'text-muted-foreground/20 hover:text-muted-foreground/40',
              )}
            >
              {TIER_LABELS[t]}
            </button>
          </Fragment>
        ))}
      </div>

      {/* Self-only reflective line — visible only to the current viewer.
          Computed entirely client-side from foreground-time accumulator;
          never sent to the server, never compared, never persisted. */}
      {sessionLine && (
        <p className="text-[10px] italic text-muted-foreground/25 tracking-wide leading-none mt-0.5">
          {sessionLine}
        </p>
      )}

      {/* Dev-only diagnostic */}
      {DEV_MODE && (
        <p className="text-[9px] font-mono text-muted-foreground/20 tracking-wider leading-none mt-0.5">
          presence cycleId={cycleId.slice(0, 8)}… count={presenceCount} tier={tier}
        </p>
      )}

    </div>
  )
}

function FaceAvatar({ face }: { face: PresenceFace }) {
  const initials = face.displayName
    .split(' ')
    .map(w => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      className="w-5 h-5 rounded-full border border-card bg-charcoal overflow-hidden flex items-center justify-center shrink-0"
      title={face.displayName}
    >
      {face.avatarUrl ? (
        <Image
          src={face.avatarUrl}
          alt={face.displayName}
          width={20}
          height={20}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-[8px] text-muted-foreground/60 font-mono leading-none">
          {initials}
        </span>
      )}
    </div>
  )
}
