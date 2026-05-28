/**
 * lib/data/album-tracks.ts — Phase 6B.5
 *
 * Read + write helpers for the album_tracks substrate (migration
 * 0023). Server-side only — uses the admin client because the table
 * has no GRANT for INSERT/UPDATE/DELETE to authenticated.
 *
 * Public surface:
 *   getAlbumTracksByAlbumId(albumUuid) → ordered row array
 *   upsertAlbumTracks(rows)            → idempotent UPSERT
 *   formatTrackDuration(ms)            → pure "M:SS" / "H:MM:SS"
 *
 * The pure formatter is exported for testability and so the UI
 * layer can format duration_ms without re-implementing.
 */

import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'

export interface AlbumTrackRow {
  id: string
  album_id: string
  provider: string
  provider_album_id: string
  provider_track_id: string
  disc_number: number
  track_number: number
  name: string
  duration_ms: number | null
  explicit: boolean
  preview_url: string | null
  external_url: string | null
  isrc: string | null
  created_at: string
  updated_at: string
}

export interface AlbumTrackUpsertInput {
  album_id: string
  provider: string
  provider_album_id: string
  provider_track_id: string
  disc_number: number
  track_number: number
  name: string
  duration_ms: number | null
  explicit: boolean
  preview_url: string | null
  external_url: string | null
  isrc: string | null
  raw?: Record<string, unknown>
}

// ── Reader ────────────────────────────────────────────────────────

/**
 * Tracks for one album in canonical playback order. Empty array on
 * no tracks (NOT an error — the album simply hasn't been hydrated
 * yet, and the UI's TracklistSurface falls back to its restrained
 * "Tracklist unavailable" line).
 *
 * Tolerant of lookup failure: returns [] and logs to the platform
 * log so an upstream DB hiccup never crashes the page render.
 */
export async function getAlbumTracksByAlbumId(
  albumUuid: string,
): Promise<AlbumTrackRow[]> {
  if (!albumUuid) return []
  const admin = getSupabaseAdminClient()
  type Builder = {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        order: (col: string, opts: { ascending: boolean }) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{
            data: AlbumTrackRow[] | null
            error: { code?: string; message: string } | null
          }>
        }
      }
    }
  }
  const { data, error } = await (
    admin.from('album_tracks') as unknown as Builder
  )
    .select(
      'id, album_id, provider, provider_album_id, provider_track_id, disc_number, track_number, name, duration_ms, explicit, preview_url, external_url, isrc, created_at, updated_at',
    )
    .eq('album_id', albumUuid)
    .order('disc_number', { ascending: true })
    .order('track_number', { ascending: true })
  if (error) {
    console.warn('[data/album-tracks] read failed', {
      album_id: albumUuid,
      code: error.code,
      message: error.message,
    })
    return []
  }
  return data ?? []
}

// ── Writer ────────────────────────────────────────────────────────

/**
 * UPSERT a batch of track rows for one album. Conflict target is
 * the (provider, provider_track_id) unique index — idempotent under
 * re-hydration. Returns the number of rows that landed; throws on
 * a DB error (caller is the hydration script, which logs).
 *
 * Caller is responsible for grouping rows by album. We don't enforce
 * a single-album invariant here because the script may want to
 * mix-and-match in a single transaction; the per-row album_id is
 * the source of truth.
 */
export async function upsertAlbumTracks(
  rows: AlbumTrackUpsertInput[],
): Promise<{ upserted: number }> {
  if (rows.length === 0) return { upserted: 0 }
  const admin = getSupabaseAdminClient()
  type Builder = {
    upsert: (
      values: Array<Record<string, unknown>>,
      opts: { onConflict: string; count: 'exact' },
    ) => Promise<{
      error: { code?: string; details?: string; hint?: string; message: string } | null
      count: number | null
    }>
  }
  const payload = rows.map((r) => ({
    album_id: r.album_id,
    provider: r.provider,
    provider_album_id: r.provider_album_id,
    provider_track_id: r.provider_track_id,
    disc_number: r.disc_number,
    track_number: r.track_number,
    name: r.name,
    duration_ms: r.duration_ms,
    explicit: r.explicit,
    preview_url: r.preview_url,
    external_url: r.external_url,
    isrc: r.isrc,
    raw: r.raw ?? {},
  }))
  const { error, count } = await (
    admin.from('album_tracks') as unknown as Builder
  ).upsert(payload, {
    onConflict: 'provider,provider_track_id',
    count: 'exact',
  })
  if (error) {
    throw new Error(
      `[data/album-tracks] upsert failed: code=${error.code ?? 'n/a'} details=${error.details ?? 'n/a'} hint=${error.hint ?? 'n/a'} message=${error.message}`,
    )
  }
  return { upserted: count ?? payload.length }
}

// ── Pure duration formatter ───────────────────────────────────────
// Implementation lives in @/lib/album-tracks-format (no 'server-only'
// tag) so the test script can import it without pulling in this
// module's server-only dependencies. Re-exported here for callers
// already importing from @/lib/data/album-tracks.
export { formatTrackDuration } from '@/lib/album-tracks-format'
