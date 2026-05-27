-- 0018_listener_compatibility_scores.sql
--
-- Phase 6A.10 — listener compatibility scores.
--
-- Append-on-recompute cache of (user_a, user_b) → composite
-- compatibility score + structured shared-state envelope. Derived
-- from Layer 2 (listener_genres), Layer 4 (room_affinity_scores),
-- and Layer 5 (listener_identity_traits / archetype_snapshots).
-- NOT collaborative filtering — pure structured overlap math.
--
-- Storage convention: rows are ALWAYS stored with the
-- lexicographically smaller user_id in user_id_a. This halves
-- storage (one pair = one row), makes upsert trivial, and avoids
-- the "is (A,B) the same as (B,A)?" ambiguity in queries.
-- Callers normalize the pair before reading/writing via the helper
-- in lib/identity/compatibility.ts:canonicalPair().
--
-- Posture:
--   - additive only (no changes to existing tables)
--   - service-role writes only
--   - SELECT policy: either side of the pair may read (so each
--     listener can see compatibility involving themselves)
--   - rows are full-state envelopes (denormalized JSONB for shared
--     genres, rooms, traits, archetypes) — UI needs no joins
--   - algorithm_version stamps every row; old rows fall back at
--     read time when the version diverges from the current code

CREATE TABLE IF NOT EXISTS listener_compatibility_scores (
  user_id_a                      uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  user_id_b                      uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  -- Composite [0..~50] score from
  --   genre Jaccard × 20
  -- + archetype bonus (15 same primary; 7 cross-listed alt)
  -- + trait band alignment (10 max across 7 traits)
  -- + shared top-10 rooms (1pt each, capped 10)
  -- See lib/identity/compatibility.ts for the formula.
  score                          numeric(8,4) NOT NULL,
  -- Qualitative band over the score. Same vocabulary pattern as
  -- recommendation explanation bands but tuned to the
  -- compatibility score range.
  band                           text NOT NULL CHECK (band IN
    ('strong','clear','emerging','adjacent','limited')),
  -- Top-N shared traits where both users are in the same band.
  -- Shape: [{ trait_key, a_band, b_band, alignment }]
  shared_traits                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Genres in both users' top 15. Shape: [{ genre, a_weight, b_weight }]
  shared_genres                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Rooms in both users' top 10 by affinity_score.
  -- Shape: [{ room_id, slug, name, a_score, b_score }]
  shared_rooms                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Structured archetype relationship.
  -- Shape: { a_primary, b_primary, same_primary, cross_listed }
  archetype_alignment            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Top-N traits where bands diverge by 2+ steps (e.g. one is
  -- 'high', the other is 'low'). Honest about where listeners
  -- differ, not just where they overlap.
  -- Shape: [{ trait_key, a_band, b_band, gap }]
  divergence_points              jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at                    timestamptz NOT NULL DEFAULT now(),
  algorithm_version              text NOT NULL,
  PRIMARY KEY (user_id_a, user_id_b),
  -- Guard against off-canonical inserts. Code is the source of
  -- truth (canonicalPair() in lib/identity/compatibility.ts);
  -- this constraint is belt-and-suspenders.
  CONSTRAINT listener_compat_canonical_order CHECK (user_id_a < user_id_b)
);

CREATE INDEX IF NOT EXISTS idx_listener_compat_user_a_score
  ON listener_compatibility_scores (user_id_a, score DESC);
CREATE INDEX IF NOT EXISTS idx_listener_compat_user_b_score
  ON listener_compatibility_scores (user_id_b, score DESC);
CREATE INDEX IF NOT EXISTS idx_listener_compat_version
  ON listener_compatibility_scores (algorithm_version);

-- ── RLS ──────────────────────────────────────────────────────────
-- Either side of the pair can SELECT. Service-role writes only.

ALTER TABLE listener_compatibility_scores ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON listener_compatibility_scores FROM anon, authenticated;
GRANT SELECT ON listener_compatibility_scores TO authenticated;

DROP POLICY IF EXISTS listener_compat_self_select ON listener_compatibility_scores;
CREATE POLICY listener_compat_self_select ON listener_compatibility_scores
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id_a OR auth.uid() = user_id_b);
