-- 0011_artist_genre_enrichments.sql
--
-- Phase 4.5 — async external genre enrichment per artist.
--
-- Spotify's /v1/artists/{id} routinely returns `genres: []` even for
-- successfully hydrated artists (a documented upstream regression
-- starting in late 2024). To produce real genre signal we add a
-- second-stage enrichment layer keyed off favorite_artists, querying
-- secondary providers (Last.fm first) for tag data, normalizing into
-- a canonical genre vocabulary, and persisting both shapes
-- separately:
--
--   raw_tags         — exact provider payload (untouched, jsonb)
--   canonical_genres — normalized to LongPlay's genre vocabulary
--
-- Per the architectural rule "do not invent fake genres", the
-- normalized output is always strictly derived from raw_tags — we
-- never synthesize a tag the provider didn't return.
--
-- One row per (user_id, source_id, external_artist_id). Row state
-- machine:
--
--   queued        — fresh, waiting to be picked up
--   in_progress   — runner has claimed it (set right before HTTP call)
--   succeeded     — provider returned tags; canonical_genres populated
--   failed        — provider errored; retried with exponential backoff
--   skipped       — runner intentionally bypassed (e.g. blocklisted)
--
-- This table doubles as cache: a succeeded job's canonical_genres
-- are reused on subsequent snapshot recomputes until a forced
-- re-enqueue resets the status.

CREATE TABLE IF NOT EXISTS artist_genre_enrichments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  source_id           text NOT NULL REFERENCES listening_sources(id),
  external_artist_id  text NOT NULL,
  artist_name         text NOT NULL,

  status              text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','in_progress','succeeded','failed','skipped')),
  provider            text,

  raw_tags            jsonb  NOT NULL DEFAULT '[]'::jsonb,
  canonical_genres    text[] NOT NULL DEFAULT '{}',
  confidence          numeric CHECK (confidence IS NULL OR (confidence BETWEEN 0 AND 1)),

  attempt_count       integer NOT NULL DEFAULT 0,
  last_attempted_at   timestamptz,
  last_error          text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, source_id, external_artist_id)
);

CREATE INDEX IF NOT EXISTS idx_age_user_status
  ON artist_genre_enrichments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_age_last_attempted
  ON artist_genre_enrichments(last_attempted_at);
CREATE INDEX IF NOT EXISTS idx_age_canonical_genres
  ON artist_genre_enrichments USING GIN (canonical_genres);

ALTER TABLE artist_genre_enrichments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON artist_genre_enrichments FROM anon, authenticated;
GRANT SELECT ON artist_genre_enrichments TO authenticated;

DROP POLICY IF EXISTS age_self_select ON artist_genre_enrichments;
CREATE POLICY age_self_select ON artist_genre_enrichments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_age_touch_updated_at ON artist_genre_enrichments;
CREATE TRIGGER trg_age_touch_updated_at
  BEFORE UPDATE ON artist_genre_enrichments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
