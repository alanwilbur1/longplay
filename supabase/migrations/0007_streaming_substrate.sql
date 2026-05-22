-- 0007_streaming_substrate.sql
--
-- Phase 4.1 — Streaming substrate.
--
-- Provider-agnostic listening infrastructure. The product needs real
-- listening signal (recent plays, top artists, library) from external
-- streaming services. This migration lays the storage and security so
-- the OAuth + ingestion pipelines can land in subsequent commits
-- without further schema work.
--
-- Tables:
--   listening_sources       — registry of supported providers
--   listening_connections   — per-user OAuth connection state + tokens
--   listening_events        — append-only normalized recent plays
--   favorite_artists        — top/saved artists per provider
--   favorite_albums         — top/saved albums per provider
--   favorite_tracks         — top/saved tracks per provider
--
-- Posture:
--   - tokens live in *_encrypted columns; ingest pipelines hold the
--     key. RLS denies client read of tokens (no SELECT grant on
--     those columns from client roles).
--   - listening_sources is the only public-readable table (catalog).
--   - events + favorites: owner SELECT, no client INSERT/UPDATE.
--     Writes happen via service role (OAuth callback + sync workers).
--   - listening_connections: owner SELECT + DELETE (so a listener can
--     disconnect a provider themselves). Inserts via service role.

-- ── Registry ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listening_sources (
  id           text PRIMARY KEY,   -- 'spotify' | 'apple_music' | future
  display_name text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO listening_sources (id, display_name, capabilities) VALUES
  ('spotify',     'Spotify',     '{"recent_plays":true,"top_artists":true,"top_tracks":true,"library":true}'::jsonb),
  ('apple_music', 'Apple Music', '{"library":true,"top_artists":false,"top_tracks":false,"recent_plays":false}'::jsonb)
ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      capabilities = EXCLUDED.capabilities;

-- ── Per-user OAuth connection ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listening_connections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  source_id                text NOT NULL REFERENCES listening_sources(id),
  external_account_id      text,
  display_name             text,
  scopes                   text[] NOT NULL DEFAULT '{}',
  access_token_encrypted   text,
  refresh_token_encrypted  text,
  token_expires_at         timestamptz,
  status                   text NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','revoked','error','reauth_required')),
  last_error               text,
  connected_at             timestamptz NOT NULL DEFAULT now(),
  last_sync_at             timestamptz,
  UNIQUE (user_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_listening_connections_user ON listening_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_listening_connections_status ON listening_connections(status) WHERE status <> 'active';

-- ── Append-only listening events ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listening_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  source_id           text NOT NULL REFERENCES listening_sources(id),
  external_track_id   text,
  track_title         text,
  artist_name         text,
  album_name          text,
  album_external_id   text,
  isrc                text,
  played_at           timestamptz NOT NULL,
  duration_ms         integer,
  context_type        text CHECK (context_type IN ('album','playlist','radio','search','library','unknown') OR context_type IS NULL),
  raw                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingested_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listening_events_user_played
  ON listening_events (user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_listening_events_user_source_played
  ON listening_events (user_id, source_id, played_at DESC);

-- ── Favorites (top + saved) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favorite_artists (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  source_id          text NOT NULL REFERENCES listening_sources(id),
  external_artist_id text NOT NULL,
  name               text NOT NULL,
  rank               integer,
  genres             text[] NOT NULL DEFAULT '{}',
  raw                jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_id, external_artist_id)
);
CREATE INDEX IF NOT EXISTS idx_favorite_artists_user_rank
  ON favorite_artists(user_id, rank NULLS LAST);

CREATE TABLE IF NOT EXISTS favorite_albums (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  source_id         text NOT NULL REFERENCES listening_sources(id),
  external_album_id text NOT NULL,
  title             text NOT NULL,
  artist            text,
  rank              integer,
  raw               jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_id, external_album_id)
);
CREATE INDEX IF NOT EXISTS idx_favorite_albums_user_rank
  ON favorite_albums(user_id, rank NULLS LAST);

CREATE TABLE IF NOT EXISTS favorite_tracks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  source_id         text NOT NULL REFERENCES listening_sources(id),
  external_track_id text NOT NULL,
  title             text NOT NULL,
  artist            text,
  album             text,
  isrc              text,
  rank              integer,
  raw               jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_id, external_track_id)
);
CREATE INDEX IF NOT EXISTS idx_favorite_tracks_user_rank
  ON favorite_tracks(user_id, rank NULLS LAST);

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE listening_sources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_artists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_albums       ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorite_tracks       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON listening_sources     FROM anon, authenticated;
REVOKE ALL ON listening_connections FROM anon, authenticated;
REVOKE ALL ON listening_events      FROM anon, authenticated;
REVOKE ALL ON favorite_artists      FROM anon, authenticated;
REVOKE ALL ON favorite_albums       FROM anon, authenticated;
REVOKE ALL ON favorite_tracks       FROM anon, authenticated;

-- listening_sources — public catalog
GRANT SELECT ON listening_sources TO anon, authenticated;
DROP POLICY IF EXISTS listening_sources_public_select ON listening_sources;
CREATE POLICY listening_sources_public_select ON listening_sources
  FOR SELECT TO anon, authenticated USING (true);

-- listening_connections — owner SELECT + DELETE (no client INSERT/UPDATE;
-- token writes go through service role from the OAuth callback)
GRANT SELECT, DELETE ON listening_connections TO authenticated;
DROP POLICY IF EXISTS listening_connections_self_select ON listening_connections;
CREATE POLICY listening_connections_self_select ON listening_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS listening_connections_self_delete ON listening_connections;
CREATE POLICY listening_connections_self_delete ON listening_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- listening_events — owner SELECT (writes via service role)
GRANT SELECT ON listening_events TO authenticated;
DROP POLICY IF EXISTS listening_events_self_select ON listening_events;
CREATE POLICY listening_events_self_select ON listening_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- favorites — owner SELECT (writes via service role)
GRANT SELECT ON favorite_artists TO authenticated;
DROP POLICY IF EXISTS favorite_artists_self_select ON favorite_artists;
CREATE POLICY favorite_artists_self_select ON favorite_artists
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT ON favorite_albums TO authenticated;
DROP POLICY IF EXISTS favorite_albums_self_select ON favorite_albums;
CREATE POLICY favorite_albums_self_select ON favorite_albums
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT ON favorite_tracks TO authenticated;
DROP POLICY IF EXISTS favorite_tracks_self_select ON favorite_tracks;
CREATE POLICY favorite_tracks_self_select ON favorite_tracks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS listening_connections_touch_updated_at ON listening_connections;
-- (no updated_at column on connections by design — last_sync_at and
-- status carry the freshness signal)
