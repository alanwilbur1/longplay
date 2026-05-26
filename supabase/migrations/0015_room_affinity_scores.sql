-- 0015_room_affinity_scores.sql
--
-- Phase 6A.5 — Layer 4: Room Affinity Cache.
--
-- Persistent (user_id, room_id) → score artifacts derived from Layer 2
-- (canonical listening graph) + Layer 3 (listening_profile_snapshots)
-- + room metadata. Replaces request-time runtime scoring with a
-- single indexed read per recommendation request.
--
-- This layer is NOT truth — it's a serving cache. Sources:
--   - listener_genres, listener_artists, listener_tracks   (Layer 2)
--   - listening_profile_snapshots                          (Layer 3)
--   - rooms, cycles, albums                                (room metadata)
--   - user_profiles.preferences.calibrationAnswers         (onboarding signal)
--
-- The full recompute path lives in lib/recommendations/affinity-cache.ts.
-- It runs after each successful snapshot recompute (Phase 6A.4 wiring)
-- and is fully regeneratable — no operator intervention needed for
-- normal operation. Manual invalidation via scripts/invalidate-room-
-- affinities.ts when a room's metadata changes significantly.

CREATE TABLE IF NOT EXISTS room_affinity_scores (
  user_id                       uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  room_id                       uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  -- Pre-MMR score from scoreRoom(). MMR diversity penalty is applied
  -- at request time, not cached, because it depends on which other
  -- rooms have been picked so far (i.e. on the final result-set
  -- size). The cache holds the per-(user,room) signal; the serving
  -- path turns the signal into a ranked list.
  score                         numeric(8,4) NOT NULL,
  -- Scoring formula identifier (lib/recommendations/types.ts:SCORE_VERSION).
  -- Bumped on every scoring change. Mismatched rows fall back to live
  -- scoring at serve time; the next snapshot recompute repopulates.
  score_version                 text NOT NULL,
  -- The full ExplanationFactor[] the scorer produced. Powers the
  -- "why this room?" UI surface without a second scoring pass.
  -- Shape stable across version bumps; the array is consumed
  -- opaquely at read time and trusted as-is.
  factor_breakdown              jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The snapshot.computed_at that fed this score. Lets the serving
  -- path detect staleness (snapshot updated after the cache was
  -- written) and fall back. Null when the user had no snapshot at
  -- recompute time (rare edge — Layer 4 should not be populated then,
  -- but we tolerate it).
  source_snapshot_computed_at   timestamptz,
  computed_at                   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

-- Primary serving query: top-N rooms for a user.
CREATE INDEX IF NOT EXISTS idx_room_affinity_scores_user_score
  ON room_affinity_scores (user_id, score DESC);

-- Invalidation query: find all rows with stale version.
CREATE INDEX IF NOT EXISTS idx_room_affinity_scores_version
  ON room_affinity_scores (score_version);

-- ── RLS ──────────────────────────────────────────────────────────
-- Owner-self-select; service-role writes only. Same posture as
-- Layer 2 and Layer 3 tables.

ALTER TABLE room_affinity_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON room_affinity_scores FROM anon, authenticated;
GRANT SELECT ON room_affinity_scores TO authenticated;

DROP POLICY IF EXISTS room_affinity_scores_self_select ON room_affinity_scores;
CREATE POLICY room_affinity_scores_self_select ON room_affinity_scores
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
