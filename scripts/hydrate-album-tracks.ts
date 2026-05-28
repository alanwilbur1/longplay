/**
 * scripts/hydrate-album-tracks.ts — Phase 6B.5
 *
 * Operator-driven hydration. Fetches Spotify track metadata for one
 * or more albums and UPSERTs into album_tracks. Best-effort, no
 * throws: per-album failures are logged and the next album proceeds.
 *
 * Modes
 *   --slug=<slug>          One album by slug.
 *   --all                  Every album that has a non-null
 *                          spotify_id (or streaming_urls.spotify
 *                          parseable to an album id) AND no existing
 *                          album_tracks rows yet. Skips already-
 *                          hydrated albums (idempotent under retry).
 *   --force                With --all OR --slug, re-hydrate even
 *                          when album_tracks rows already exist.
 *                          Useful when Spotify metadata changed.
 *
 * Env required:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL (mirrored from SUPABASE_URL if missing)
 *
 * Why client-credentials auth?
 *   /v1/albums/{id}/tracks is a catalog endpoint that accepts ANY
 *   valid bearer token. Client credentials avoids coupling this
 *   script to a single user's connection row.
 *
 * Why bypass sync-time integration?
 *   Catalog hydration must NEVER block sync. Phase 6A.12 established
 *   this for artist genres; we apply the same posture here. Run this
 *   script offline, on the operator's clock.
 *
 * Run:
 *   npm run hydrate:album-tracks -- --slug=for-emma
 *   npm run hydrate:album-tracks -- --all
 *   npm run hydrate:album-tracks -- --all --force
 */

import { createClient } from '@supabase/supabase-js'
import WS from 'ws'
import {
  fetchAlbumTracks,
  mintClientCredentialsToken,
} from '../lib/streaming/spotify-tracks'
import type { AlbumTrackUpsertInput } from '../lib/data/album-tracks'

interface AlbumRow {
  id: string
  slug: string | null
  title: string | null
  spotify_id: string | null
  streaming_urls: Record<string, string> | null
}

const ALBUM_URL_RE = /spotify\.com\/(?:embed\/)?album\/([A-Za-z0-9]+)/i

function parseArgs(argv: string[]): { slug: string | null; all: boolean; force: boolean } {
  let slug: string | null = null
  let all = false
  let force = false
  for (const arg of argv) {
    if (arg.startsWith('--slug=')) slug = arg.slice('--slug='.length)
    else if (arg === '--all') all = true
    else if (arg === '--force') force = true
  }
  return { slug, all, force }
}

function resolveSpotifyId(row: AlbumRow): string | null {
  if (row.spotify_id) return row.spotify_id
  const url = row.streaming_urls?.spotify
  if (!url) return null
  const m = url.match(ALBUM_URL_RE)
  return m ? m[1] : null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.slug && !args.all) {
    console.error('Usage: hydrate-album-tracks --slug=<slug> | --all [--force]')
    process.exit(1)
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[hydrate-album-tracks] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (typeof globalThis.WebSocket === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).WebSocket = WS
  }
  const db = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: WS as unknown as typeof WebSocket },
  })

  console.log('\n── album track hydration (Phase 6B.5) ──\n')

  // Resolve target albums.
  let albums: AlbumRow[]
  if (args.slug) {
    const { data, error } = await db
      .from('albums')
      .select('id, slug, title, spotify_id, streaming_urls')
      .eq('slug', args.slug)
      .maybeSingle()
    if (error || !data) {
      console.error(`[hydrate-album-tracks] no album with slug=${args.slug}`)
      process.exit(1)
    }
    albums = [data as unknown as AlbumRow]
  } else {
    const { data, error } = await db
      .from('albums')
      .select('id, slug, title, spotify_id, streaming_urls')
    if (error) {
      console.error(`[hydrate-album-tracks] albums select failed: ${error.message}`)
      process.exit(1)
    }
    albums = (data ?? []) as unknown as AlbumRow[]
  }
  console.log(`Targets: ${albums.length} album(s).\n`)

  // Mint a single client-credentials token for the whole run.
  let token: string
  try {
    const t = await mintClientCredentialsToken()
    token = t.access_token
    console.log(`Token minted (expires_in=${t.expires_in}s).\n`)
  } catch (err) {
    console.error(
      `[hydrate-album-tracks] could not mint token: ${err instanceof Error ? err.message : String(err)}`,
    )
    process.exit(1)
  }

  let hydrated = 0
  let skipped = 0
  let restricted = 0
  let rateLimited = 0
  let failed = 0
  let upsertedRows = 0

  for (const album of albums) {
    const spotifyAlbumId = resolveSpotifyId(album)
    const tag = album.slug ?? album.id.slice(0, 8)
    if (!spotifyAlbumId) {
      console.log(`  · ${tag}: no spotify id; skipping`)
      skipped += 1
      continue
    }

    // Skip already-hydrated unless --force.
    if (!args.force) {
      const { count, error } = await db
        .from('album_tracks')
        .select('id', { count: 'exact', head: true })
        .eq('album_id', album.id)
      if (error) {
        console.log(`  ✗ ${tag}: existing-rows check failed — ${error.message}`)
        failed += 1
        continue
      }
      if ((count ?? 0) > 0) {
        console.log(`  · ${tag}: already has ${count} track(s); skipping (use --force to re-hydrate)`)
        skipped += 1
        continue
      }
    }

    const outcome = await fetchAlbumTracks(spotifyAlbumId, token)
    if (!outcome.ok) {
      if (outcome.reason === 'restricted') {
        console.log(`  · ${tag}: spotify 403 (catalog restricted); skipping`)
        restricted += 1
      } else if (outcome.reason === 'rate_limited') {
        console.log(`  · ${tag}: spotify 429 (retry-after=${outcome.detail ?? 'n/a'}); skipping`)
        rateLimited += 1
      } else {
        console.log(`  ✗ ${tag}: ${outcome.reason} (status=${outcome.status ?? 'n/a'}) — ${outcome.detail ?? 'no detail'}`)
        failed += 1
      }
      continue
    }
    if (outcome.tracks.length === 0) {
      console.log(`  · ${tag}: spotify returned 0 tracks; skipping`)
      skipped += 1
      continue
    }

    const rows: AlbumTrackUpsertInput[] = outcome.tracks.map((t) => ({
      album_id: album.id,
      provider: 'spotify',
      provider_album_id: spotifyAlbumId,
      provider_track_id: t.id,
      disc_number: t.disc_number,
      track_number: t.track_number,
      name: t.name,
      duration_ms: t.duration_ms,
      explicit: t.explicit,
      preview_url: t.preview_url,
      external_url: t.external_url,
      isrc: t.isrc,
      raw: { spotify: t },
    }))

    const { error: upsertErr, count } = await db.from('album_tracks').upsert(rows, {
      onConflict: 'provider,provider_track_id',
      count: 'exact',
    })
    if (upsertErr) {
      console.log(`  ✗ ${tag}: upsert failed — code=${upsertErr.code} ${upsertErr.message}`)
      failed += 1
      continue
    }
    const landed = count ?? rows.length
    upsertedRows += landed
    hydrated += 1
    console.log(`  ✓ ${tag}: ${landed} track(s)`)
  }

  console.log('')
  console.log(
    `── result: ${hydrated} hydrated · ${skipped} skipped · ${restricted} restricted (403) · ${rateLimited} rate-limited (429) · ${failed} failed ──`,
  )
  console.log(`Total album_tracks rows upserted: ${upsertedRows}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('[hydrate-album-tracks] fatal:', err)
  process.exit(1)
})
