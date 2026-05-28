/**
 * /listeningroom → /rooms — Phase 6B.4 follow-up
 *
 * Defensive redirect for any external bookmark or stale share link
 * that points at the historical (and never-existed-in-this-codebase)
 * /listeningroom URL. Sends the listener to the canonical room
 * directory; once there, the navigation's "Listening Room" item
 * resolves to /rooms/[currentRoomSlug] via lib/last-room.ts.
 */
import { redirect } from 'next/navigation'

export default function ListeningRoomLegacyRedirect() {
  redirect('/rooms')
}
