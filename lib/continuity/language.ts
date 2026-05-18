/**
 * lib/continuity/language.ts — Phase 5A
 *
 * Literary copy for the four continuity states.
 *
 * Tone constraints (audited line by line):
 *   - Acknowledge time passing without ever asking for action.
 *   - No "we missed you", no "jump back in", no urgency.
 *   - No streaks, no counters, no nudges.
 *   - Time itself is the subject ("the cycle is closing", "the room
 *     has changed") — not the user's responsibility ("you should
 *     come back").
 *   - Second-person is allowed when it acknowledges the listener's
 *     own action ("you are returning"), never when it demands one.
 *
 * If you find yourself reaching for "stay", "don't miss", "still
 * time", "join", "come back" — stop. That's retention copy, not
 * continuity.
 */

// ── returning-after-absence (3–13 days) ─────────────────────────────────────
// Short framing. Acknowledges absence without weight.

export function returningShortLine(): string {
  return 'You are returning after some time away.'
}

// ── returning-after-absence (14+ days) ─────────────────────────────────────
// Longer absence gets slightly more weight — acknowledges that the
// room may have changed in the listener's absence. Still no
// demand, no guilt.

export function returningLongLine(): string {
  return 'You are returning after a longer absence. The room has carried on quietly.'
}

// ── cycle-arrival ─────────────────────────────────────────────────────────
// The cycle has just opened. Complements the cadence engine's
// Monday/Tuesday ritual prompt; this is about THIS room's cycle
// specifically. Phrased to feel like a doorway, not an
// announcement.

export function cycleArrivalLine(): string {
  return 'This cycle has just begun. The album is finding its first listeners.'
}

// ── cycle-closing ─────────────────────────────────────────────────────────
// The cycle is in its final day or two. Phrased as natural closure,
// not as a deadline. "Beginning to close" rather than "closing
// soon" — the latter has urgency baked in.

export function cycleClosingLine(): string {
  return 'The cycle is beginning to close. The week is settling toward its end.'
}
