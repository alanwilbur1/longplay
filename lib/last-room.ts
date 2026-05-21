/**
 * lib/last-room.ts
 *
 * Device-local memory of the most recently visited active listening room.
 * Pure helpers — no React, no DOM, no API calls, no auth. Safe to import
 * anywhere; readers handle the "no recent room yet" case.
 *
 * Why localStorage rather than a server-side last_visit column:
 *   - the "bookmark in a house" feel is device-local by nature
 *   - zero new infra, no migration, no RLS, no write path
 *   - returning to a different device cleanly falls back to /rooms
 *
 * Keys:
 *   longplay_last_room_slug   — string slug, e.g. "nocturnal-room"
 *   longplay_last_room_name   — display string, e.g. "The Nocturnal Room"
 *
 * All reads/writes are wrapped in try/catch because localStorage can throw
 * (private browsing, quota exceeded) and presence is non-essential.
 */

const SLUG_KEY = 'longplay_last_room_slug'
const NAME_KEY = 'longplay_last_room_name'

export interface LastRoom {
  slug: string
  name: string
}

export function getLastRoom(): LastRoom | null {
  if (typeof window === 'undefined') return null
  try {
    const slug = window.localStorage.getItem(SLUG_KEY)
    const name = window.localStorage.getItem(NAME_KEY)
    if (!slug) return null
    return { slug, name: name ?? slug }
  } catch {
    return null
  }
}

export function setLastRoom(slug: string, name: string): void {
  if (typeof window === 'undefined') return
  if (!slug) return
  try {
    window.localStorage.setItem(SLUG_KEY, slug)
    window.localStorage.setItem(NAME_KEY, name)
  } catch {
    // Quota or disabled storage — silently ignore; bookmark is a convenience
  }
}

export function clearLastRoom(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SLUG_KEY)
    window.localStorage.removeItem(NAME_KEY)
  } catch {}
}
