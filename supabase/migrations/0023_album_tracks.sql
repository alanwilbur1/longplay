-- 0023_album_tracks.sql
--
-- Phase 6B.5 — Real album track metadata substrate.
--
-- Creates the first persistent per-album-track table. Until now the
-- platform had only PER-USER track signals (favorite_tracks from
-- /me/top/tracks, listening_events from /me/player/recently-played).
-- No catalog-level track list existed, which forced the TracklistSurface
-- in the ritual hero to render a "Tracklist unavailable" fallback
-- (Phase 6B.4 follow-up). This table is the substrate the surface
-- will read once real Spotify track payloads have been hydrated.
--
-- DATA PROVENANCE
-- ─────────────────────────────────────────────────────────────────
-- Source of truth: Spotify's /v1/albums/{id}/tracks endpoint (or any
-- future provider). The endpoint is in the catalog-restricted
-- family — the same 403 posture Phase 6A.12's
-- SPOTIFY_CATALOG_HYDRATION_MODE flag governs for the artist
-- endpoints. Hydration MUST be best-effort: a 403 / 429 / network
-- failure leaves the row absent, never fakes a track. The
-- TracklistSurface UI degrades to its restrained fallback line
-- when no rows exist, which is the right editorial answer.
--
-- DESIGN
-- ─────────────────────────────────────────────────────────────────
-- Normalized one-row-per-track schema with two unique constraints:
--
--   UNIQUE (provider, provider_track_id)
--     Lets us UPSERT idempotently from a Spotify (or future
--     Apple Music / TIDAL) payload. Same Spotify track ID appearing
--     twice in a re-hydration is a no-op.
--
--   UNIQUE (album_id, provider, disc_number, track_number)
--     Guarantees position uniqueness within an album per provider.
--     A future re-hydration that returns a renumbered tracklist
--     produces a clean conflict instead of silently double-listing.
--
-- Future phases (NOT implemented here) can extend without migration:
--   · Track-level moments (link from moments.track_id → album_tracks.id)
--   · Track-level reflections (similar FK)
--   · Track-specific room ecology (sum per-track listens)
--   · "Most replayed / most annotated" rankings
--   · Playback-SDK timestamps (annotations at HH:MM:SS)
--
-- ACCESS POSTURE
-- ─────────────────────────────────────────────────────────────────
-- Template C (public-read catalog). Anyone can SELECT a track list
-- for any album. Writes are admin-only (no GRANT to authenticated
-- for INSERT/UPDATE/DELETE). Same posture as `albums` itself.

-- @template:C — public catalog table
CREATE TABLE IF NOT EXISTS album_tracks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owning album. CASCADE delete because tracks are nothing without
  -- the album row.
  album_id             uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,

  -- Provider provenance. Open vocabulary (text + length check, not
  -- enum) so future providers don't need a type migration.
  -- 'spotify' is the only writer today.
  provider             text NOT NULL DEFAULT 'spotify'
    CHECK (length(provider) <= 32),

  -- Track-level provider IDs. The provider_album_id is denormalized
  -- so a query can verify track ↔ album consistency without joining
  -- through `albums`.
  provider_album_id    text NOT NULL,
  provider_track_id    text NOT NULL,

  -- Position. Spotify and most providers number discs from 1.
  -- Most albums are single-disc; default keeps that case clean.
  disc_number          integer NOT NULL DEFAULT 1
    CHECK (disc_number >= 1),
  track_number         integer NOT NULL
    CHECK (track_number >= 1),

  -- Display fields.
  name                 text NOT NULL
    CHECK (length(name) > 0 AND length(name) <= 500),

  -- Duration in milliseconds. Nullable because some catalog
  -- endpoints (e.g. preview-only entries, or future providers)
  -- don't carry it. Renderers must tolerate null and format the
  -- row without a duration column.
  duration_ms          integer
    CHECK (duration_ms IS NULL OR (duration_ms >= 0 AND duration_ms <= 86400000)),

  -- Misc flags.
  explicit             boolean NOT NULL DEFAULT false,

  -- Optional links. preview_url is the 30-second mp3 sample
  -- Spotify exposes for some tracks; external_url is the
  -- web-player link for "open in Spotify" UX.
  preview_url          text,
  external_url         text,

  -- ISRC if present. Lets future ingestion deduplicate the same
  -- recording across providers.
  isrc                 text,

  -- Full provider payload for forensic / replay scenarios. Never
  -- read by renderers; persisted in case a future schema change
  -- needs to backfill a column we don't model today.
  raw                  jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Idempotent UPSERT key for re-hydration.
  CONSTRAINT album_tracks_provider_track_unique
    UNIQUE (provider, provider_track_id),
  -- Position uniqueness within an album per provider. Apple Music
  -- and Spotify can each carry their own track list for the same
  -- LongPlay album row; the provider column keeps them disjoint.
  CONSTRAINT album_tracks_album_position_unique
    UNIQUE (album_id, provider, disc_number, track_number)
);

-- Primary serving query: "give me the tracks for this album, in
-- order." The serving path joins on album_id + provider, orders by
-- disc + track.
CREATE INDEX IF NOT EXISTS idx_album_tracks_album_position
  ON album_tracks (album_id, provider, disc_number, track_number);

-- Operator query: "show me everything hydrated for this Spotify
-- album." Lets an audit script verify the hydrator landed the rows
-- without joining through `albums`.
CREATE INDEX IF NOT EXISTS idx_album_tracks_provider_album
  ON album_tracks (provider, provider_album_id);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE album_tracks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON album_tracks FROM anon, authenticated;
GRANT SELECT ON album_tracks TO anon, authenticated;

DROP POLICY IF EXISTS album_tracks_public_select ON album_tracks;
CREATE POLICY album_tracks_public_select ON album_tracks
  FOR SELECT TO anon, authenticated USING (true);

-- updated_at touch trigger (function defined in 0001 baseline).
DROP TRIGGER IF EXISTS trg_album_tracks_touch ON album_tracks;
CREATE TRIGGER trg_album_tracks_touch
  BEFORE UPDATE ON album_tracks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
