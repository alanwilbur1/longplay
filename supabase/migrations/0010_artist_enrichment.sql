-- 0010_artist_enrichment.sql
--
-- Phase 4.4 — additive columns on favorite_artists for hydrated
-- Spotify (and future-provider) artist metadata.
--
-- Spotify's /me/top/* and /me/player/recently-played endpoints return
-- SimplifiedArtist objects on tracks/albums (id + name only — NO
-- genres, NO popularity, NO images). Even the full /me/top/artists
-- response often returns genres:[] for many artists. To get reliable
-- genre signal we must batch-hydrate via /v1/artists?ids=... and
-- persist the result. This migration only adds nullable columns —
-- no destructive change to favorite_artists.
--
-- New columns:
--   popularity integer NULL  — 0-100 (Spotify's "popularity" field)
--   followers  bigint  NULL  — Spotify's followers.total
--   image_url  text    NULL  — best (largest) image, if any
--
-- All three are safe to be NULL for legacy rows; the sync will
-- populate them on the next run.

ALTER TABLE favorite_artists
  ADD COLUMN IF NOT EXISTS popularity integer,
  ADD COLUMN IF NOT EXISTS followers  bigint,
  ADD COLUMN IF NOT EXISTS image_url  text;

-- Sanity checks expressed as constraints. Popularity is 0-100 per
-- Spotify's spec; followers cannot be negative. NULL is allowed for
-- both — we only constrain when a value is present.
ALTER TABLE favorite_artists
  DROP CONSTRAINT IF EXISTS favorite_artists_popularity_range;
ALTER TABLE favorite_artists
  ADD CONSTRAINT favorite_artists_popularity_range
  CHECK (popularity IS NULL OR (popularity BETWEEN 0 AND 100));

ALTER TABLE favorite_artists
  DROP CONSTRAINT IF EXISTS favorite_artists_followers_nonneg;
ALTER TABLE favorite_artists
  ADD CONSTRAINT favorite_artists_followers_nonneg
  CHECK (followers IS NULL OR followers >= 0);

-- Helpful index for ad-hoc "top genres across my library" queries.
CREATE INDEX IF NOT EXISTS idx_favorite_artists_genres
  ON favorite_artists USING GIN (genres);
