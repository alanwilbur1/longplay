import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRoomBySlug as getDbRoom } from '@/lib/data/rooms'
import { getRoomBySlug as getStaticRoom, type Room } from '@/lib/rooms'

/**
 * Temporary runtime diagnostic for room-artwork source-of-truth.
 *
 *   GET /api/debug/room-source?slug=<room-slug>
 *
 * Mirrors the exact selection logic used by app/rooms/[slug]/page.tsx
 * and app/room/[slug]/page.tsx — DB first, static fallback on
 * throw-or-empty — so the JSON envelope shows precisely which layer
 * is feeding the rendered page and what `currentAlbum.cover` /
 * `coverArt` strings reach <AlbumCover>.
 *
 * Auth-gated: same precedent as /api/debug/recommendations. The DB
 * read inside still uses the same anon-key path lib/data/rooms.ts
 * uses for SSR, so the payload reflects what an unauthenticated
 * server render would also see — auth just gates who can hit the
 * endpoint.
 *
 * Never returns service-role keys, anon keys, or auth tokens. The
 * only env value surfaced is the Supabase project host (helpful for
 * confirming the route ran against the intended project; the host
 * is already publicly observable in browser network traffic).
 *
 * Intentionally narrow API: serializes only the album/room fields
 * relevant to artwork rendering. Other Room fields (curator,
 * culture, prompts, etc.) are deliberately omitted to keep the
 * envelope small and the surface low.
 */

type AlbumSlice = {
  id: string | null
  slug: string | null
  title: string | null
  cover: string | null
} | null

interface RoomSlice {
  roomFound: boolean
  currentAlbum: AlbumSlice
  coverArt: string | null
}

interface DbSlice extends RoomSlice {
  ok: boolean
  error?: string
}

function sliceAlbum(room: Room | undefined): AlbumSlice {
  if (!room?.currentAlbum) return null
  const a = room.currentAlbum
  // Album.id IS the slug across this codebase — lib/albums.ts uses
  // kebab-case `id` fields and lib/data/albums.ts:30 maps DB
  // `albums.slug` into `Album.id`. Surface both keys so the
  // diagnostic is unambiguous.
  return {
    id: a.id ?? null,
    slug: a.id ?? null,
    title: a.title ?? null,
    cover: a.cover ?? null,
  }
}

function sliceRoom(room: Room | undefined): RoomSlice {
  return {
    roomFound: !!room,
    currentAlbum: sliceAlbum(room),
    coverArt: room?.coverArt ?? null,
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const url = new URL(request.url)
  const rawSlug = url.searchParams.get('slug')?.trim() ?? ''
  // Light input validation: kebab-case-ish, < 100 chars, no slashes.
  // The downstream `.eq('slug', …)` is parameterized so SQL injection
  // isn't the concern — this just keeps the diagnostic well-behaved.
  if (!rawSlug || rawSlug.length > 100 || /[^a-zA-Z0-9-]/.test(rawSlug)) {
    return NextResponse.json(
      { error: 'invalid_slug', detail: 'slug must be kebab-case, ≤100 chars' },
      { status: 400 },
    )
  }
  const slug = rawSlug

  // ── DB path ────────────────────────────────────────────────────────
  // Mirrors app/rooms/[slug]/page.tsx:39-48 — try the DB-backed
  // loader, catch any throw, fall through to static if empty.
  let db: DbSlice = {
    ok: true,
    roomFound: false,
    currentAlbum: null,
    coverArt: null,
  }
  let dbRoom: Room | undefined
  try {
    dbRoom = await getDbRoom(slug)
    db = { ok: true, ...sliceRoom(dbRoom) }
  } catch (err) {
    db = {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      roomFound: false,
      currentAlbum: null,
      coverArt: null,
    }
  }

  // ── Static fallback path ──────────────────────────────────────────
  const staticRoom = getStaticRoom(slug)
  const staticFallback: RoomSlice = sliceRoom(staticRoom)

  // ── Selection: same precedence the page renderers use ────────────
  let selectedSource: 'db' | 'static-fallback' | 'none'
  let selectedCurrentAlbumCover: string | null
  let selectedCoverArt: string | null

  if (db.ok && db.roomFound) {
    selectedSource = 'db'
    selectedCurrentAlbumCover = db.currentAlbum?.cover ?? null
    selectedCoverArt = db.coverArt
  } else if (staticFallback.roomFound) {
    selectedSource = 'static-fallback'
    selectedCurrentAlbumCover = staticFallback.currentAlbum?.cover ?? null
    selectedCoverArt = staticFallback.coverArt
  } else {
    selectedSource = 'none'
    selectedCurrentAlbumCover = null
    selectedCoverArt = null
  }

  // Surface only the Supabase project host (already public in the
  // browser's network tab and the page source). Never the anon key,
  // never the service-role key.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  let supabaseHost: string | null = null
  if (supabaseUrl) {
    try {
      supabaseHost = new URL(supabaseUrl).host
    } catch {
      supabaseHost = null
    }
  }

  return NextResponse.json({
    slug,
    db,
    staticFallback,
    selectedSource,
    selectedCurrentAlbumCover,
    selectedCoverArt,
    supabaseHost,
  })
}
