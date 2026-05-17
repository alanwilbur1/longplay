/**
 * lib/cadence/language.ts — Phase 3C.1
 *
 * Phase-driven copy generators. All ritual-derived language lives here.
 * Components import these helpers; they MUST NOT define ritual copy
 * locally — that scatters tone across the codebase and breaks the
 * "no duplicated ritual logic" rule.
 *
 * Every helper is a pure function: same input → same output. SSR-safe.
 */

import type { RitualPhase } from './types'

// ── Active room: atmospheric line ────────────────────────────────────
// Sits beside the cycle phase indicator. One short observational
// phrase, italic-appropriate. Never imperative.

const ROOM_TONE_LINES: Record<RitualPhase, string> = {
  arrival: 'Tonight is for first listens.',
  'first-impressions': 'Trust what you noticed first.',
  'difficult-listening': 'Return to the part you wanted to skip.',
  reflection: 'A night for slow notes.',
  synthesis: 'The album speaks as a whole tonight.',
  'carry-forward': 'The room keeps what stayed.',
}

export function roomToneLine(phase: RitualPhase): string {
  return ROOM_TONE_LINES[phase]
}

// ── Empty-state language ─────────────────────────────────────────────
// Used by surfaces that have nothing to show yet. Phase-flavored so
// the empty state still feels inhabited by the room's temporal mood.

export type EmptyStateSurface =
  | 'no-moments-active-room'  // active room: user has no moments for this album
  | 'no-moments-archive'      // /archive/moments: user has nothing archived

const EMPTY_STATE_LINES: Record<EmptyStateSurface, Record<RitualPhase, string>> = {
  'no-moments-active-room': {
    arrival: 'No marks yet. First listens belong to the listener alone.',
    'first-impressions': 'No moments yet. Notice what surfaces.',
    'difficult-listening': 'No moments yet. The hard parts are slowest to surface.',
    reflection: 'No notes yet. A blank notebook is its own kind of attention.',
    synthesis: 'No moments yet. Sometimes the whole album is the moment.',
    'carry-forward': 'No moments yet. Some albums become memory before notes.',
  },
  'no-moments-archive': {
    arrival: 'Nothing archived yet. The week is only beginning.',
    'first-impressions': 'Nothing archived yet. Early impressions are private.',
    'difficult-listening': 'Nothing archived yet. The hardest moments resist filing.',
    reflection: 'Nothing archived yet. Tonight may begin one.',
    synthesis: 'Nothing archived yet. The week will leave something.',
    'carry-forward': 'Nothing archived yet. Memory does not require an entry.',
  },
}

export function emptyStateLine(surface: EmptyStateSurface, phase: RitualPhase): string {
  return EMPTY_STATE_LINES[surface][phase]
}

// ── Presence framing ─────────────────────────────────────────────────
// Phase-flavored framing prepended to (or replacing) presence count
// language. Returns null when the cadence has nothing to add; the
// caller falls back to its existing count language.
//
// Today only the carry-forward and difficult-listening phases add
// framing — the rest of the week stays with bare count language.
// Discipline: most polls produce no atmospheric addition.

export function presenceFraming(phase: RitualPhase, presenceCount: number): string | null {
  if (presenceCount === 0) return null
  switch (phase) {
    case 'difficult-listening':
      return presenceCount <= 3 ? 'a quiet midweek' : null
    case 'carry-forward':
      return presenceCount <= 3 ? 'slow listening this evening' : null
    default:
      return null
  }
}

// ── Ritual prompts (homepage header) ─────────────────────────────────
// Convenience accessor that mirrors RitualPhaseInfo.ritual. Provided
// so callers can import a single function name instead of dereferencing
// the info object.

import { PHASE_DEFINITIONS } from './phases'

export function ritualPrompt(phase: RitualPhase): string {
  return PHASE_DEFINITIONS[phase].ritual
}

export function ritualObservation(phase: RitualPhase): string {
  return PHASE_DEFINITIONS[phase].observation
}

export function ritualTitle(phase: RitualPhase): string {
  return PHASE_DEFINITIONS[phase].title
}
