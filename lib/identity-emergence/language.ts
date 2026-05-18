/**
 * lib/identity-emergence/language.ts — Phase 4A
 *
 * Literary copy for tendency observations. Same discipline as
 * lib/cadence/language and lib/memory/language: every literary line
 * lives in one module. Detectors call these helpers; nothing in the
 * UI authors tendency copy.
 *
 * Tone constraints (audited line by line — every helper must pass):
 *
 *   - Never names a specific room, album, curator, or other listener.
 *   - Never uses "you are…" — only "your listening", "some rooms", etc.
 *   - Uses softeners: "may be forming", "beginning to", "tend to".
 *   - Avoids personality labels (introspective, melancholy, nocturnal).
 *   - Acceptable to use second-person ("you tend to") only when the
 *     observation is about an action ("mark briefly"), never a trait.
 *
 * If you find yourself reaching for a line that names a room or an
 * album, stop. That's interpretation crossing into surveillance.
 */

// ── recurring-rooms ─────────────────────────────────────────────────────────
// The system has noticed that the listener returns to particular rooms
// across cycle boundaries. We acknowledge the pattern without naming
// which rooms — that's their knowledge, not the platform's claim.

export function recurringRoomsLine(): string {
  return 'Some rooms are beginning to recur in your listening.'
}

// ── room-distribution ──────────────────────────────────────────────────────
// Two directions, neither claimed as a trait. The lines describe the
// shape of activity, not the listener.

export function roomDistributionGatheringLine(): string {
  return 'Your listening is gathering around a few rooms.'
}

export function roomDistributionMovingLine(): string {
  return 'Your listening is moving across rooms.'
}

// ── marking-style ──────────────────────────────────────────────────────────
// Observable from the moments table: reflections vs marks. Phrased as
// "may be forming" / "tend to" — never as a preference declaration.

export function markingStyleReflectiveLine(): string {
  return 'A preference for written reflection may be forming.'
}

export function markingStyleBriefLine(): string {
  return 'You tend to mark briefly more often than to write.'
}

// ── Section disclaimer ─────────────────────────────────────────────────────
// Always rendered at the foot of the Early Emergence section. Critical:
// the system reminds the listener that what it has just said is still
// faint and provisional. Prevents the section from being read as a
// pronouncement.

export function emergenceFootnote(): string {
  return 'These observations are still faint. They will deepen — or change — as you keep listening.'
}
