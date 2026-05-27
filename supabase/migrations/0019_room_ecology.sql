-- 0019_room_ecology.sql
--
-- Phase 6A.11 — room ecology + adjacency.
--
-- Two additive tables that record:
--   - room_ecology_snapshots: append-only point-in-time portrait of
--     "who is here and what they share" per room. Mirrors the
--     listener_identity_history pattern from Phase 6A.9.
--   - room_adjacency_scores: latest-state cache of room↔room
--     resonance. Canonical-pair ordering (room_id_a < room_id_b)
--     to halve storage. Mirrors listener_compatibility_scores from
--     Phase 6A.10.
--
-- Both are DERIVED layers — fully regeneratable from
-- room_affinity_scores + listener_* + listener_genres + the rooms
-- catalog. The orchestrator (lib/ecology/recompute.ts) is
-- idempotent; re-running on identical Layer 1-5 + Layer 4 state
-- produces byte-identical writes (modulo computed_at).
--
-- Append rules for room_ecology_snapshots (lib/ecology/computation.ts:
-- shouldAppendRoomEcology):
--   1. ALWAYS append the first row per room.
--   2. APPEND when meaningful drift is detected (archetype mix
--      changed, dominant_traits or dominant_genres shifted by
--      band/set membership).
--   3. APPEND when ≥7 days since the last row even on stable rooms
--      (slow-evolution capture).
--   4. SKIP otherwise. Cron runs daily; ~one row per room per week
--      in steady state.

-- ── Room ecology snapshots (append-only) ─────────────────────────
CREATE TABLE IF NOT EXISTS room_ecology_snapshots (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                       uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  snapshot_at                   timestamptz NOT NULL DEFAULT now(),
  algorithm_version             text NOT NULL,
  -- Number of listeners with room_affinity_scores.score above the
  -- "emerging" cutoff (≥12) for this room. Distinct from
  -- club_memberships.count — the affinity-based denominator captures
  -- "who resonates with the room", not just "who clicked join".
  active_listener_count         integer NOT NULL DEFAULT 0,
  -- Top archetypes by member count. Shape:
  --   [{ archetype_key, archetype_label, listener_count, share }]
  -- where share is the fraction of active_listener_count whose
  -- primary archetype matches. Sorted by share desc.
  dominant_archetypes           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Per-trait modal band across active listeners. Shape:
  --   { trait_key: { modal_band, low_share, medium_share, high_share, n } }
  -- The modal_band is "where the room sits"; the share fields make
  -- the distribution inspectable (UI can decide whether to render
  -- "leans nocturnal" vs "split between low and high").
  dominant_traits               jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Aggregated genre weights. Shape:
  --   [{ genre, sum_weight, listener_count }]
  -- sum_weight is the sum of listener_genres.weighted_score across
  -- contributing listeners; listener_count is how many touched the
  -- genre at all. Top 10 by sum_weight.
  dominant_genres               jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Combines the room's declared rooms.energy_level with the mean
  -- recency/exploratory/nocturnal trait scores across members.
  -- Shape: { declared, observed_recency, observed_exploratory,
  --          observed_nocturnal, observed_album_focus }
  energy_profile                jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Drift vs. the immediately-prior row for the same room_id. NULL
  -- on the first snapshot per room. See lib/ecology/computation.ts:
  -- computeRoomDrift for the shape.
  drift_summary                 jsonb,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_ecology_room_snapshot
  ON room_ecology_snapshots (room_id, snapshot_at DESC);

-- ── Room adjacency (upsert, canonical pair) ──────────────────────
CREATE TABLE IF NOT EXISTS room_adjacency_scores (
  room_id_a                     uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  room_id_b                     uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  -- Composite [0..~30] score. See lib/ecology/computation.ts.
  score                         numeric(8,4) NOT NULL,
  -- Qualitative band — bandRoomAdjacency().
  band                          text NOT NULL CHECK (band IN
    ('aligned','overlapping','adjacent','disjoint')),
  -- Listeners with affinity ≥12 for BOTH rooms.
  listener_overlap_count        integer NOT NULL DEFAULT 0,
  -- Archetypes appearing in both rooms' dominant_archetypes.
  -- Shape: [{ archetype_key, a_share, b_share }]
  shared_archetypes             jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Genres appearing in both rooms' dominant_genres (top 10 each).
  -- Shape: [{ genre, a_weight, b_weight }]
  shared_genres                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at                   timestamptz NOT NULL DEFAULT now(),
  algorithm_version             text NOT NULL,
  PRIMARY KEY (room_id_a, room_id_b),
  CONSTRAINT room_adjacency_canonical_order CHECK (room_id_a < room_id_b)
);

CREATE INDEX IF NOT EXISTS idx_room_adjacency_a_score
  ON room_adjacency_scores (room_id_a, score DESC);
CREATE INDEX IF NOT EXISTS idx_room_adjacency_b_score
  ON room_adjacency_scores (room_id_b, score DESC);

-- ── RLS ──────────────────────────────────────────────────────────
-- Both tables are room-scoped (not user-scoped). Rooms are
-- public-readable in this codebase (lib/data/rooms.ts), so ecology
-- and adjacency follow the same posture: public SELECT for any
-- authenticated session; service-role writes only.

ALTER TABLE room_ecology_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_adjacency_scores  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON room_ecology_snapshots FROM anon, authenticated;
REVOKE ALL ON room_adjacency_scores  FROM anon, authenticated;

GRANT SELECT ON room_ecology_snapshots TO anon, authenticated;
GRANT SELECT ON room_adjacency_scores  TO anon, authenticated;

DROP POLICY IF EXISTS room_ecology_public_select ON room_ecology_snapshots;
CREATE POLICY room_ecology_public_select ON room_ecology_snapshots
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS room_adjacency_public_select ON room_adjacency_scores;
CREATE POLICY room_adjacency_public_select ON room_adjacency_scores
  FOR SELECT TO anon, authenticated USING (true);
