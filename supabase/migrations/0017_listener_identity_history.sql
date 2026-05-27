-- 0017_listener_identity_history.sql
--
-- Phase 6A.9 — append-only identity history.
--
-- Layer 5 (listener_archetype_snapshots / listener_identity_traits) is
-- single-row-per-user — every sync overwrites the previous identity
-- state. This migration adds an append-only history table so the
-- platform can show evolution over time without losing the precision
-- of "what was true on date X".
--
-- Posture:
--   - additive only (no changes to listener_archetype_snapshots etc.)
--   - INSERT-only from the app layer; no UPDATE/DELETE code paths
--   - rows are full-state snapshots (not deltas) — the archetype,
--     traits, top genres, top rooms are all denormalized into JSONB
--     columns so reconstruction needs no joins
--   - drift_summary is populated by comparing this snapshot to the
--     immediately-prior history row for the same user (NULL on the
--     first row; structured object thereafter — see
--     lib/identity/drift.ts for the shape)
--
-- Append rules (lib/identity/history-recompute.ts):
--   1. ALWAYS append the first row for a user.
--   2. APPEND when meaningful drift is detected vs. the previous row
--      (primary archetype changed, or any trait_score moved ≥ 0.15,
--      or archetype confidence changed ≥ 0.1).
--   3. APPEND when ≥ 7 days have passed since the last row, even
--      when no meaningful drift (captures slow evolution).
--   4. SKIP otherwise — prevents snapshot spam on every sync.
--
-- algorithm_version on every row — when trait formulas or archetype
-- predicates change, history rows from before the bump remain
-- inspectable but readers can detect the transition.

CREATE TABLE IF NOT EXISTS listener_identity_history (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  -- The point-in-time the snapshot represents. Distinct from
  -- created_at (when the row was written) so a future backfill
  -- can preserve historical accuracy.
  snapshot_at                   timestamptz NOT NULL DEFAULT now(),
  algorithm_version             text NOT NULL,
  -- ── Primary archetype (denormalized, may be NULL when user has
  --    no eligible archetype at this point in time) ──────────────
  primary_archetype_key         text,
  primary_archetype_label       text,
  primary_confidence            numeric(6,4),
  -- Top N=3 archetypes (ranked) at this point in time, including
  -- the primary. Shape mirrors listener_archetype_snapshots row.
  archetypes                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Trait snapshot. Shape: { trait_key: { score, band } }
  -- Carries ALL 7 traits even when score is null — preserves the
  -- "we tried but data was insufficient" state for accurate
  -- replay.
  trait_snapshot                jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Top 5 genres at this point in time. Shape: [{ genre, weighted_score }]
  top_genres                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Top 5 affinity rooms at this point. Shape: [{ room_id, slug?, name?, score }]
  top_rooms                     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Drift summary vs. the immediately-prior history row for this
  -- user. NULL on the first row. Shape — see lib/identity/drift.ts:
  --   { archetype_transition, archetype_confidence_change,
  --     rising_traits, falling_traits,
  --     emerging_genres, fading_genres,
  --     emerging_rooms, fading_rooms,
  --     window_days }
  drift_summary                 jsonb,
  created_at                    timestamptz NOT NULL DEFAULT now()
);

-- Serving query: "show me my timeline" — reverse-chronological
-- per-user. The partial-index variant (most recent N per user)
-- isn't worth the index cost at expected volume; a regular index
-- on (user_id, snapshot_at DESC) handles it.
CREATE INDEX IF NOT EXISTS idx_listener_identity_history_user_snapshot
  ON listener_identity_history (user_id, snapshot_at DESC);

-- Operator query: "show me all archetype transitions in the last week"
CREATE INDEX IF NOT EXISTS idx_listener_identity_history_transitions
  ON listener_identity_history (snapshot_at DESC)
  WHERE primary_archetype_key IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────────
-- Owner-self-select; service-role writes only. Same posture as
-- Layer 5 single-row snapshots.

ALTER TABLE listener_identity_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON listener_identity_history FROM anon, authenticated;
GRANT SELECT ON listener_identity_history TO authenticated;

DROP POLICY IF EXISTS listener_identity_history_self_select ON listener_identity_history;
CREATE POLICY listener_identity_history_self_select ON listener_identity_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
