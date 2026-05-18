/**
 * lib/resonance/language.ts — Phase 4B
 *
 * Literary copy for resonance observations. Same discipline as
 * lib/cadence, lib/memory, lib/identity-emergence: every literary
 * line lives in one module.
 *
 * Resonance grammar (audited line by line):
 *   - The thing-that-recurs is the grammatical subject ("certain
 *     rooms continue returning") — NOT the listener ("you keep
 *     coming back to certain rooms"). Identity uses listener-as-
 *     subject; resonance uses thing-as-subject. The difference is
 *     the boundary between personality-assignment and observation.
 *   - Never names a specific room, album, curator, or listener.
 *   - Softeners: "begun resurfacing", "continue returning", "starting
 *     to gather", "have remained close".
 *   - No "you should", no "your favorite", no "top".
 *
 * If you find yourself naming a room or describing the listener,
 * stop. That is interpretation crossing into recommendation.
 */

// ── album-recurrence ────────────────────────────────────────────────────────
// Phrased as "albums...begun resurfacing" — the album is the subject,
// the listener's archive is the place where the resurfacing happens.

export function recurringAlbumsLine(count: number): string {
  if (count <= 1) {
    return 'An album has begun resurfacing across cycles.'
  }
  return 'A few albums have begun resurfacing across cycles.'
}

// ── room-persistence ───────────────────────────────────────────────────────
// "Certain rooms continue returning" — the rooms are returning, the
// listener is the location. The grammar inverts the
// implication-of-active-pursuit that "you keep returning to certain
// rooms" would carry.

export function persistentRoomsLine(count: number): string {
  if (count <= 1) {
    return 'A room has remained close to your listening life.'
  }
  return 'Certain rooms continue returning.'
}

// ── Section header + footer ─────────────────────────────────────────────────
// Rendered on /archive when at least one resonance has earned a line.
// The footer always closes the section, reminding the reader that
// observation is not preference and that recurrence is not ranking.

export function resonanceSectionHeader(): string {
  return 'What keeps returning'
}

export function resonanceFootnote(): string {
  return 'These are observations of recurrence, not preferences. They may continue, or they may pass.'
}
