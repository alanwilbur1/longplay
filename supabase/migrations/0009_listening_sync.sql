-- 0009_listening_sync.sql
--
-- Phase 4.3 — Real Spotify ingestion + listening identity substrate.
--
-- Two additive changes:
--   1. UNIQUE on listening_events so repeat syncs idempotently upsert
--      the same recently-played row instead of duplicating.
--   2. listening_profile_snapshots — lightweight per-user summary
--      computed from listening_events + favorite_*. Owner-read RLS;
--      writes via service role only (sync orchestrator).
--
-- Auth/onboarding/listening_connections tables untouched.

-- ── listening_events dedupe ─────────────────────────────────────────────
-- One user can play the same track at different times, but not at the
-- exact same timestamp. Spotify's recently-played API returns events
-- keyed by played_at to millisecond precision, so collisions only
-- happen on retry, which is exactly what we want to dedupe.
DO $$ BEGIN
  ALTER TABLE listening_events
    ADD CONSTRAINT listening_events_user_src_track_played_unique
    UNIQUE (user_id, source_id, external_track_id, played_at);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── listening_profile_snapshots ─────────────────────────────────────────
-- One row per user. Re-computed by the sync orchestrator after every
-- successful provider sync. Cheap to read (snapshot is denormalized).
CREATE TABLE IF NOT EXISTS listening_profile_snapshots (
  user_id                 uuid PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  -- Aggregated signals
  top_genres              text[]  NOT NULL DEFAULT '{}',     -- de-duped, ranked
  top_artist_ids          text[]  NOT NULL DEFAULT '{}',     -- top N favorite artist ids
  top_track_ids           text[]  NOT NULL DEFAULT '{}',     -- top N favorite track ids
  saved_album_count       integer NOT NULL DEFAULT 0,
  recent_event_count      integer NOT NULL DEFAULT 0,        -- events in last 30 days
  -- Initial affinity tag set — derived from genres + simple heuristics
  affinity_tags           text[]  NOT NULL DEFAULT '{}',
  -- Listening "density": cheap rolling indicator of how active the
  -- listener has been. low / medium / high — null when no signal yet.
  recent_density          text CHECK (recent_density IS NULL OR recent_density IN ('low','medium','high')),
  -- Free-form signal blob for future fields without another migration
  signals                 jsonb   NOT NULL DEFAULT '{}'::jsonb,
  computed_at             timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lps_top_genres_gin
  ON listening_profile_snapshots USING GIN (top_genres);

ALTER TABLE listening_profile_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON listening_profile_snapshots FROM anon, authenticated;
GRANT SELECT ON listening_profile_snapshots TO authenticated;

DROP POLICY IF EXISTS lps_self_select ON listening_profile_snapshots;
CREATE POLICY lps_self_select
  ON listening_profile_snapshots
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- INSERT/UPDATE remain service-role only.

DROP TRIGGER IF EXISTS trg_lps_touch_updated_at ON listening_profile_snapshots;
CREATE TRIGGER trg_lps_touch_updated_at
  BEFORE UPDATE ON listening_profile_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
