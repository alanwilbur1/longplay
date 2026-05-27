import 'server-only'

import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { upsertAndPrune } from '@/lib/db/upsert-and-prune'
import {
  canonicalAlbumKey,
  canonicalArtistKey,
  canonicalTrackKey,
  computeAlbumRankWeight,
  computeArtistAffinity,
  computeRankWeight,
  computeRecencyScore,
  computeTrackAffinity,
  mergeArtistGenres,
} from './normalization'

/**
 * lib/streaming/listener-graph.ts — Phase 6A.3
 *
 * Layer 2 orchestration. Reads raw Layer 1 rows for one user and
 * regenerates the canonical listening graph:
 *   listener_artists  ← favorite_artists ∪ enrichment ∪ event aggregates
 *   listener_albums   ← favorite_albums
 *   listener_tracks   ← favorite_tracks ∪ event aggregates
 *   listener_genres   ← aggregated from listener_artists.canonical_genres
 *
 * Idempotent — re-running on identical Layer 1 state produces
 * byte-identical Layer 2 state. Implements delete-then-insert per
 * table per user, so stale rows from un-followed artists / removed
 * saved albums don't linger.
 *
 * Called from syncProviderForUser after the favorite_* / events
 * upserts complete and BEFORE recomputeListeningProfileSnapshot. The
 * snapshot path still reads from favorite_* directly in Phase 6A.3 —
 * cutover happens in 6A.4 once recommendation reads also move over.
 *
 * Service-role writes. Never reads tokens. Pure of the recommendation
 * pipeline — no scoring assumptions baked in here.
 */

const RECENT_WINDOW_DAYS = 30
const TOP_GENRES_RANK_LIMIT = 30
// Bounded fan-out: same generous artist window the snapshot uses.
const ARTIST_QUERY_LIMIT = 200

export interface RecomputeListenerGraphResult {
  user_id: string
  artists_written: number
  albums_written: number
  tracks_written: number
  genres_written: number
  duration_ms: number
}

/**
 * Regenerate the Layer 2 graph for one user.
 *
 * Best-effort by design — callers (syncProviderForUser) wrap in
 * try/catch. A failure here never poisons the sync's primary state
 * (favorite_* + listening_events are already durable by this point).
 */
export async function recomputeListenerGraph(
  userId: string,
  options: { now?: Date } = {},
): Promise<RecomputeListenerGraphResult> {
  const startedAt = Date.now()
  const now = options.now ?? new Date()
  const admin = getSupabaseAdminClient()

  // ── Read Layer 1 inputs in parallel ──────────────────────────────
  const recentSinceIso = new Date(
    now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const [
    artistRowsRes,
    enrichmentRowsRes,
    trackRowsRes,
    albumRowsRes,
    allEventsRes,
    recentEventsRes,
  ] = await Promise.all([
    admin
      .from('favorite_artists')
      .select('source_id, external_artist_id, name, rank, genres')
      .eq('user_id', userId)
      .order('rank', { ascending: true, nullsFirst: false })
      .limit(ARTIST_QUERY_LIMIT),
    admin
      .from('artist_genre_enrichments')
      .select('source_id, external_artist_id, canonical_genres')
      .eq('user_id', userId)
      .eq('status', 'succeeded'),
    admin
      .from('favorite_tracks')
      .select('source_id, external_track_id, isrc, title, artist, album, rank')
      .eq('user_id', userId)
      .order('rank', { ascending: true, nullsFirst: false }),
    admin
      .from('favorite_albums')
      .select('source_id, external_album_id, title, artist, rank')
      .eq('user_id', userId)
      .order('rank', { ascending: true, nullsFirst: false }),
    // Full event window for play_count / last_played_at. Could be huge
    // for power users; aggregated server-side could be cheaper, but
    // PostgREST aggregations need RPC or views. Keep it simple for
    // now — Phase 6A.3 prioritizes correctness, 6A.5 can optimize.
    admin
      .from('listening_events')
      .select('source_id, external_track_id, artist_name, played_at')
      .eq('user_id', userId),
    admin
      .from('listening_events')
      .select('source_id, artist_name, external_track_id', { count: 'exact', head: false })
      .eq('user_id', userId)
      .gte('played_at', recentSinceIso),
  ])

  type ArtistRow = {
    source_id: string
    external_artist_id: string
    name: string
    rank: number | null
    genres: string[] | null
  }
  type EnrichRow = {
    source_id: string
    external_artist_id: string
    canonical_genres: string[] | null
  }
  type TrackRow = {
    source_id: string
    external_track_id: string
    isrc: string | null
    title: string
    artist: string | null
    album: string | null
    rank: number | null
  }
  type AlbumRow = {
    source_id: string
    external_album_id: string
    title: string
    artist: string | null
    rank: number | null
  }
  type EventRow = {
    source_id: string
    external_track_id: string | null
    artist_name: string | null
    played_at: string
  }
  type RecentEventRow = {
    source_id: string
    external_track_id: string | null
    artist_name: string | null
  }

  const artistRows = (artistRowsRes.data ?? []) as unknown as ArtistRow[]
  const enrichmentRows = (enrichmentRowsRes.data ?? []) as unknown as EnrichRow[]
  const trackRows = (trackRowsRes.data ?? []) as unknown as TrackRow[]
  const albumRows = (albumRowsRes.data ?? []) as unknown as AlbumRow[]
  const allEvents = (allEventsRes.data ?? []) as unknown as EventRow[]
  const recentEvents = (recentEventsRes.data ?? []) as unknown as RecentEventRow[]

  // ── Aggregate events per (source_id, artist_name) and per
  //    (source_id, external_track_id) ────────────────────────────────
  type ArtistAgg = {
    playCount: number
    recentPlayCount: number
    lastPlayedMs: number | null
  }
  const eventsByArtistKey = new Map<string, ArtistAgg>()
  function nameKey(sourceId: string, artistName: string | null | undefined): string | null {
    if (!artistName) return null
    return `${sourceId}::${artistName}`
  }
  for (const ev of allEvents) {
    const k = nameKey(ev.source_id, ev.artist_name)
    if (!k) continue
    const prev = eventsByArtistKey.get(k) ?? {
      playCount: 0,
      recentPlayCount: 0,
      lastPlayedMs: null,
    }
    prev.playCount += 1
    const t = Date.parse(ev.played_at)
    if (Number.isFinite(t) && (prev.lastPlayedMs === null || t > prev.lastPlayedMs)) {
      prev.lastPlayedMs = t
    }
    eventsByArtistKey.set(k, prev)
  }
  for (const ev of recentEvents) {
    const k = nameKey(ev.source_id, ev.artist_name)
    if (!k) continue
    const prev = eventsByArtistKey.get(k)
    if (prev) prev.recentPlayCount += 1
  }

  type TrackAgg = { playCount: number; lastPlayedMs: number | null }
  const eventsByTrackKey = new Map<string, TrackAgg>()
  function trackKey(sourceId: string, externalId: string | null | undefined): string | null {
    if (!externalId) return null
    return `${sourceId}::${externalId}`
  }
  for (const ev of allEvents) {
    const k = trackKey(ev.source_id, ev.external_track_id)
    if (!k) continue
    const prev = eventsByTrackKey.get(k) ?? { playCount: 0, lastPlayedMs: null }
    prev.playCount += 1
    const t = Date.parse(ev.played_at)
    if (Number.isFinite(t) && (prev.lastPlayedMs === null || t > prev.lastPlayedMs)) {
      prev.lastPlayedMs = t
    }
    eventsByTrackKey.set(k, prev)
  }

  // ── Build listener_artists rows ──────────────────────────────────
  // Index enrichment by external_artist_id for fast lookup. (Source
  // is always Spotify for enrichment today; the schema would need a
  // composite key when Apple Music joins.)
  const enrichmentByKey = new Map<string, string[]>()
  for (const e of enrichmentRows) {
    enrichmentByKey.set(
      `${e.source_id}::${e.external_artist_id}`,
      Array.isArray(e.canonical_genres) ? e.canonical_genres : [],
    )
  }
  const nowIso = now.toISOString()
  const computedAt = nowIso

  const artistRowsOut = artistRows.map((a) => {
    const canonicalKey = canonicalArtistKey(a.source_id, a.external_artist_id)
    const canonicalGenres = mergeArtistGenres(
      a.genres ?? [],
      enrichmentByKey.get(`${a.source_id}::${a.external_artist_id}`),
    )
    const agg = eventsByArtistKey.get(nameKey(a.source_id, a.name) ?? '') ?? {
      playCount: 0,
      recentPlayCount: 0,
      lastPlayedMs: null,
    }
    const lastPlayedAt = agg.lastPlayedMs ? new Date(agg.lastPlayedMs).toISOString() : null
    const rankWeight = computeRankWeight(a.rank)
    const recencyScore = computeRecencyScore(lastPlayedAt, now)
    const affinityScore = computeArtistAffinity({
      rankWeight,
      recencyScore,
      playCount: agg.playCount,
      recentPlayCount: agg.recentPlayCount,
    })
    return {
      user_id: userId,
      canonical_artist_key: canonicalKey,
      source_id: a.source_id,
      external_artist_id: a.external_artist_id,
      display_name: a.name,
      canonical_genres: canonicalGenres,
      top_rank: a.rank,
      play_count: agg.playCount,
      recent_play_count: agg.recentPlayCount,
      last_played_at: lastPlayedAt,
      rank_weight: rankWeight,
      recency_score: recencyScore,
      affinity_score: affinityScore,
      computed_at: computedAt,
    }
  })

  // ── Build listener_tracks rows ───────────────────────────────────
  const trackRowsOut = trackRows.map((t) => {
    const canonicalKey = canonicalTrackKey(t.source_id, t.external_track_id)
    const agg = eventsByTrackKey.get(`${t.source_id}::${t.external_track_id}`) ?? {
      playCount: 0,
      lastPlayedMs: null,
    }
    const lastPlayedAt = agg.lastPlayedMs ? new Date(agg.lastPlayedMs).toISOString() : null
    const rankWeight = computeRankWeight(t.rank)
    const recencyScore = computeRecencyScore(lastPlayedAt, now)
    const affinityScore = computeTrackAffinity({
      rankWeight,
      recencyScore,
      playCount: agg.playCount,
    })
    return {
      user_id: userId,
      canonical_track_key: canonicalKey,
      source_id: t.source_id,
      external_track_id: t.external_track_id,
      isrc: t.isrc,
      title: t.title,
      artist_name: t.artist,
      album_name: t.album,
      top_rank: t.rank,
      play_count: agg.playCount,
      last_played_at: lastPlayedAt,
      rank_weight: rankWeight,
      recency_score: recencyScore,
      affinity_score: affinityScore,
      computed_at: computedAt,
    }
  })

  // ── Build listener_albums rows ───────────────────────────────────
  const albumRowsOut = albumRows.map((al) => ({
    user_id: userId,
    canonical_album_key: canonicalAlbumKey(al.source_id, al.external_album_id),
    source_id: al.source_id,
    external_album_id: al.external_album_id,
    title: al.title,
    artist_name: al.artist,
    top_rank: al.rank,
    rank_weight: computeAlbumRankWeight(al.rank),
    computed_at: computedAt,
  }))

  // ── Aggregate listener_genres from artists ──────────────────────
  type GenreAgg = { artistCount: number; weightedScore: number }
  const genreAggMap = new Map<string, GenreAgg>()
  for (const a of artistRowsOut) {
    for (const g of a.canonical_genres) {
      const prev = genreAggMap.get(g) ?? { artistCount: 0, weightedScore: 0 }
      prev.artistCount += 1
      prev.weightedScore += a.rank_weight
      genreAggMap.set(g, prev)
    }
  }
  // Sort by weighted_score desc to assign rank deterministically.
  const sortedGenres = Array.from(genreAggMap.entries())
    .map(([genre, agg]) => ({
      genre,
      artistCount: agg.artistCount,
      weightedScore: Math.round(agg.weightedScore * 10_000) / 10_000,
    }))
    // Primary: weighted_score desc. Secondary: artist_count desc. Tertiary:
    // genre asc (alphabetical) — ensures ties resolve deterministically.
    .sort((x, y) => {
      if (y.weightedScore !== x.weightedScore) return y.weightedScore - x.weightedScore
      if (y.artistCount !== x.artistCount) return y.artistCount - x.artistCount
      return x.genre.localeCompare(y.genre)
    })
  const genreRowsOut = sortedGenres.map((g, i) => ({
    user_id: userId,
    genre: g.genre,
    artist_count: g.artistCount,
    weighted_score: g.weightedScore,
    rank: i < TOP_GENRES_RANK_LIMIT ? i + 1 : null,
    computed_at: computedAt,
  }))

  // ── Write: UPSERT-and-prune per table (Phase 6A.14) ──────────────
  // Previously: delete-then-insert. A crash between the delete and the
  // chunked insert left the user's listener_* tables EMPTY until the
  // next sync — and once ritual cycles read these tables continuously,
  // an empty window means a room loses memory mid-cycle. We now upsert
  // the new row set in chunks (so the table is continuously populated
  // at count >= max(prev, new)) and then prune any rows whose natural
  // key isn't in the new set (cleans up un-followed artists / removed
  // saved albums). See lib/db/upsert-and-prune.ts for the invariants.
  //
  // Service-role bypasses RLS; the four tables have no client write
  // grants. Operations run in parallel — they target independent
  // tables so ordering doesn't matter.
  const [
    artistsResult,
    albumsResult,
    tracksResult,
    genresResult,
  ] = await Promise.all([
    upsertAndPrune({
      admin,
      table: 'listener_artists',
      userId,
      rows: artistRowsOut,
      keyCol: 'canonical_artist_key',
      onConflict: 'user_id,canonical_artist_key',
    }),
    upsertAndPrune({
      admin,
      table: 'listener_albums',
      userId,
      rows: albumRowsOut,
      keyCol: 'canonical_album_key',
      onConflict: 'user_id,canonical_album_key',
    }),
    upsertAndPrune({
      admin,
      table: 'listener_tracks',
      userId,
      rows: trackRowsOut,
      keyCol: 'canonical_track_key',
      onConflict: 'user_id,canonical_track_key',
    }),
    upsertAndPrune({
      admin,
      table: 'listener_genres',
      userId,
      rows: genreRowsOut,
      keyCol: 'genre',
      onConflict: 'user_id,genre',
    }),
  ])
  const artistsWritten = artistsResult.upserted
  const albumsWritten = albumsResult.upserted
  const tracksWritten = tracksResult.upserted
  const genresWritten = genresResult.upserted

  return {
    user_id: userId,
    artists_written: artistsWritten,
    albums_written: albumsWritten,
    tracks_written: tracksWritten,
    genres_written: genresWritten,
    duration_ms: Date.now() - startedAt,
  }
}
