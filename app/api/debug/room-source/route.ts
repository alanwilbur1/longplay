import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

// ── Raw-DB diagnostic types ──────────────────────────────────────────
//
// Surfaces the literal `cycles`/`albums` rows the JOIN in lib/data/
// rooms.ts:243 walks. Lets the operator see whether
//   cycles.album_id  →  albums row matching the expected slug
// or whether the FK is pointing at a stranded album row from an old
// seed (the duplicate-rows case below).

interface JoinedAlbumRow {
  id: string | null
  slug: string | null
  coverUrl: string | null
  title: string | null
}

interface CycleDiag {
  ok: boolean
  error?: string
  // From the rooms row (rooms.current_cycle_id).
  cycleId: string | null
  // From the cycles row pointed at by cycleId. This is the FK that
  // determines which albums row the runtime payload's currentAlbum
  // comes from.
  albumIdFk: string | null
  // The albums row that albumIdFk resolves to. If null, the FK
  // points at a deleted/missing row (catastrophic — would surface
  // as currentAlbum.title = "Unknown Album" at runtime).
  joinedAlbum: JoinedAlbumRow | null
}

interface AlbumLookupRow {
  id: string
  slug: string | null
  coverUrl: string | null
}

interface AlbumLookups {
  // Slug of the album that the cycle's album_id actually resolves to.
  joinedSlug: string | null
  joinedSlugCount: number
  // Populated only when joinedSlugCount > 1 (real duplicate rows
  // problem in the albums table). Each entry is one duplicate row.
  joinedSlugDuplicates: AlbumLookupRow[]
  // Slug of the album the *static* lib/rooms.ts catalog says this
  // room should be pointing at. Mismatch with joinedSlug means the
  // cycles.album_id FK was wired to the wrong album.
  expectedSlug: string | null
  expectedSlugCount: number
  expectedSlugDuplicates: AlbumLookupRow[]
}

// ── Anon-key client ──────────────────────────────────────────────────
// Mirrors lib/data/rooms.ts:30-35 exactly so the raw queries below
// see what SSR sees — same URL, same anon key, no auth/cookie
// context. The Supabase JS client expects `apikey` + standard fetch;
// public-read RLS on rooms/cycles/albums must be in place for these
// reads to return rows (already documented at lib/data/rooms.ts:6).

function getAnonDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Supabase env vars not set')
  return createClient(url, key)
}

async function readCycleDiag(
  db: SupabaseClient,
  roomSlug: string,
): Promise<CycleDiag> {
  // Step 1: rooms row by slug to get current_cycle_id. Independent
  // of the assembled getDbRoom() output — surfaces the raw column
  // even if the assembler decided not to set Room.cycleId.
  const roomRes = await db
    .from('rooms')
    .select('current_cycle_id')
    .eq('slug', roomSlug)
    .maybeSingle()
  if (roomRes.error) {
    return {
      ok: false,
      error: `rooms read failed: ${roomRes.error.message.slice(0, 200)}`,
      cycleId: null,
      albumIdFk: null,
      joinedAlbum: null,
    }
  }
  const cycleId =
    (roomRes.data?.current_cycle_id as string | null | undefined) ?? null
  if (!cycleId) {
    return { ok: true, cycleId: null, albumIdFk: null, joinedAlbum: null }
  }

  // Step 2: cycles row by id + joined album. Mirrors the JOIN at
  // lib/data/rooms.ts:243 so the result matches what SSR consumes.
  const cycleRes = await db
    .from('cycles')
    .select('id, album_id, album:albums!album_id(id, slug, cover_url, title)')
    .eq('id', cycleId)
    .maybeSingle()
  if (cycleRes.error) {
    return {
      ok: false,
      error: `cycles read failed: ${cycleRes.error.message.slice(0, 200)}`,
      cycleId,
      albumIdFk: null,
      joinedAlbum: null,
    }
  }
  const row = (cycleRes.data ?? null) as
    | {
        id: string
        album_id: string | null
        album: {
          id: string
          slug: string | null
          cover_url: string | null
          title: string | null
        } | null
      }
    | null
  if (!row) {
    return { ok: true, cycleId, albumIdFk: null, joinedAlbum: null }
  }
  return {
    ok: true,
    cycleId,
    albumIdFk: row.album_id ?? null,
    joinedAlbum: row.album
      ? {
          id: row.album.id ?? null,
          slug: row.album.slug ?? null,
          coverUrl: row.album.cover_url ?? null,
          title: row.album.title ?? null,
        }
      : null,
  }
}

async function readAlbumsBySlug(
  db: SupabaseClient,
  slug: string | null,
): Promise<{ count: number; duplicates: AlbumLookupRow[] }> {
  if (!slug) return { count: 0, duplicates: [] }
  const res = await db
    .from('albums')
    .select('id, slug, cover_url')
    .eq('slug', slug)
  if (res.error || !res.data) {
    return { count: 0, duplicates: [] }
  }
  const rows = res.data as { id: string; slug: string | null; cover_url: string | null }[]
  const mapped: AlbumLookupRow[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug ?? null,
    coverUrl: r.cover_url ?? null,
  }))
  return {
    count: mapped.length,
    // Per spec: only populate the duplicates list when count > 1
    // (singleton rows are the expected case and don't need echoing).
    duplicates: mapped.length > 1 ? mapped : [],
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

  // ── Raw cycle / albums join diagnostics ──────────────────────────
  // Independent of the assembled getDbRoom() output above. Reads
  // rooms.current_cycle_id → cycles row + joined album row directly
  // so the operator can see whether the cycles FK is pointing at the
  // expected album row or at a stranded duplicate from an old seed.
  let cycle: CycleDiag = {
    ok: true,
    cycleId: null,
    albumIdFk: null,
    joinedAlbum: null,
  }
  let albumLookups: AlbumLookups = {
    joinedSlug: null,
    joinedSlugCount: 0,
    joinedSlugDuplicates: [],
    expectedSlug: staticFallback.currentAlbum?.slug ?? null,
    expectedSlugCount: 0,
    expectedSlugDuplicates: [],
  }
  try {
    const anonDb = getAnonDb()
    cycle = await readCycleDiag(anonDb, slug)
    const joinedSlug = cycle.joinedAlbum?.slug ?? null
    const expectedSlug = staticFallback.currentAlbum?.slug ?? null

    const [joinedRes, expectedRes] = await Promise.all([
      readAlbumsBySlug(anonDb, joinedSlug),
      // Skip the second query when both slugs match — avoids an
      // identical lookup and surfaces it as "same as joined" in
      // the response shape (expectedSlugCount mirrors joinedSlugCount).
      joinedSlug && expectedSlug && joinedSlug === expectedSlug
        ? Promise.resolve({ count: 0, duplicates: [] })
        : readAlbumsBySlug(anonDb, expectedSlug),
    ])
    albumLookups = {
      joinedSlug,
      joinedSlugCount: joinedRes.count,
      joinedSlugDuplicates: joinedRes.duplicates,
      expectedSlug,
      expectedSlugCount:
        joinedSlug && expectedSlug && joinedSlug === expectedSlug
          ? joinedRes.count
          : expectedRes.count,
      expectedSlugDuplicates:
        joinedSlug && expectedSlug && joinedSlug === expectedSlug
          ? joinedRes.duplicates
          : expectedRes.duplicates,
    }
  } catch (err) {
    cycle = {
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      cycleId: null,
      albumIdFk: null,
      joinedAlbum: null,
    }
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
    cycle,
    albumLookups,
    supabaseHost,
  })
}
