/**
 * lib/listening-continuity.ts — Phase 6B.4
 *
 * Client-only continuity tracker for ritual listening. Stores a
 * single localStorage entry per room recording when the listener
 * explicitly "began listening" inside the ritual. Used by
 * components/ritual/listening-surface.tsx to swap copy between
 * "Begin when you're ready" (cold) and "Continue listening" (warm).
 *
 * This is NOT playback state. The Spotify embed is cross-origin —
 * we cannot read what's playing inside the iframe. What we track is
 * the listener's own intentional click on the "Begin listening"
 * affordance: a ceremonial threshold, not engagement telemetry.
 *
 * No remote write, no server action, no recommendation impact.
 * Purely an editorial mood toggle scoped to one room. Survives
 * page reloads; cleared by clearing the browser's site data.
 */

const STORAGE_KEY = 'lp_listening_continuity_v1'

export interface ListeningMark {
  /** ISO timestamp when the listener clicked "Begin listening". */
  startedAt: string
  /** Stable identifier for what they began listening to. Lets us
   *  reset the warm state when the room moves to a new album in a
   *  later cycle (cold again when the artifact changes). */
  albumKey: string
}

type StoredAll = Record<string, ListeningMark>

function safeRead(): StoredAll {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as StoredAll
  } catch {
    return {}
  }
}

function safeWrite(all: StoredAll): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // localStorage may be unavailable (privacy mode, quota); silent.
  }
}

export function getListeningMark(roomSlug: string): ListeningMark | null {
  const all = safeRead()
  const mark = all[roomSlug]
  if (!mark || typeof mark.startedAt !== 'string') return null
  return mark
}

export function setListeningMark(
  roomSlug: string,
  albumKey: string,
  now: Date = new Date(),
): ListeningMark {
  const mark: ListeningMark = {
    startedAt: now.toISOString(),
    albumKey,
  }
  const all = safeRead()
  all[roomSlug] = mark
  safeWrite(all)
  return mark
}

/**
 * Returns the existing mark when the stored albumKey matches the
 * current one (warm state); returns null when the stored mark is
 * for a different album (cold — last week's artifact, not this
 * week's). Used by the listening surface to decide whether the
 * "Continue listening" tone applies.
 */
export function getMarkIfFresh(
  roomSlug: string,
  currentAlbumKey: string,
): ListeningMark | null {
  const mark = getListeningMark(roomSlug)
  if (!mark) return null
  if (mark.albumKey !== currentAlbumKey) return null
  return mark
}
