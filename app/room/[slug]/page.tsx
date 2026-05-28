/**
 * /room/[slug] → /rooms/[slug] — Phase 6B.2 consolidation
 *
 * The singular /room/[slug] route previously rendered the
 * ActiveListeningRoomScreen as a separate "Enter Listening Room"
 * destination, branched off the /rooms/[slug] detail page.
 *
 * Phase 6B.2 made /rooms/[slug] the canonical (and only) room
 * surface — the ritual context panel renders inline, so there is
 * no longer a meaningful "enter" step. This route redirects to the
 * canonical detail page, preserving any legacy bookmarks and any
 * stale "Return to Listening Room" links that may persist in
 * client state (lib/last-room.ts).
 */
import { redirect } from 'next/navigation'

export default async function ActiveRoomLegacyRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/rooms/${slug}`)
}
