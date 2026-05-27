-- 0016_listener_identity.sql
--
-- Phase 6A.6 — Layer 5: Listener identity semantics.
--
-- Two tables for the identity interpretation layer:
--
--   listener_identity_traits     per-user × per-trait score + band
--                                + contributing_factors (JSONB) for
--                                "why is this trait X?" answers.
--
--   listener_archetype_snapshots per-user × per-archetype (rank 1..N)
--                                with confidence + supporting traits
--                                / rooms / genres for "why am I this
--                                archetype?" answers.
--
-- Both are derived layers — fully regeneratable from listener_*,
-- listening_profile_snapshots, room_affinity_scores, and the raw
-- listening_events / favorite_artists Layer 1 tables.
--
-- Architectural posture (Phase 6A.1 design principle restated):
--   Archetypes are NOT truth.
--   They are interpreted semantic projections of measurable
--   listening behavior. The supporting_* JSONB columns make the
--   interpretation inspectable so downstream UI can show the
--   evidence alongside the label.
--
-- algorithm_version on both tables — bumped whenever trait formulas
-- or archetype predicates change, so stale rows are detectable.
-- Initial value: 'identity_v1'.

-- ── Identity traits ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listener_identity_traits (
  user_id                uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  trait_key              text NOT NULL,
  -- [0..1] normalized score, or NULL when underlying data is insufficient
  -- (e.g. obscurity_score is NULL when none of the user's top artists
  -- have a popularity value yet).
  trait_score            numeric(6,4),
  -- 'low' | 'medium' | 'high' (banding rules per-trait, see
  -- lib/identity/traits.ts). 'unknown' when trait_score is NULL.
  trait_band             text CHECK (trait_band IN ('low','medium','high','unknown')),
  -- Per-trait explanation payload. Shape varies by trait but always
  -- carries enough to answer "why is this trait X?" without re-running
  -- the recompute. Example:
  --   { "source": "favorite_artists.popularity",
  --     "n_artists_observed": 18,
  --     "mean_popularity": 42 }
  contributing_factors   jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at            timestamptz NOT NULL DEFAULT now(),
  algorithm_version      text NOT NULL,
  PRIMARY KEY (user_id, trait_key)
);

CREATE INDEX IF NOT EXISTS idx_listener_identity_traits_user
  ON listener_identity_traits (user_id);

-- ── Archetype snapshots ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listener_archetype_snapshots (
  user_id                uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  archetype_key          text NOT NULL,
  -- Human-readable label, e.g. "The Deep Catalog Romantic". Persisted
  -- alongside the key so UI doesn't need a lookup table; updated on
  -- recompute when archetype catalog evolves.
  archetype_label        text NOT NULL,
  -- [0..1] composite fitness. Computed from trait predicates — see
  -- lib/identity/archetypes.ts.
  confidence_score       numeric(6,4) NOT NULL,
  -- 1 = primary (highest confidence), 2 = secondary, 3 = tertiary.
  -- Top-N (N=3 by default) persisted per user; lower-ranked
  -- archetypes are not written, so a user typically has 1-3 rows.
  rank                   integer NOT NULL CHECK (rank >= 1),
  -- Top contributing traits (which trait_scores drove the confidence).
  -- Shape: [{ trait_key, trait_score, contribution }, ...]
  supporting_traits      jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Top room_affinity_scores rows that match this archetype's flavor.
  -- Shape: [{ room_id, slug?, name?, score }, ...] (slug/name filled
  -- at recompute time via JOIN; UI can display directly).
  supporting_rooms       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Top listener_genres that match this archetype's flavor.
  -- Shape: [{ genre, weighted_score }, ...]
  supporting_genres      jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at            timestamptz NOT NULL DEFAULT now(),
  algorithm_version      text NOT NULL,
  PRIMARY KEY (user_id, archetype_key)
);

CREATE INDEX IF NOT EXISTS idx_listener_archetype_snapshots_user_rank
  ON listener_archetype_snapshots (user_id, rank);

-- ── RLS ──────────────────────────────────────────────────────────
-- Owner-self-select; service-role writes only. Same posture as
-- Layer 2-4 tables.

ALTER TABLE listener_identity_traits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE listener_archetype_snapshots  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON listener_identity_traits      FROM anon, authenticated;
REVOKE ALL ON listener_archetype_snapshots  FROM anon, authenticated;

GRANT SELECT ON listener_identity_traits      TO authenticated;
GRANT SELECT ON listener_archetype_snapshots  TO authenticated;

DROP POLICY IF EXISTS listener_identity_traits_self_select ON listener_identity_traits;
CREATE POLICY listener_identity_traits_self_select ON listener_identity_traits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS listener_archetype_snapshots_self_select ON listener_archetype_snapshots;
CREATE POLICY listener_archetype_snapshots_self_select ON listener_archetype_snapshots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
