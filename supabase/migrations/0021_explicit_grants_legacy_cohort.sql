-- 0021_explicit_grants_legacy_cohort.sql
--
-- Phase 6A.14.1 — close the implicit-grant gap for tables created in
-- migrations 0001-0005.
--
-- WHY THIS EXISTS
-- ─────────────────────────────────────────────────────────────────
-- Supabase is moving away from implicit Data API exposure. Tables
-- created without explicit `GRANT` statements have historically been
-- reachable through PostgREST under PostgreSQL's default privileges
-- (anon + authenticated inherited SELECT/INSERT/UPDATE/DELETE on
-- every new table in `public`, gated only by RLS). The new posture
-- tightens those defaults: a table is unreachable through the Data
-- API unless an explicit `GRANT` names a role.
--
-- An audit of migrations 0001-0005 (Phase 6A.14.1) found 26 tables
-- with RLS policies but NO explicit `REVOKE`/`GRANT` lines. Of those,
-- 14 are still wired into the app today (catalog reads, profile,
-- onboarding, moments, presence, memberships); 12 are legacy
-- (superseded by post-0006 tables, never queried via supabase-js).
--
-- This migration RESTORES THE EXISTING APP BEHAVIOR EXPLICITLY:
--   - Every grant below mirrors what default privileges + RLS were
--     already permitting.
--   - No new exposure is created. No row that could not have been
--     read before is now visible.
--   - No RLS policy is modified; the existing per-table policies
--     continue to gate per-row access.
--
-- Legacy tables (no live `.from()` consumer confirmed by grep on
-- /app, /components, /lib in the same audit) are left REVOKED with
-- no role grant. They become invisible to the Data API. If a
-- dependency surfaces later, a follow-up migration can add the
-- grant. Dropping the tables themselves is deferred to a separate
-- post-6B cleanup pass — out of scope here.
--
-- POSTURE FOR POST-0006 TABLES
-- ─────────────────────────────────────────────────────────────────
-- Migrations 0006-0020 already use the explicit REVOKE+GRANT
-- pattern. They are NOT touched here. Any new 6B migration should
-- follow one of the three templates documented in SCHEMA-POLICY
-- (Template A: server-only, Template B: app-facing owner-owned,
-- Template C: public catalog).

-- ── Public-readable catalog tables ────────────────────────────────
-- RLS already says `USING (true)` for these — they are publicly
-- readable by design (room directory, album metadata, weekly cycle
-- catalog, curator profiles, published essays, weekly prompts).

REVOKE ALL ON rooms          FROM anon, authenticated;
REVOKE ALL ON albums         FROM anon, authenticated;
REVOKE ALL ON cycles         FROM anon, authenticated;
REVOKE ALL ON curators       FROM anon, authenticated;
REVOKE ALL ON curator_essays FROM anon, authenticated;
REVOKE ALL ON cycle_prompts  FROM anon, authenticated;
REVOKE ALL ON archetypes     FROM anon, authenticated;

GRANT SELECT ON rooms          TO anon, authenticated;
GRANT SELECT ON albums         TO anon, authenticated;
GRANT SELECT ON cycles         TO anon, authenticated;
GRANT SELECT ON curators       TO anon, authenticated;
GRANT SELECT ON curator_essays TO anon, authenticated;
GRANT SELECT ON cycle_prompts  TO anon, authenticated;
GRANT SELECT ON archetypes     TO anon, authenticated;

-- ── Owner-owned tables ────────────────────────────────────────────
-- RLS gates these per-row via `auth.uid() = user_id` (or `= id` for
-- user_profiles). Browser/server-action reads succeed only for the
-- listener's own rows; grants below restore the reach the app
-- already had before defaults tightened.

REVOKE ALL ON user_profiles              FROM anon, authenticated;
REVOKE ALL ON user_memberships           FROM anon, authenticated;
REVOKE ALL ON club_memberships           FROM anon, authenticated;
REVOKE ALL ON moments                    FROM anon, authenticated;
REVOKE ALL ON moment_visibility_history  FROM anon, authenticated;
REVOKE ALL ON participation_events       FROM anon, authenticated;
REVOKE ALL ON room_presence              FROM anon, authenticated;

-- user_profiles: onboarding flow and profile edits perform INSERT
-- and UPDATE from server actions running under the authenticated
-- session. SELECT for the profile/identity/onboarding surfaces.
GRANT SELECT, INSERT, UPDATE ON user_profiles            TO authenticated;

-- user_memberships: tier upgrades from server actions; SELECT for
-- the membership screen.
GRANT SELECT, INSERT, UPDATE ON user_memberships         TO authenticated;

-- club_memberships: listeners join/leave rooms from the UI; full
-- CRUD on their own rows (RLS scopes to user_id).
GRANT SELECT, INSERT, UPDATE, DELETE ON club_memberships TO authenticated;

-- moments: listener-authored annotations + marks + saves. INSERT
-- and UPDATE from the moment composer; SELECT for the room
-- timeline.
GRANT SELECT, INSERT, UPDATE ON moments                  TO authenticated;

-- moment_visibility_history: audit trail written by the service
-- role (existing `visibility_history_service_insert` policy);
-- listeners only READ their own rows. No client INSERT/UPDATE.
GRANT SELECT                ON moment_visibility_history TO authenticated;

-- participation_events: per-cycle participation log. Server
-- actions INSERT; SELECT for the listener's own history.
GRANT SELECT, INSERT        ON participation_events      TO authenticated;

-- room_presence: live presence rows. Upserts from the presence
-- server action; SELECT for the room screen presence strip.
GRANT SELECT, INSERT, UPDATE ON room_presence            TO authenticated;

-- ── Legacy / dead tables (intentionally left without grants) ──────
-- The Phase 6A.14.1 audit found NO `.from()` references to these
-- tables in /app, /components, or /lib. They were superseded by
-- post-0006 equivalents OR never wired into the product:
--
--   streaming_connections    → superseded by listening_connections (0007)
--   identity_profiles        → superseded by listener_identity_traits +
--                              listener_archetype_snapshots (0016)
--   identity_snapshots       → superseded by listener_archetype_snapshots (0016)
--   room_affinities (plural) → superseded by room_affinity_scores (0015)
--   annotations              → superseded by moments (0004)
--   listening_moments        → superseded by moments (0004)
--   listening_eras           → never wired
--   reflections              → never wired
--   saved_passages           → never wired
--   listening_artifacts      → never wired
--   compatibility_readings   → superseded by listener_compatibility_scores (0018)
--   ai_generations           → never wired
--
-- REVOKED here so they become invisible to the Data API. The tables
-- themselves are not dropped — that's a separate, deliberate
-- decision deferred to a post-6B cleanup migration after each is
-- re-confirmed as having no production dependency. If a forgotten
-- caller surfaces, restore the grant in a follow-up migration; the
-- existing RLS policies already gate per-row access.

REVOKE ALL ON streaming_connections     FROM anon, authenticated;
REVOKE ALL ON identity_profiles         FROM anon, authenticated;
REVOKE ALL ON identity_snapshots        FROM anon, authenticated;
REVOKE ALL ON room_affinities           FROM anon, authenticated;
REVOKE ALL ON annotations               FROM anon, authenticated;
REVOKE ALL ON listening_moments         FROM anon, authenticated;
REVOKE ALL ON listening_eras            FROM anon, authenticated;
REVOKE ALL ON reflections               FROM anon, authenticated;
REVOKE ALL ON saved_passages            FROM anon, authenticated;
REVOKE ALL ON listening_artifacts       FROM anon, authenticated;
REVOKE ALL ON compatibility_readings    FROM anon, authenticated;
REVOKE ALL ON ai_generations            FROM anon, authenticated;
