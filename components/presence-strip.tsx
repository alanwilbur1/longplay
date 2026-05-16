'use client'

/**
 * PresenceStrip — Phase 3B.1A ambient presence component.
 *
 * Renders a small, atmospheric strip showing who else is listening
 * in this room's current cycle. The album is still protagonist;
 * presence is a whisper, not a notification.
 *
 * Behaviour:
 * - Mounts with server-fetched initialSnapshot
 * - Fires a heartbeat every 30 s (usePresenceHeartbeat)
 * - Polls for a fresh snapshot every 30 s (same rhythm as heartbeat)
 * - Renders nothing when count = 0
 * - Shows ≤ 8 identified faces as small initials / avatar circles
 * - Shows count label (exact ≤ 12, editorial above)
 */

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { usePresenceHeartbeat } from '@/lib/presence/heartbeat'
import { presenceCountLabel } from '@/lib/presence/count-language'
import { getPresenceSnapshotAction } from '@/lib/actions/presence'
import type { PresenceSnapshot, PresenceFace } from '@/lib/data/presence'

interface PresenceStripProps {
  cycleId: string
  initialSnapshot: PresenceSnapshot
  className?: string
}

const POLL_MS = 30_000

export function PresenceStrip({ cycleId, initialSnapshot, className }: PresenceStripProps) {
  const [snapshot, setSnapshot] = useState<PresenceSnapshot>(initialSnapshot)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Heartbeat: keeps this user's session alive
  usePresenceHeartbeat(cycleId)

  // Polling: refresh the snapshot every 30 s
  useEffect(() => {
    const refresh = () => {
      getPresenceSnapshotAction(cycleId)
        .then(setSnapshot)
        .catch(() => {}) // non-fatal — last snapshot stays visible
    }

    pollRef.current = setInterval(refresh, POLL_MS)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [cycleId])

  const { presenceCount, faces } = snapshot
  const label = presenceCountLabel(presenceCount)

  // Nothing to show
  if (presenceCount === 0) return null

  return (
    <div className={cn('flex items-center gap-2.5', className)} aria-label={label}>
      {/* Faces — identified listeners only (max 8) */}
      {faces.length > 0 && (
        <div className="flex -space-x-1.5">
          {faces.slice(0, 8).map(face => (
            <FaceAvatar key={face.memberId} face={face} />
          ))}
        </div>
      )}

      {/* Count label */}
      <span className="text-[10px] text-muted-foreground/40 tracking-wide leading-none">
        {label}
      </span>
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
