'use client'

/**
 * PresenceStrip — Phase 3B.1A ambient presence component.
 *
 * Renders the visibility tier control (always, when cycleId is present)
 * and — when presenceCount > 0 — the faces + count label.
 *
 * Tier control: Invisible · Counted · Identified
 *   Invisible   → visibility_tier = null  (not counted, not shown)
 *   Counted     → visibility_tier = 'counted'  (counted, no face)
 *   Identified  → visibility_tier = 'identified' (counted + face)
 *
 * Heartbeat is managed here (not via usePresenceHeartbeat) so the
 * correct tier is sent on every beat. usePresenceHeartbeat always
 * sends tier=null and would override the user's choice every 30 s.
 */

import { Fragment, useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { presenceCountLabel } from '@/lib/presence/count-language'
import {
  upsertPresence,
  removePresence,
  getPresenceSnapshotAction,
} from '@/lib/actions/presence'
import type { PresenceVisibility } from '@/lib/actions/presence'
import type { PresenceSnapshot, PresenceFace } from '@/lib/data/presence'

interface PresenceStripProps {
  cycleId: string
  initialSnapshot: PresenceSnapshot
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

export function PresenceStrip({ cycleId, initialSnapshot, className }: PresenceStripProps) {
  const [snapshot, setSnapshot] = useState<PresenceSnapshot>(initialSnapshot)
  const [tier, setTier] = useState<Tier>('invisible')

  // Use a ref so the heartbeat interval always reads the latest tier
  // without needing to be re-registered on every tier change.
  const tierRef = useRef<Tier>('invisible')

  // ── Tier-aware heartbeat ──────────────────────────────────────
  // Replaces usePresenceHeartbeat so the correct visibility_tier is
  // sent on every beat. usePresenceHeartbeat always sends null tier.
  useEffect(() => {
    if (!cycleId) return

    const beat = () => {
      upsertPresence({
        cycleId,
        visibilityTier: tierToVisibility(tierRef.current),
      }).catch(() => {})
    }

    beat() // immediate on mount

    const heartbeatId = setInterval(beat, HEARTBEAT_MS)

    return () => {
      clearInterval(heartbeatId)
      removePresence(cycleId).catch(() => {})
    }
  }, [cycleId])

  // ── Snapshot polling ──────────────────────────────────────────
  useEffect(() => {
    if (!cycleId) return

    const refresh = () => {
      getPresenceSnapshotAction(cycleId)
        .then(setSnapshot)
        .catch(() => {})
    }

    const pollId = setInterval(refresh, POLL_MS)
    return () => clearInterval(pollId)
  }, [cycleId])

  // ── Tier change handler ───────────────────────────────────────
  const handleTierChange = (newTier: Tier) => {
    tierRef.current = newTier
    setTier(newTier)
    // Fire immediately — don't wait for the next heartbeat beat
    upsertPresence({
      cycleId,
      visibilityTier: tierToVisibility(newTier),
    }).catch(() => {})
  }

  const { presenceCount, faces } = snapshot

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>

      {/* Faces + count label — hidden when presenceCount = 0 */}
      {presenceCount > 0 && (
        <div
          className="flex items-center gap-2.5"
          aria-label={presenceCountLabel(presenceCount)}
        >
          {faces.length > 0 && (
            <div className="flex -space-x-1.5">
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
