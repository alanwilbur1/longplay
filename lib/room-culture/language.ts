/**
 * lib/room-culture/language.ts — Phase 4C
 *
 * Literary copy for room culture observations.
 *
 * Grammar discipline (audited line by line):
 *   - The ROOM is the grammatical subject — "this room has grown",
 *     "reflections tend to linger here", "listeners often return".
 *   - No second-person addressing in the observation itself. The
 *     listener is in the room; the room is being described.
 *   - "Listeners" plural is acceptable as the collective subject —
 *     "listeners often return" — but never names or implies any
 *     individual.
 *   - Softeners: "tend to", "often", "have grown", "begun to".
 *   - No ranking, no comparison with other rooms, no engagement
 *     metrics, no popularity language.
 *
 * If you find yourself reaching for "most active", "top", "popular",
 * "trending", "fastest-growing" — stop. That's analytics, not
 * culture.
 */

// ── pace-shift ──────────────────────────────────────────────────────────────
// Two directions, both observations of the room's recent pacing. No
// value judgement attached to either direction — "quieter" is not
// worse than "busier".

export function paceShiftQuieterLine(): string {
  return 'This room has grown quieter over recent cycles.'
}

export function paceShiftBusierLine(): string {
  return 'Activity in this room has picked up over recent cycles.'
}

// ── marking-character ──────────────────────────────────────────────────────
// Reflections-dominant vs marks-dominant. Phrased atmospherically:
// "reflections tend to linger" rather than "this room has lots of
// reflections" — the former is observational; the latter is statistic.

export function markingCharacterReflectiveLine(): string {
  return 'Reflections tend to linger longer here.'
}

export function markingCharacterBriefLine(): string {
  return 'Marks tend to stay brief in this room.'
}

// ── return-character ───────────────────────────────────────────────────────
// "Listeners often return" / "Attention here tends to pass through".
// Note the second form avoids "listeners pass through" which could
// feel dismissive of the people currently in the room. Attention is
// the subject of the passing-through; listeners as a group are
// neither praised nor diminished.

export function returnCharacterReturningLine(): string {
  return 'Listeners often return here across cycles.'
}

export function returnCharacterPassThroughLine(): string {
  return 'Attention here tends to pass through rather than gather.'
}

// ── Section header + footer ─────────────────────────────────────────────────

export function roomCultureSectionHeader(): string {
  return 'How this room has gathered attention'
}

export function roomCultureFootnote(): string {
  return 'These observations describe the room collectively, not any single listener. They may shift as the room continues.'
}
