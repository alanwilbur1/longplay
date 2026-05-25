/**
 * scripts/refresh-album-covers.ts
 *
 * Surgical album-artwork refresh. Reconciles Supabase `albums.cover_url`,
 * `albums.artwork_source`, `albums.artwork_verified_at`, and
 * `albums.streaming_urls` with the authoritative `lib/albums.ts`
 * catalog, plus `rooms.cover_art` for rooms whose anchor album cover
 * changed.
 *
 * Lower blast radius than `seed-phase2.ts`:
 *   - touches ONLY albums.* (4 columns) and rooms.cover_art
 *   - never touches cycles, prompts, essays, memberships,
 *     curator profiles, taxonomy, or room identity
 *   - idempotent by slug — safe to re-run
 *   - null/empty-safe — refuses to overwrite a populated cover_url
 *     with an empty one unless --allow-empty-cover
 *   - dry-run by default; `--write` required to actually mutate
 *
 * Use this when:
 *   - The artwork resolver has updated lib/albums.ts with verified
 *     cover URLs and the DB needs to catch up (this is the common
 *     case — only seed-phase2.ts ever writes albums.cover_url, so
 *     post-seed catalog edits otherwise stay stuck on disk).
 *
 * Use the full seed-phase2.ts when:
 *   - You've ADDED a new album. This script refuses to insert; it
 *     only updates existing rows (matched by slug). Missing rows are
 *     reported but skipped.
 *
 * Usage:
 *   tsx scripts/refresh-album-covers.ts                # dry-run (default)
 *   tsx scripts/refresh-album-covers.ts --write        # apply
 *   tsx scripts/refresh-album-covers.ts --write --allow-empty-cover
 *
 * Required env (write mode only — dry-run also reads, but service-role
 * is the only key with reliable read on the `albums` table here):
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import WS from 'ws'
import { ALBUMS, type Album } from '../lib/albums'
import { ALL_ROOMS } from '../lib/rooms'

// ── Target payload shapes ─────────────────────────────────────────────

type ArtworkSource =
  | 'spotify'
  | 'apple-music'
  | 'musicbrainz'
  | 'local-fallback'

interface AlbumTarget {
  cover_url: string
  artwork_source: ArtworkSource | null
  // Set to "now" only when cover_url actually changes. Unchanged covers
  // keep whatever timestamp the DB already has — we haven't re-verified
  // them in this run.
  artwork_verified_at_if_changed: string
  streaming_urls: Record<string, string>
}

interface ExistingAlbumRow {
  id: string
  slug: string
  cover_url: string | null
  artwork_source: string | null
  artwork_verified_at: string | null
  streaming_urls: Record<string, string> | null
}

interface ExistingRoomRow {
  id: string
  slug: string
  cover_art: string | null
}

// ── Source inference ──────────────────────────────────────────────────
//
// lib/albums.ts doesn't carry the `albumArtSource` field for most
// entries (the artwork resolver only sets `cover`, not metadata).
// Infer the provider from the URL pattern instead — keeps DB rows
// honest without requiring a catalog migration.

function inferArtworkSource(url: string | null | undefined): ArtworkSource | null {
  if (!url || url.length === 0) return null
  if (/mzstatic\.com/i.test(url)) return 'apple-music'
  if (/i\.scdn\.co/i.test(url)) return 'spotify'
  if (/coverartarchive\.org|archive\.org/i.test(url)) return 'musicbrainz'
  // placehold.co, local CDN, anything else
  return 'local-fallback'
}

function buildStreamingUrls(a: Album): Record<string, string> {
  // Same shape and key ordering as scripts/seed-phase2.ts:403-410.
  // Conditional spread skips undefined fields so empty objects stay
  // empty (vs `{ spotify: undefined }` which JSON-stringifies as `{}`).
  return {
    ...(a.spotifyUrl ? { spotify: a.spotifyUrl } : {}),
    ...(a.appleMusicUrl ? { appleMusic: a.appleMusicUrl } : {}),
    ...(a.tidalUrl ? { tidal: a.tidalUrl } : {}),
    ...(a.qobuzUrl ? { qobuz: a.qobuzUrl } : {}),
    ...(a.bandcampUrl ? { bandcamp: a.bandcampUrl } : {}),
    ...(a.youtubeUrl ? { youtube: a.youtubeUrl } : {}),
  }
}

function targetForAlbum(a: Album, now: string): AlbumTarget {
  return {
    cover_url: a.cover ?? '',
    artwork_source: inferArtworkSource(a.cover),
    artwork_verified_at_if_changed: now,
    streaming_urls: buildStreamingUrls(a),
  }
}

// ── Diffing ───────────────────────────────────────────────────────────

function truncate(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function streamingUrlsEqual(
  a: Record<string, string> | null,
  b: Record<string, string>,
): boolean {
  const aJ = JSON.stringify(sortedEntries(a ?? {}))
  const bJ = JSON.stringify(sortedEntries(b))
  return aJ === bJ
}

function sortedEntries(o: Record<string, string>): [string, string][] {
  return Object.keys(o)
    .sort()
    .map((k) => [k, o[k]] as [string, string])
}

interface AlbumDiff {
  coverChanged: boolean
  sourceChanged: boolean
  streamingChanged: boolean
  changeStrings: string[]
}

function diffAlbum(before: ExistingAlbumRow, after: AlbumTarget): AlbumDiff {
  const beforeCover = before.cover_url ?? ''
  const afterCover = after.cover_url
  const coverChanged = beforeCover !== afterCover

  // artwork_source: we only intend to write it when cover_url changes
  // (because the new source is inferred from the new URL). So compare
  // only when cover changed.
  const sourceChanged =
    coverChanged && (before.artwork_source ?? null) !== (after.artwork_source ?? null)

  const streamingChanged = !streamingUrlsEqual(before.streaming_urls, after.streaming_urls)

  const changeStrings: string[] = []
  if (coverChanged) {
    changeStrings.push(
      `cover_url: ${truncate(beforeCover || 'null', 50)} → ${truncate(afterCover || 'null', 50)}`,
    )
  }
  if (sourceChanged) {
    changeStrings.push(
      `artwork_source: ${before.artwork_source ?? 'null'} → ${after.artwork_source ?? 'null'}`,
    )
  }
  if (streamingChanged) {
    const beforeKeys = Object.keys(before.streaming_urls ?? {}).sort().join(',') || '∅'
    const afterKeys = Object.keys(after.streaming_urls).sort().join(',') || '∅'
    changeStrings.push(`streaming_urls keys: [${beforeKeys}] → [${afterKeys}]`)
  }
  return { coverChanged, sourceChanged, streamingChanged, changeStrings }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  // Dry-run by default. Explicit opt-in to write.
  const writeMode = process.argv.includes('--write')
  const dryRun = !writeMode
  // Empty-cover downgrade guard. Mirrors refresh-room-metadata's
  // --allow-null-cover. Default-deny: if lib/albums.ts has an empty
  // cover but the DB has a populated one, skip the cover overwrite
  // (still apply other field changes). Override with the flag when
  // intentionally retiring artwork.
  const allowEmptyCover = process.argv.includes('--allow-empty-cover')

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  // Match scripts/refresh-room-metadata.ts:232-245 — Node 20 ships
  // without a global WebSocket implementation; supabase-js v2 builds
  // its realtime sub-client at createClient() time and errors out
  // unless we either polyfill globalThis.WebSocket or pass
  // realtime.transport. Doing both means this works on 18/20/22
  // without further fiddling.
  if (typeof globalThis.WebSocket === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).WebSocket = WS
  }
  const db = createClient(url, key, {
    auth: { persistSession: false },
    realtime: {
      transport: WS as unknown as typeof WebSocket,
    },
  })

  console.log(`\n── refresh-album-covers${dryRun ? ' (DRY RUN — no writes; pass --write to apply)' : ''} ──\n`)

  const now = new Date().toISOString()

  // ── Read existing album rows by slug ────────────────────────────────
  const catalogAlbums = Object.values(ALBUMS) as Album[]
  const slugs = catalogAlbums.map((a) => a.id)

  const { data: existingAlbums, error: readErr } = await db
    .from('albums')
    .select('id, slug, cover_url, artwork_source, artwork_verified_at, streaming_urls')
    .in('slug', slugs)
  if (readErr) {
    console.error('Read failed (albums):', readErr.message)
    process.exit(1)
  }
  const albumBySlug = new Map<string, ExistingAlbumRow>()
  for (const row of (existingAlbums ?? []) as unknown as ExistingAlbumRow[]) {
    albumBySlug.set(row.slug, row)
  }

  // ── Phase 1: per-album update ───────────────────────────────────────
  console.log(`[1/2] Albums (${slugs.length} catalog rows)…\n`)
  let aUpdated = 0
  let aUnchanged = 0
  let aMissing = 0
  let aFailed = 0
  let aCoverDowngradeBlocked = 0

  // Track which slugs got a *cover* change — drives the rooms.cover_art
  // refresh in Phase 2 so we don't touch rooms whose anchor album
  // didn't actually change.
  const coverChangedSlugs = new Set<string>()

  for (const album of catalogAlbums) {
    const slug = album.id
    const existing = albumBySlug.get(slug)
    if (!existing) {
      console.log(`  ✗ ${slug}: ROW MISSING in DB. Run \`tsx scripts/seed-phase2.ts\` to create.`)
      aMissing += 1
      continue
    }

    const target = targetForAlbum(album, now)
    const diff = diffAlbum(existing, target)

    // Downgrade guard: refuse to overwrite a non-empty cover_url with
    // an empty one unless --allow-empty-cover.
    const wouldDowngrade =
      target.cover_url.length === 0 && (existing.cover_url ?? '').length > 0
    const blockCoverDowngrade = wouldDowngrade && !allowEmptyCover

    if (diff.changeStrings.length === 0) {
      // No diffs at all — silent in default output to keep the log
      // scannable for the 30+ albums that ARE changing.
      aUnchanged += 1
      continue
    }

    // If the ONLY diff is the blocked cover downgrade, treat as
    // unchanged-but-noisy.
    const nonCoverChanges = diff.changeStrings.filter(
      (c) => !c.startsWith('cover_url:') && !c.startsWith('artwork_source:'),
    )
    if (blockCoverDowngrade && nonCoverChanges.length === 0) {
      console.log(
        `  · ${slug}: cover_url downgrade blocked (pass --allow-empty-cover to override); no other changes`,
      )
      aCoverDowngradeBlocked += 1
      aUnchanged += 1
      continue
    }

    console.log(`  ${dryRun ? '?' : '→'} ${slug}`)
    for (const change of diff.changeStrings) {
      const isBlocked =
        blockCoverDowngrade &&
        (change.startsWith('cover_url:') || change.startsWith('artwork_source:'))
      console.log(`      ${change}${isBlocked ? '   ⊘ blocked — pass --allow-empty-cover' : ''}`)
    }
    if (diff.coverChanged && !blockCoverDowngrade) {
      coverChangedSlugs.add(slug)
    }

    if (dryRun) {
      aUpdated += 1
      continue
    }

    // ── Build the actual UPDATE payload ───────────────────────────────
    // Only include columns that need to change. If cover is blocked
    // by downgrade guard, leave cover_url + artwork_source +
    // artwork_verified_at intact; still refresh streaming_urls.
    const updatePayload: {
      cover_url?: string
      artwork_source?: ArtworkSource | null
      artwork_verified_at?: string
      streaming_urls?: Record<string, string>
    } = {}
    if (diff.coverChanged && !blockCoverDowngrade) {
      updatePayload.cover_url = target.cover_url
      updatePayload.artwork_source = target.artwork_source
      updatePayload.artwork_verified_at = target.artwork_verified_at_if_changed
    }
    if (diff.streamingChanged) {
      updatePayload.streaming_urls = target.streaming_urls
    }

    if (Object.keys(updatePayload).length === 0) {
      // Edge case: every diff was blocked. Don't issue an empty UPDATE.
      aUnchanged += 1
      continue
    }

    const { error: updErr } = await db
      .from('albums')
      .update(updatePayload)
      .eq('slug', slug)
    if (updErr) {
      console.log(`      ! update failed: ${updErr.message}`)
      aFailed += 1
    } else {
      aUpdated += 1
    }
  }

  console.log(
    `\n  ${dryRun ? 'would update' : 'updated'} ${aUpdated} · unchanged ${aUnchanged} · missing ${aMissing} · failed ${aFailed}` +
      (aCoverDowngradeBlocked > 0 ? ` · cover downgrades blocked ${aCoverDowngradeBlocked}` : ''),
  )

  // ── Phase 2: rooms.cover_art for impacted rooms ─────────────────────
  // Touch ONLY rooms whose anchor album's cover changed in Phase 1.
  // Skip everyone else — that's the surgical promise.
  console.log(`\n[2/2] Rooms.cover_art for impacted anchor albums…\n`)

  const impactedRooms = ALL_ROOMS.filter((r) => {
    const albumSlug = r.currentAlbum?.id
    return albumSlug ? coverChangedSlugs.has(albumSlug) : false
  })

  let rUpdated = 0
  let rUnchanged = 0
  let rMissing = 0
  let rFailed = 0
  let rCoverDowngradeBlocked = 0

  if (impactedRooms.length === 0) {
    console.log('  (no rooms reference an album whose cover changed)')
  } else {
    const impactedSlugs = impactedRooms.map((r) => r.slug)
    const { data: existingRooms, error: roomReadErr } = await db
      .from('rooms')
      .select('id, slug, cover_art')
      .in('slug', impactedSlugs)
    if (roomReadErr) {
      console.error('  Read failed (rooms):', roomReadErr.message)
      process.exit(1)
    }
    const roomBySlug = new Map<string, ExistingRoomRow>()
    for (const row of (existingRooms ?? []) as unknown as ExistingRoomRow[]) {
      roomBySlug.set(row.slug, row)
    }

    for (const room of impactedRooms) {
      const slug = room.slug
      const existing = roomBySlug.get(slug)
      if (!existing) {
        console.log(`  ✗ ${slug}: ROW MISSING in DB.`)
        rMissing += 1
        continue
      }

      // Same logic as seed-phase2.ts:465-467.
      const targetCover =
        room.currentAlbum?.cover && room.currentAlbum.cover.length > 0
          ? room.currentAlbum.cover
          : null

      const beforeCover = existing.cover_art ?? null
      if (beforeCover === targetCover) {
        rUnchanged += 1
        continue
      }

      const wouldDowngrade = targetCover === null && beforeCover !== null
      const blockCoverDowngrade = wouldDowngrade && !allowEmptyCover

      console.log(`  ${dryRun ? '?' : '→'} ${slug}`)
      console.log(
        `      cover_art: ${truncate(beforeCover ?? 'null', 50)} → ${truncate(targetCover ?? 'null', 50)}${
          blockCoverDowngrade ? '   ⊘ blocked — pass --allow-empty-cover' : ''
        }`,
      )

      if (blockCoverDowngrade) {
        rCoverDowngradeBlocked += 1
        rUnchanged += 1
        continue
      }
      if (dryRun) {
        rUpdated += 1
        continue
      }

      const { error: updErr } = await db
        .from('rooms')
        .update({ cover_art: targetCover })
        .eq('slug', slug)
      if (updErr) {
        console.log(`      ! update failed: ${updErr.message}`)
        rFailed += 1
      } else {
        rUpdated += 1
      }
    }

    console.log(
      `\n  ${dryRun ? 'would update' : 'updated'} ${rUpdated} · unchanged ${rUnchanged} · missing ${rMissing} · failed ${rFailed}` +
        (rCoverDowngradeBlocked > 0 ? ` · cover downgrades blocked ${rCoverDowngradeBlocked}` : ''),
    )
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log(`\n── ${dryRun ? 'dry-run summary' : 'summary'} ──`)
  console.log(`  albums: ${aUpdated} ${dryRun ? 'would update' : 'updated'} · ${aUnchanged} unchanged · ${aMissing} missing · ${aFailed} failed`)
  console.log(`  rooms:  ${rUpdated} ${dryRun ? 'would update' : 'updated'} · ${rUnchanged} unchanged · ${rMissing} missing · ${rFailed} failed`)
  if (aMissing > 0) {
    console.log('\n  Missing album rows need the full seed (creates dependent cycles too).')
    console.log('  Run: tsx scripts/seed-phase2.ts')
  }
  if (dryRun && (aUpdated > 0 || rUpdated > 0)) {
    console.log('\n  Pass --write to apply these changes.')
  }
  process.exit(aFailed + rFailed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('refresh-album-covers failed:', err)
  process.exit(1)
})
