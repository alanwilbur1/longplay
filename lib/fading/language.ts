/**
 * lib/fading/language.ts — Phase 5B
 *
 * Literary copy for fading & persistence observations.
 *
 * Tone constraints (audited line by line):
 *   - Fading is described as natural and beautiful, never as failure.
 *   - No "your activity has declined", no "you haven't engaged".
 *   - No revival/recovery framing — "settled deeper" rather than
 *     "in danger of being forgotten".
 *   - Persistence acknowledges duration without ranking — never
 *     "most enduring" or "your strongest trace".
 *   - The traces/cycles/rooms are the subjects of the verbs, not
 *     the listener.
 *
 * If you find yourself reaching for "lost", "declining", "needs",
 * "revive", "missing" — stop. That's retention copy, not fading.
 */

// ── archive-softening ──────────────────────────────────────────────────────
// The archive as a whole has settled. Phrased as natural sedimentation
// rather than as decay or loss.

export function archiveSofteningLine(): string {
  return 'Some traces have begun settling deeper into the archive.'
}

// ── persistent-traces ───────────────────────────────────────────────────────
// The strongest temporal claim in the product. Old marks whose albums
// have continued to recur. Phrased to honor endurance without
// celebrating it ("continue resurfacing" rather than "still matter").

export function persistentTracesLine(): string {
  return 'Certain reflections continue resurfacing despite the passing cycles.'
}

// ── room-drift ─────────────────────────────────────────────────────────────
// A specific room (or rooms) the listener invested in has gone
// quieter for them. "Drifted into a slower season" rather than
// "you've left" — the room is the subject of the drift, not the
// listener.

export function roomDriftLine(count: number): string {
  if (count <= 1) {
    return 'A room has drifted into a slower season.'
  }
  return 'A few rooms have drifted into slower seasons.'
}

// ── Section header + footer ─────────────────────────────────────────────────
// Used by the archive surface to wrap the spoken fading observations
// in a named section. The footer reminds the listener that fading
// is natural and that persistence is what continues anyway.

export function fadingSectionHeader(): string {
  return 'How the archive has aged'
}

export function fadingFootnote(): string {
  return 'Some traces soften with time. Others continue. Both are how an archive lives.'
}
