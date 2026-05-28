/**
 * lib/ritual/observations.ts — Phase 6B.3
 *
 * Pure derivation helpers for the "This Week in the Room" ecology
 * panel. Takes raw timestamps + participation state arrays from
 * lib/data/ritual.ts and returns short observational strings that
 * read as editorial marginalia, not analytics.
 *
 * NEVER returns a sentence the underlying data can't justify.
 * Sample-size + signal-strength gates on every detection keep the
 * panel honest: small rooms produce few observations, large rooms
 * surface more. The empty room produces none.
 *
 * No fetch, no DB. Unit tested via scripts/test-ritual-observations.ts.
 */

import type { RitualParticipantState } from './types'

// ── Time-of-day bucket detection ──────────────────────────────────

export type TimeOfDayBucket =
  | 'late_night' // 00:00–05:59
  | 'morning'    // 06:00–11:59
  | 'afternoon'  // 12:00–17:59
  | 'evening'    // 18:00–23:59

/**
 * Map an ISO timestamp into its time-of-day bucket. UTC for now —
 * future phase can layer per-listener timezone if it becomes
 * worth the data plumbing. Returns null on malformed input.
 */
export function bucketHourOfDay(iso: string): TimeOfDayBucket | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const h = new Date(t).getUTCHours()
  if (h < 6) return 'late_night'
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

export interface TimeOfDayCluster {
  bucket: TimeOfDayBucket
  /** Fraction of sample sitting in the dominant bucket. [0..1]. */
  share: number
  /** Count of sample in the dominant bucket. */
  count: number
  /** Total non-null sample considered. */
  sample: number
}

/**
 * Detect whether a set of timestamps clusters into a single
 * time-of-day bucket. Returns the dominant bucket only when:
 *   - non-null sample size >= minSample
 *   - dominant bucket holds >= minShare of the sample
 *
 * Defaults are deliberately conservative — `minSample=5` means we
 * never report a cluster off two reflections. `minShare=0.5` means
 * the dominant bucket has to hold an outright majority, not just
 * lead by one count.
 */
export function detectTimeOfDayCluster(
  timestamps: ReadonlyArray<string>,
  options: { minSample?: number; minShare?: number } = {},
): TimeOfDayCluster | null {
  const minSample = options.minSample ?? 5
  const minShare = options.minShare ?? 0.5
  const counts: Record<TimeOfDayBucket, number> = {
    late_night: 0,
    morning: 0,
    afternoon: 0,
    evening: 0,
  }
  let sample = 0
  for (const iso of timestamps) {
    const b = bucketHourOfDay(iso)
    if (!b) continue
    counts[b] += 1
    sample += 1
  }
  if (sample < minSample) return null
  let best: TimeOfDayBucket = 'evening'
  for (const b of ['late_night', 'morning', 'afternoon', 'evening'] as const) {
    if (counts[b] > counts[best]) best = b
  }
  const share = counts[best] / sample
  if (share < minShare) return null
  return { bucket: best, share, count: counts[best], sample }
}

export function timeOfDayPhrase(bucket: TimeOfDayBucket): string {
  switch (bucket) {
    case 'late_night':
      return 'late at night'
    case 'morning':
      return 'in the morning'
    case 'afternoon':
      return 'in the afternoon'
    case 'evening':
      return 'in the evening'
  }
}

// ── Participation pacing ───────────────────────────────────────────

/**
 * Average time-to-complete in days across a cycle's participants.
 * Considers only participants who have a `completed_at` AND a
 * `joined_at`. Returns null when sample size < minSample (default 4).
 */
export function averageCompletionDays(
  participants: ReadonlyArray<{
    joined_at: string
    completed_at: string | null
  }>,
  minSample = 4,
): number | null {
  const deltas: number[] = []
  for (const p of participants) {
    if (!p.completed_at) continue
    const start = Date.parse(p.joined_at)
    const end = Date.parse(p.completed_at)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (end < start) continue
    deltas.push((end - start) / (24 * 60 * 60 * 1000))
  }
  if (deltas.length < minSample) return null
  const total = deltas.reduce((s, d) => s + d, 0)
  return total / deltas.length
}

// ── Cycle observations (composer) ─────────────────────────────────

export interface CycleObservationInput {
  cycle_number: number
  participants: ReadonlyArray<{
    joined_at: string
    completed_at: string | null
    reflected_at: string | null
    state: RitualParticipantState
  }>
  publishedReflections: ReadonlyArray<{ created_at: string }>
}

/**
 * Build the ordered list of observational sentences for one cycle.
 * Each detector is gated on its own sample-size threshold. Output
 * is intentionally short — three observations is the upper bound;
 * the empty room produces none.
 *
 * Sentences are editorial, not metric. They mirror the literary
 * voice the panel renders in: small-cap eyebrow, italic serif body.
 * The first observation is always the headline count when the room
 * has any participation at all; the rest only fire when the data
 * supports them.
 */
export function deriveCycleObservations(input: CycleObservationInput): string[] {
  const out: string[] = []
  const counts = participationCounts(input.participants)
  const publishedCount = input.publishedReflections.length

  // 1. Always-on count line. Suppresses entirely when no one's in
  //    the cycle — caller should hide the whole section in that case,
  //    but defending here keeps the function honest.
  if (counts.joined === 0) return out
  out.push(headlineCountLine(counts, publishedCount))

  // 2. Time-of-day cluster on published reflections.
  const reflectionCluster = detectTimeOfDayCluster(
    input.publishedReflections.map((r) => r.created_at),
    { minSample: 5, minShare: 0.5 },
  )
  if (reflectionCluster) {
    out.push(
      `Reflections tend to arrive ${timeOfDayPhrase(reflectionCluster.bucket)}.`,
    )
  }

  // 3. Pacing signal: slow vs quick listeners (only when enough
  //    sample to be meaningful).
  const avgDays = averageCompletionDays(input.participants, 4)
  if (avgDays !== null) {
    if (avgDays >= 4) {
      out.push('This room listens slowly.')
    } else if (avgDays < 1) {
      out.push('Many listeners finished in a single sitting.')
    }
  }

  return out
}

export interface ParticipationCounts {
  joined: number
  listening: number
  completed: number
  reflected: number
  withdrawn: number
}

export function participationCounts(
  participants: ReadonlyArray<{ state: RitualParticipantState }>,
): ParticipationCounts {
  const counts: ParticipationCounts = {
    joined: 0,
    listening: 0,
    completed: 0,
    reflected: 0,
    withdrawn: 0,
  }
  for (const p of participants) {
    counts[p.state] += 1
  }
  return counts
}

function headlineCountLine(
  counts: ParticipationCounts,
  publishedReflections: number,
): string {
  // Total non-withdrawn participants. We don't expose "joined" as a
  // raw number because it conflates with the `joined` state in the
  // state machine; "in this cycle" reads as the total membership.
  const inCycle =
    counts.joined +
    counts.listening +
    counts.completed +
    counts.reflected
  if (inCycle === 1) {
    return publishedReflections > 0
      ? `One listener is in this cycle — ${publishedReflections} reflection${publishedReflections === 1 ? '' : 's'} published so far.`
      : 'One listener is in this cycle so far.'
  }
  const parts: string[] = []
  parts.push(`${inCycle} listeners are in this cycle`)
  if (publishedReflections > 0) {
    parts.push(
      `${publishedReflections} reflection${publishedReflections === 1 ? '' : 's'} published`,
    )
  }
  if (counts.completed + counts.reflected > 0) {
    parts.push(`${counts.completed + counts.reflected} have completed`)
  }
  return parts.join(' · ') + '.'
}

// ── Relative time helpers (temporal feel) ─────────────────────────

/**
 * Human-relative "in N days" / "tomorrow" / "today" string for a
 * future ISO timestamp. Returns null when the target is in the past
 * or invalid. Resolution is calendar-day boundaries (UTC).
 *
 *   diff < 0           → null   (caller usually wants a different copy)
 *   diff = 0           → "today"
 *   diff = 1           → "tomorrow"
 *   2 <= diff <= 6     → "in 3 days" (etc)
 *   diff >= 7          → null   (let the caller fall back to the absolute date)
 */
export function relativeDaysUntil(
  targetIso: string,
  now: Date | string | number = Date.now(),
): string | null {
  const t = Date.parse(targetIso)
  if (!Number.isFinite(t)) return null
  const nowMs =
    now instanceof Date
      ? now.getTime()
      : typeof now === 'number'
        ? now
        : Date.parse(now)
  if (!Number.isFinite(nowMs)) return null
  // Calendar-day-aligned diff (UTC). 23:59 today → tomorrow = 1, not 0.
  const startOfTargetDay = Date.UTC(
    new Date(t).getUTCFullYear(),
    new Date(t).getUTCMonth(),
    new Date(t).getUTCDate(),
  )
  const startOfNowDay = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate(),
  )
  const diffDays = Math.round(
    (startOfTargetDay - startOfNowDay) / (24 * 60 * 60 * 1000),
  )
  if (diffDays < 0) return null
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays <= 6) return `in ${diffDays} days`
  return null
}
