/**
 * /room → /rooms — Phase 6B.2 consolidation
 *
 * The singular /room landing previously rendered a static
 * "Bon Iver — For Emma" listening room. Phase 6B.2 consolidated
 * every room experience under /rooms/[slug]. This route now
 * redirects to the room directory.
 */
import { redirect } from 'next/navigation'

export default function RoomLegacyRedirect() {
  redirect('/rooms')
}
