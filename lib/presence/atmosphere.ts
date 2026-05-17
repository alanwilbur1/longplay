/**
 * lib/presence/atmosphere.ts — Phase 3B.1B
 *
 * Pure helpers for the atmospheric layer above the 3B.1A presence substrate.
 * No React, no DOM, no API calls. SSR-safe. Deterministic.
 *
 * Surfaces supported:
 *   1. absenceFiller          — curator-voiced line when presenceCount === 0
 *   2. cyclePhaseModulationClass — CSS class hint for the room container
 *   3. sessionDurationLabel   — self-only literary timer copy
 */

// ── Deterministic variant selection ──────────────────────────────────────
// Stable across SSR/hydration when given the same inputs. Daily rotation
// keeps a returning member from seeing the same line twice in a row.

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return h >>> 0
}

function pickVariant<T>(variants: readonly T[], seed: string): T {
  return variants[hashSeed(seed) % variants.length]
}

function dayBucket(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
}

// ── Absence filler ───────────────────────────────────────────────────────
// Triggered when presenceCount === 0. One subtle line, curator-voiced,
// per-room when authored, falling back to a neutral pool. Never imperative,
// never second-person, never marketing.

const DEFAULT_FILLERS = [
  'The room is quiet, but not empty.',
  'Some records wait longer before they open.',
  'The album waits, indifferent to the hour.',
  'No one has arrived yet. The album is still here.',
] as const

const PER_ROOM_FILLERS: Record<string, readonly string[]> = {
  'nocturnal-room': [
    'Tonight the room is holding its breath.',
    'Late hours. Some records keep their own time.',
    'The room is quiet, but the night is long.',
    'No one has spoken yet. The album is patient.',
  ],
  'cathedral-hour': [
    'The room is empty in the way a chapel is empty.',
    'Reverence does not require an audience.',
    'Some records wait longer before they open.',
    'The room is still. The album is patient.',
  ],
  'analog-futures': [
    'The hum of the tape, and no one to hear it.',
    'Some records are meant to be heard alone first.',
    'The room is quiet — the warmth is still here.',
  ],
  'beautiful-damage': [
    'The room is alone with the wound, for now.',
    'Some records prefer the silence between listeners.',
    'No one is here yet. The album is enough.',
  ],
  'records-for-rain': [
    'The room is quiet. The weather knows.',
    'Some records belong to weather more than to listeners.',
    'No one is here. The rain will do.',
  ],
  'warm-static': [
    'The hiss is here. The listeners have not arrived.',
    'Some records like the room to themselves first.',
    'The room is quiet. The signal is not.',
  ],
  'spiritual-jazz': [
    'The room is empty. The horn is not.',
    'Some records call before anyone comes.',
    'No one is here. The prayer continues.',
  ],
  'criterion-listening': [
    'The room is quiet, the way a screening room is before the projector.',
    'Some records require sitting alone in the dark.',
    'No one has arrived. The album begins anyway.',
  ],
  'pitchfork-deep-cuts': [
    'The room is quiet. The record is anything but.',
    'Some records take a while to find their listeners.',
    'No one is here yet. The album knows how to wait.',
  ],
}

export function absenceFiller(roomSlug: string, now: Date = new Date()): string {
  const pool = PER_ROOM_FILLERS[roomSlug] ?? DEFAULT_FILLERS
  const seed = `${roomSlug}:${dayBucket(now)}`
  return pickVariant(pool, seed)
}

// ── Cycle-phase modulation class ─────────────────────────────────────────
// Returns a class name to apply at the room container; CSS does the rest.
// Only 'discussion' and 'curators-note' phases warm the room. 'arrival'
// and 'private' use the baseline (no class applied).

export type CycleWeeklyPhase =
  | 'arrival'
  | 'private'
  | 'discussion'
  | 'curators-note'

export function cyclePhaseModulationClass(
  phase: CycleWeeklyPhase | string | undefined | null,
): string {
  if (phase === 'discussion' || phase === 'curators-note') {
    return 'cycle-discussion-open'
  }
  return ''
}

// ── Self-only session duration label ─────────────────────────────────────
// Literary phrasing. Returns empty string under 5 minutes (gate per spec).
// Visible only to the current viewer. Never sent over the wire.

export function sessionDurationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 5) return ''
  if (minutes < 60) return `You've been here ${minutes} minutes`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (rem === 0) {
    return hours === 1
      ? "You've been here an hour"
      : `You've been here ${hours} hours`
  }
  return hours === 1
    ? `You've been here an hour and ${rem} minutes`
    : `You've been here ${hours} hours, ${rem} minutes`
}
