/**
 * scripts/audit-album-spotify-ids.ts — Phase 6B.4D
 *
 * Automatic Spotify album-ID audit + repair across ALL albums. Ends
 * the "patch one bad id at a time" model: every album's id is
 * validated against Spotify and, when stale/invalid, re-resolved by
 * searching artist + title.
 *
 * Sources audited per album (see lib/spotify/album-id-resolver):
 *   DB albums.spotify_id → DB streaming_urls.spotify → static
 *   ALBUMS.spotifyId → static ALBUMS.spotifyUrl. Ritual artifact
 *   albums are flagged so every ritual room gets a clear verdict.
 *
 * Modes
 *   (default)        Dry run. Reports only; writes nothing.
 *   --write          Persist high-confidence resolved ids back to
 *                    albums.spotify_id (only when validated AND it
 *                    differs from the current DB value).
 *   --slug=<slug>    Audit a single album.
 *
 * Env required:
 *   SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET   (validate + search)
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY
 *                    (optional — without them the audit runs over the
 *                     static catalog only and cannot --write)
 *
 * Run:
 *   npm run audit:album-spotify-ids
 *   npm run audit:album-spotify-ids -- --slug=illinois
 *   npm run audit:album-spotify-ids -- --write
 */

import { createClient } from '@supabase/supabase-js'
import WS from 'ws'
import { mintClientCredentialsToken } from '../lib/streaming/spotify-tracks'
import { makeCatalogDeps } from '../lib/spotify/album-catalog'
import {
  resolveSpotifyAlbumId,
  type AlbumIdSources,
  type ResolutionResult,
} from '../lib/spotify/album-id-resolver'
import { ALBUMS } from '../lib/albums'

interface AlbumRow {
  id: string
  slug: string | null
  title: string | null
  artist: string | null
  spotify_id: string | null
  streaming_urls: Record<string, string> | null
}

interface StaticAlbum {
  id: string
  title?: string
  artist?: string
  spotifyId?: string
  spotifyUrl?: string
}

function parseArgs(argv: string[]): { slug: string | null; write: boolean } {
  let slug: string | null = null
  let write = false
  for (const arg of argv) {
    if (arg.startsWith('--slug=')) slug = arg.slice('--slug='.length)
    else if (arg === '--write') write = true
  }
  return { slug, write }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // Spotify creds are required — without them we cannot validate or
  // search, and the whole point is automatic resolution.
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    console.error(
      '[audit-album-spotify-ids] SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET required',
    )
    process.exit(1)
  }

  // DB is optional: with it we audit DB rows + can --write; without it
  // we audit the static catalog only.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const dbEnabled = Boolean(url && key)
  let db: ReturnType<typeof createClient> | null = null
  if (dbEnabled) {
    if (typeof globalThis.WebSocket === 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(globalThis as any).WebSocket = WS
    }
    db = createClient(url as string, key as string, {
      auth: { persistSession: false },
      realtime: { transport: WS as unknown as typeof WebSocket },
    })
  }

  console.log('\n── Spotify album-ID audit (Phase 6B.4D) ──')
  console.log(
    `mode: ${args.write ? 'WRITE' : 'dry-run'} | db: ${dbEnabled ? 'on' : 'static-only'}${args.slug ? ` | slug=${args.slug}` : ''}\n`,
  )

  // 1. Load DB albums (when available).
  const dbBySlug = new Map<string, AlbumRow>()
  if (db) {
    let query = db
      .from('albums')
      .select('id, slug, title, artist, spotify_id, streaming_urls')
    if (args.slug) query = query.eq('slug', args.slug)
    const { data, error } = await query
    if (error) {
      console.error(`[audit] albums select failed: ${error.message}`)
      process.exit(1)
    }
    for (const r of (data ?? []) as unknown as AlbumRow[]) {
      if (r.slug) dbBySlug.set(r.slug, r)
    }
  }

  // 2. Which DB albums are ritual artifacts? (for the clear-verdict
  //    requirement — every ritual room's album must resolve or report).
  const ritualArtifactIds = new Set<string>()
  if (db) {
    const { data } = await db
      .from('ritual_cycles')
      .select('artifact_album_id')
    for (const row of (data ?? []) as Array<{ artifact_album_id: string | null }>) {
      if (row.artifact_album_id) ritualArtifactIds.add(row.artifact_album_id)
    }
  }

  // 3. Build the union of slugs (DB ∪ static), honoring --slug.
  const staticBySlug = new Map<string, StaticAlbum>()
  for (const [, v] of Object.entries(ALBUMS as Record<string, StaticAlbum>)) {
    if (!v?.id) continue
    if (args.slug && v.id !== args.slug) continue
    staticBySlug.set(v.id, v)
  }
  const slugs = new Set<string>([...dbBySlug.keys(), ...staticBySlug.keys()])
  if (slugs.size === 0) {
    console.error('[audit] no albums found to audit.')
    process.exit(1)
  }

  // 4. Token + catalog deps.
  const token = await mintClientCredentialsToken()
  const deps = makeCatalogDeps(token.access_token)

  // 5. Resolve each album.
  const results: Array<{
    res: ResolutionResult
    dbRow: AlbumRow | undefined
    isRitualArtifact: boolean
  }> = []

  for (const slug of slugs) {
    const dbRow = dbBySlug.get(slug)
    const stat = staticBySlug.get(slug)
    const sources: AlbumIdSources = {
      slug,
      title: dbRow?.title ?? stat?.title ?? '',
      artist: dbRow?.artist ?? stat?.artist ?? '',
      dbSpotifyId: dbRow?.spotify_id ?? null,
      dbStreamingUrl: dbRow?.streaming_urls?.spotify ?? null,
      staticSpotifyId: stat?.spotifyId ?? null,
      staticSpotifyUrl: stat?.spotifyUrl ?? null,
    }
    const res = await resolveSpotifyAlbumId(sources, deps)
    const isRitualArtifact = dbRow ? ritualArtifactIds.has(dbRow.id) : false
    results.push({ res, dbRow, isRitualArtifact })

    // Per-album log (requirement #6).
    console.log(
      [
        `• ${slug}${isRitualArtifact ? ' [ritual]' : ''}`,
        `    existing: ${res.existingId ?? '∅'}`,
        `    resolved: ${res.resolvedId ?? '∅'}  via ${res.method}`,
        `    confidence: ${res.confidence}  validated: ${res.validated}`,
        res.reason ? `    note: ${res.reason}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  // 6. Optional write — only high-confidence, validated, changed, DB-backed.
  let written = 0
  const staticSuggestions: Array<{ slug: string; from: string | null; to: string }> = []
  if (db) {
    for (const { res, dbRow } of results) {
      if (
        res.confidence === 'high' &&
        res.validated &&
        res.resolvedId &&
        dbRow &&
        res.resolvedId !== dbRow.spotify_id
      ) {
        if (args.write) {
          // The untyped client collapses writes to `never`; cast to a
          // minimal builder shape (same posture as lib/streaming/access-token).
          const albumsUpdate = db.from('albums') as unknown as {
            update: (v: Record<string, unknown>) => {
              eq: (c: string, val: string) => Promise<{ error: { message: string } | null }>
            }
          }
          const { error } = await albumsUpdate
            .update({ spotify_id: res.resolvedId, updated_at: new Date().toISOString() })
            .eq('id', dbRow.id)
          if (error) {
            console.log(`    ! write failed for ${res.slug}: ${error.message}`)
          } else {
            written += 1
            console.log(`    ✓ wrote ${res.resolvedId} → albums.spotify_id (${res.slug})`)
          }
        }
      }
    }
  }

  // 7. Static-catalog suggestions — print, do not rewrite TS. A
  //    confident resolved id that differs from the static catalog is
  //    surfaced so a human can update lib/albums.ts (or so the DB
  //    write above supersedes it at runtime, since the player prefers
  //    DB spotify_id).
  for (const { res } of results) {
    const stat = staticBySlug.get(res.slug)
    if (
      res.confidence === 'high' &&
      res.validated &&
      res.resolvedId &&
      stat?.spotifyId &&
      stat.spotifyId !== res.resolvedId
    ) {
      staticSuggestions.push({ slug: res.slug, from: stat.spotifyId, to: res.resolvedId })
    }
  }

  // 8. Summary + ritual verdict.
  const high = results.filter((r) => r.res.confidence === 'high').length
  const medium = results.filter((r) => r.res.confidence === 'medium').length
  const low = results.filter((r) => r.res.confidence === 'low').length
  const none = results.filter((r) => r.res.confidence === 'none').length
  const ritualUnresolved = results.filter(
    (r) => r.isRitualArtifact && (r.res.confidence === 'none' || r.res.resolvedId === null),
  )

  console.log('\n── summary ──')
  console.log(`albums audited : ${results.length}`)
  console.log(`high           : ${high}`)
  console.log(`medium         : ${medium}`)
  console.log(`low (unverified): ${low}`)
  console.log(`unresolved     : ${none}`)
  if (db) console.log(`written        : ${written}${args.write ? '' : ' (dry-run; pass --write to persist)'}`)

  if (staticSuggestions.length > 0) {
    console.log('\n── static catalog (lib/albums.ts) suggestions ──')
    for (const s of staticSuggestions) {
      console.log(`  ${s.slug}: ${s.from} → ${s.to}`)
    }
  }

  console.log('\n── ritual rooms verdict ──')
  if (ritualArtifactIds.size === 0 && db) {
    console.log('  (no ritual artifact albums found)')
  } else if (!db) {
    console.log('  (DB disabled — ritual artifact mapping unavailable)')
  } else if (ritualUnresolved.length === 0) {
    console.log('  ✓ every ritual artifact album resolved to a valid Spotify id.')
  } else {
    console.log('  ✗ ritual artifact albums WITHOUT a confident id:')
    for (const r of ritualUnresolved) {
      console.log(`    - ${r.res.slug}: ${r.res.reason ?? 'unresolved'}`)
    }
  }

  // Non-zero exit when a ritual album is unresolved, so CI can gate.
  process.exit(ritualUnresolved.length > 0 ? 2 : 0)
}

main().catch((err) => {
  console.error('[audit-album-spotify-ids] fatal:', err)
  process.exit(1)
})
