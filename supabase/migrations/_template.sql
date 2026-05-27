-- ─────────────────────────────────────────────────────────────────
-- LongPlay migration template
--
-- Copy this file, rename to `NNNN_<descriptive_slug>.sql`, and pick
-- exactly ONE of the @template markers below per CREATE TABLE.
--
-- The guard at `scripts/check-migration-policy.mjs` enforces:
--   - every CREATE TABLE has ENABLE ROW LEVEL SECURITY in the same file
--   - every CREATE TABLE has REVOKE ALL ... FROM anon, authenticated
--   - the file contains at least one GRANT statement OR an @template:A
--     marker (Template A is the only one that legitimately has no GRANT)
--
-- Full policy: docs/SCHEMA-POLICY.md
-- Project guidance: CLAUDE.md
-- ─────────────────────────────────────────────────────────────────


-- ── TEMPLATE A — Server-only internal table ────────────────────────
-- Use for: derived substrate, recompute caches, audit logs, sync
-- runs, ritual cycle state — anything written by the admin client
-- and not read by any browser/server-action UI surface.
--
-- Posture: no grant. Service role bypasses RLS, so admin writes
-- still land; authenticated/anon get no Data API reach.

-- @template:A — server-only internal table
-- CREATE TABLE IF NOT EXISTS your_table_a (
--   user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
--   computed_at timestamptz NOT NULL DEFAULT now()
-- );
-- ALTER TABLE your_table_a ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL ON your_table_a FROM anon, authenticated;
-- -- Intentionally no GRANT.


-- ── TEMPLATE B — App-facing owner-owned table ──────────────────────
-- Use for: per-user state listeners read about themselves through
-- the UI (Layer 2-5 derived tables, identity history, moments).

-- @template:B — app-facing owner-owned table
-- CREATE TABLE IF NOT EXISTS your_table_b (
--   user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
--   computed_at timestamptz NOT NULL DEFAULT now()
-- );
-- ALTER TABLE your_table_b ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL ON your_table_b FROM anon, authenticated;
-- GRANT SELECT ON your_table_b TO authenticated;
--
-- DROP POLICY IF EXISTS your_table_b_self_select ON your_table_b;
-- CREATE POLICY your_table_b_self_select ON your_table_b
--   FOR SELECT TO authenticated USING (auth.uid() = user_id);
--
-- -- Optional, only when listeners author rows directly from the
-- -- browser (most derived tables do NOT need this):
-- -- GRANT INSERT, UPDATE ON your_table_b TO authenticated;
-- -- DROP POLICY IF EXISTS your_table_b_self_insert ON your_table_b;
-- -- CREATE POLICY your_table_b_self_insert ON your_table_b
-- --   FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- -- DROP POLICY IF EXISTS your_table_b_self_update ON your_table_b;
-- -- CREATE POLICY your_table_b_self_update ON your_table_b
-- --   FOR UPDATE TO authenticated USING (auth.uid() = user_id)
-- --                                WITH CHECK (auth.uid() = user_id);


-- ── TEMPLATE C — Public catalog table ──────────────────────────────
-- Use for: room/album/cycle/curator catalogs — content any visitor
-- can read.

-- @template:C — public catalog table
-- CREATE TABLE IF NOT EXISTS your_table_c (
--   slug text PRIMARY KEY
-- );
-- ALTER TABLE your_table_c ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL ON your_table_c FROM anon, authenticated;
-- GRANT SELECT ON your_table_c TO anon, authenticated;
--
-- DROP POLICY IF EXISTS your_table_c_public_select ON your_table_c;
-- CREATE POLICY your_table_c_public_select ON your_table_c
--   FOR SELECT TO anon, authenticated USING (true);


-- ── No public tables in this migration? ────────────────────────────
-- For column adds, function definitions, index changes, data
-- fixups, RLS edits, retention helpers — add this marker at the
-- top and the guard will skip the file:

-- @template:N/A — no public tables created
