/**
 * /listening-room → /rooms — Phase 6B.4 follow-up
 *
 * Same defensive redirect as /listeningroom for the hyphenated
 * variant. Catches both URL shapes external links might use.
 */
import { redirect } from 'next/navigation'

export default function ListeningRoomLegacyRedirect() {
  redirect('/rooms')
}
