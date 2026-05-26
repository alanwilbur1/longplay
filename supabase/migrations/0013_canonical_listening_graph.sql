-- 0013_canonical_listening_graph.sql
--
-- Phase 6A.3 — Layer 2: Canonical Listening Graph.
--
-- Provider-agnostic, deterministic, fully regeneratable from Layer 1
-- (favorite_*, listening_events, artist_genre_enrichments). This layer
-- owns:
--   1. Canonical artist/album/track identity (per-provider keys today;
--      cross-provider merge later — keys are shape-portable).
--   2. Union of Spotify genres + Last.fm enrichment canonical_genres
--      (currently done at recommendation hot-path; this moves it
--      upstream so the recommender reads precomputed values).
--   3. Aggregate listener affinity signals (play_count,
--      recent_play_count, last_played_at, rank_weight, recency_score,
--      affinity_score).
--   4. Aggregate genre weights (one row per user × canonical genre).
--
-- Posture:
--   - service-role writes only; owner self-SELECT
--   - additive — does NOT modify favorite_*, listening_events, or
--     artist_genre_enrichments
--   - recommendation pipeline continues reading legacy tables in
--     Phase 6A.3 (migration happens in 6A.4)
--
-- canonical_*_key shape: '<source_id>:<external_id>'
--   spotify artist:  'spotify:0WrCpvr...'
--   spotify track:   'spotify:7M7ekL...'
--   spotify album:   'spotify:5lUVR2...'
-- This is intentionally a stable string format so a future cross-
-- provider merge (Apple Music albums sharing an MusicBrainz ID with
-- Spotify, etc.) can add a separate canonical_id WITHOUT changing
-- this key — the per-source key remains the natural join target.

-- ── listener_artists ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listener_artists (
  user_id                uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  canonical_artist_key   text NOT NULL,
  source_id              text NOT NULL REFERENCES listening_sources(id),
  external_artist_id     text NOT NULL,
  display_name           text NOT NULL,
  -- Union of normalized Spotify genres + Last.fm enrichment canonical
  -- genres (status='succeeded'). Deduped, lowercase, single source of
  -- truth for "what genres does this artist signal for this listener?"
  canonical_genres       text[] NOT NULL DEFAULT '{}',
  -- Position in the listener's top-artists list (nullable: artists
  -- discovered via tracks/albums/events stay unranked).
  top_rank               integer,
  -- Aggregated from listening_events.artist_name (case-sensitive
  -- match on the provider-canonical name).
  play_count             integer NOT NULL DEFAULT 0,
  recent_play_count      integer NOT NULL DEFAULT 0,  -- last 30 days
  last_played_at         timestamptz,
  -- Deterministic explainable scores. See lib/streaming/normalization.ts.
  rank_weight            numeric(6,4) NOT NULL DEFAULT 0,
  recency_score          numeric(6,4) NOT NULL DEFAULT 0,
  affinity_score         numeric(8,4) NOT NULL DEFAULT 0,
  computed_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, canonical_artist_key)
);

CREATE INDEX IF NOT EXISTS idx_listener_artists_user_rank
  ON listener_artists (user_id, top_rank NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_listener_artists_user_affinity
  ON listener_artists (user_id, affinity_score DESC);

-- ── listener_albums ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listener_albums (
  user_id                uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  canonical_album_key    text NOT NULL,
  source_id              text NOT NULL REFERENCES listening_sources(id),
  external_album_id      text NOT NULL,
  title                  text NOT NULL,
  artist_name            text,
  -- Position in the listener's saved-albums list (nullable when the
  -- album was observed only via plays, not in the saved library).
  top_rank               integer,
  rank_weight            numeric(6,4) NOT NULL DEFAULT 0,
  computed_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, canonical_album_key)
);

CREATE INDEX IF NOT EXISTS idx_listener_albums_user_rank
  ON listener_albums (user_id, top_rank NULLS LAST);

-- ── listener_tracks ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listener_tracks (
  user_id                uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  canonical_track_key    text NOT NULL,
  source_id              text NOT NULL REFERENCES listening_sources(id),
  external_track_id      text NOT NULL,
  -- ISRC when the provider exposes it. Cross-provider dedup key for
  -- future merge work (same recording on Spotify + Apple Music shares
  -- an ISRC). Not the canonical key — kept as a side index target.
  isrc                   text,
  title                  text NOT NULL,
  artist_name            text,
  album_name             text,
  top_rank               integer,
  play_count             integer NOT NULL DEFAULT 0,
  last_played_at         timestamptz,
  rank_weight            numeric(6,4) NOT NULL DEFAULT 0,
  recency_score          numeric(6,4) NOT NULL DEFAULT 0,
  affinity_score         numeric(8,4) NOT NULL DEFAULT 0,
  computed_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, canonical_track_key)
);

CREATE INDEX IF NOT EXISTS idx_listener_tracks_user_rank
  ON listener_tracks (user_id, top_rank NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_listener_tracks_user_affinity
  ON listener_tracks (user_id, affinity_score DESC);
CREATE INDEX IF NOT EXISTS idx_listener_tracks_user_isrc
  ON listener_tracks (user_id, isrc) WHERE isrc IS NOT NULL;

-- ── listener_genres ──────────────────────────────────────────────
-- Per-user genre weights, derived from listener_artists.canonical_genres
-- weighted by each artist's rank_weight. This is the precomputed
-- equivalent of the loop currently inside
-- recomputeListeningProfileSnapshot() — moving it to Layer 2 means
-- the recommender (and future identity snapshots) read a fixed view.

CREATE TABLE IF NOT EXISTS listener_genres (
  user_id          uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  genre            text NOT NULL,
  artist_count     integer NOT NULL DEFAULT 0,
  -- Sum of contributing artists' rank_weight for this genre.
  weighted_score   numeric(10,4) NOT NULL DEFAULT 0,
  rank             integer,   -- 1..N within (user_id), NULL when not in top-N
  computed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, genre)
);

CREATE INDEX IF NOT EXISTS idx_listener_genres_user_rank
  ON listener_genres (user_id, rank NULLS LAST);

-- ── RLS ──────────────────────────────────────────────────────────
-- Same posture as listening_events / favorite_*: owner SELECT only,
-- service role writes via the recompute path. No client INSERT/UPDATE
-- grants — the entire graph is derived, never user-authored.

ALTER TABLE listener_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE listener_albums  ENABLE ROW LEVEL SECURITY;
ALTER TABLE listener_tracks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE listener_genres  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON listener_artists FROM anon, authenticated;
REVOKE ALL ON listener_albums  FROM anon, authenticated;
REVOKE ALL ON listener_tracks  FROM anon, authenticated;
REVOKE ALL ON listener_genres  FROM anon, authenticated;

GRANT SELECT ON listener_artists TO authenticated;
GRANT SELECT ON listener_albums  TO authenticated;
GRANT SELECT ON listener_tracks  TO authenticated;
GRANT SELECT ON listener_genres  TO authenticated;

DROP POLICY IF EXISTS listener_artists_self_select ON listener_artists;
CREATE POLICY listener_artists_self_select ON listener_artists
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS listener_albums_self_select ON listener_albums;
CREATE POLICY listener_albums_self_select ON listener_albums
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS listener_tracks_self_select ON listener_tracks;
CREATE POLICY listener_tracks_self_select ON listener_tracks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS listener_genres_self_select ON listener_genres;
CREATE POLICY listener_genres_self_select ON listener_genres
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
