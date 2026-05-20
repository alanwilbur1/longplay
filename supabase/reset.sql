-- ============================================================================
-- supabase/reset.sql — one-shot destructive reset for LongPlay
-- ============================================================================
--
-- DO NOT add this file to supabase/migrations/. It is intentionally placed
-- outside the migrations directory so the Supabase CLI does not auto-run it.
--
-- WHEN TO USE
--   The remote schema has drifted from the migration set (e.g. partial
--   apply, dashboard edits, mixed older + newer table shapes) and the
--   only honest fix is to drop everything LongPlay owns and replay
--   the migrations from scratch.
--
-- WHEN NOT TO USE
--   Production. This is data-destructive. Run only on preview / dev
--   while there's no real user data to lose.
--
-- HOW TO RUN
--   Option 1 (preferred): Supabase dashboard → SQL Editor → paste this
--                         whole file → Run. Then `pnpm exec supabase db push`.
--   Option 2:             pnpm exec supabase db execute --file supabase/reset.sql
--                         pnpm exec supabase db push
--
-- ============================================================================

BEGIN;

-- ── 1. Triggers on schemas we don't own ──────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ── 2. LongPlay public tables ─────────────────────────────────────────────
-- CASCADE handles dependent indexes, policies, FKs, triggers.
-- Listed in rough dependency-reverse for readability; CASCADE makes
-- order strictly unnecessary.
DROP TABLE IF EXISTS public.moment_visibility_history CASCADE;
DROP TABLE IF EXISTS public.participation_events    CASCADE;
DROP TABLE IF EXISTS public.moments                 CASCADE;
DROP TABLE IF EXISTS public.room_presence           CASCADE;
DROP TABLE IF EXISTS public.club_memberships        CASCADE;
DROP TABLE IF EXISTS public.room_affinities         CASCADE;
DROP TABLE IF EXISTS public.cycle_prompts           CASCADE;
DROP TABLE IF EXISTS public.curator_essays          CASCADE;
DROP TABLE IF EXISTS public.cycles                  CASCADE;
DROP TABLE IF EXISTS public.albums                  CASCADE;
DROP TABLE IF EXISTS public.rooms                   CASCADE;
DROP TABLE IF EXISTS public.curators                CASCADE;
DROP TABLE IF EXISTS public.annotations             CASCADE;
DROP TABLE IF EXISTS public.listening_moments       CASCADE;
DROP TABLE IF EXISTS public.listening_eras          CASCADE;
DROP TABLE IF EXISTS public.compatibility_readings  CASCADE;
DROP TABLE IF EXISTS public.reflections             CASCADE;
DROP TABLE IF EXISTS public.saved_passages          CASCADE;
DROP TABLE IF EXISTS public.listening_artifacts     CASCADE;
DROP TABLE IF EXISTS public.platform_events         CASCADE;
DROP TABLE IF EXISTS public.ai_generations          CASCADE;
DROP TABLE IF EXISTS public.identity_snapshots      CASCADE;
DROP TABLE IF EXISTS public.identity_profiles       CASCADE;
DROP TABLE IF EXISTS public.archetypes              CASCADE;
DROP TABLE IF EXISTS public.streaming_connections   CASCADE;
DROP TABLE IF EXISTS public.user_memberships        CASCADE;
DROP TABLE IF EXISTS public.membership_tier_history CASCADE;
DROP TABLE IF EXISTS public.user_profiles           CASCADE;

-- ── 3. Trigger / helper functions ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public.handle_new_user()  CASCADE;
DROP FUNCTION IF EXISTS public.touch_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;

-- ── 4. Enum types ─────────────────────────────────────────────────────────
DROP TYPE IF EXISTS public.participation_event_type CASCADE;
DROP TYPE IF EXISTS public.participation_event_kind CASCADE;
DROP TYPE IF EXISTS public.moment_visibility        CASCADE;
DROP TYPE IF EXISTS public.moment_type              CASCADE;
DROP TYPE IF EXISTS public.club_membership_role     CASCADE;
DROP TYPE IF EXISTS public.club_membership_status   CASCADE;
DROP TYPE IF EXISTS public.cycle_phase              CASCADE;
DROP TYPE IF EXISTS public.room_visibility          CASCADE;
DROP TYPE IF EXISTS public.room_type                CASCADE;
DROP TYPE IF EXISTS public.membership_tier          CASCADE;
DROP TYPE IF EXISTS public.membership_status        CASCADE;
DROP TYPE IF EXISTS public.streaming_service        CASCADE;
DROP TYPE IF EXISTS public.annotation_visibility    CASCADE;
DROP TYPE IF EXISTS public.affinity_resonance       CASCADE;
DROP TYPE IF EXISTS public.affinity_type            CASCADE;
DROP TYPE IF EXISTS public.affinity_trend           CASCADE;
DROP TYPE IF EXISTS public.snapshot_type            CASCADE;
DROP TYPE IF EXISTS public.artifact_type            CASCADE;
DROP TYPE IF EXISTS public.event_type               CASCADE;
DROP TYPE IF EXISTS public.event_status             CASCADE;
DROP TYPE IF EXISTS public.ai_content_type          CASCADE;

-- ── 5. Clear migration tracking so `db push` re-applies ──────────────────
DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('0001', '0002', '0003', '0004', '0005', '0099');

COMMIT;

-- ── Verify ───────────────────────────────────────────────────────────────
--   SELECT count(*) FROM information_schema.tables WHERE table_schema='public';
--   → 0
--   SELECT count(*) FROM supabase_migrations.schema_migrations
--     WHERE version IN ('0001','0002','0003','0004','0005','0099');
--   → 0
