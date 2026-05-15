/**
 * lib/data/albums.ts
 *
 * DB-backed album helpers. Returns objects that exactly match the Album
 * interface from lib/albums.ts. All reads use the public (anon) client —
 * public-read RLS policies must be in place (see lib/schema-phase2.sql).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Album } from '../albums'

// ── Public-read client (anon key, bypasses auth cookie) ─────────────────────

function getDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('[data/albums] Supabase env vars not set')
  return createClient(url, key)
}

// ── Assembler ────────────────────────────────────────────────────────────────

export function assembleAlbum(row: Record<string, unknown>): Album {
  const streaming = (row.streaming_urls as Record<string, string> | null) ?? {}
  return {
    id: (row.slug as string) ?? (row.id as string),
    title: (row.title as string) ?? '',
    artist: (row.artist as string) ?? '',
    year: (row.year as string) ?? '',
    cover: (row.cover_url as string) ?? '',
    fallbackGradient:
      (row.fallback_gradient as string) ?? 'from-slate-800 to-slate-900',
    albumArtSource: (row.artwork_source as Album['albumArtSource']) ?? undefined,
    lastVerifiedAt: (row.artwork_verified_at as string) ?? undefined,
    description: (row.description as string) ?? undefined,
    emotionalTags:
      (row.emotional_tags as string[] | null)?.length
        ? (row.emotional_tags as string[])
        : undefined,
    roomAssociations:
      (row.room_associations as string[] | null)?.length
        ? (row.room_associations as string[])
        : undefined,
    spotifyId: (row.spotify_id as string) ?? undefined,
    spotifyUrl: streaming.spotify ?? undefined,
    appleMusicUrl: streaming.appleMusic ?? undefined,
    tidalUrl: streaming.tidal ?? undefined,
    qobuzUrl: streaming.qobuz ?? undefined,
    bandcampUrl: streaming.bandcamp ?? undefined,
    youtubeUrl: streaming.youtube ?? undefined,
    musicBrainzId: (row.musicbrainz_id as string) ?? undefined,
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getAlbumBySlug(slug: string): Promise<Album | undefined> {
  const { data, error } = await getDb()
    .from('albums')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !data) return undefined
  return assembleAlbum(data as Record<string, unknown>)
}

export async function listAllAlbums(): Promise<Album[]> {
  const { data, error } = await getDb()
    .from('albums')
    .select('*')
    .not('slug', 'is', null)
    .order('title')

  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(assembleAlbum)
}

export async function getAlbumsBySlugList(slugs: string[]): Promise<Album[]> {
  if (!slugs.length) return []
  const { data, error } = await getDb()
    .from('albums')
    .select('*')
    .in('slug', slugs)

  if (error || !data) return []
  const rows = (data as Record<string, unknown>[]).map(assembleAlbum)
  // preserve caller's order
  return slugs
    .map(s => rows.find(r => r.id === s))
    .filter((r): r is Album => r !== undefined)
}

export async function getAlbumsByIdList(ids: string[]): Promise<Album[]> {
  if (!ids.length) return []
  const { data, error } = await getDb()
    .from('albums')
    .select('*')
    .in('id', ids)

  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(assembleAlbum)
}
