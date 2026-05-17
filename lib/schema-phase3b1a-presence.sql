-- ============================================================
-- lib/schema-phase3b1a-presence.sql
-- Phase 3B.1A — Ambient Presence Substrate
-- Additive, idempotent migration.
-- Apply in Supabase dashboard or via CLI.
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE presence_visibility AS ENUM ('counted', 'identified');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE listening_state AS ENUM ('active', 'paused', 'idle');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS room_presence (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         uuid        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  cycle_id          uuid        NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  visibility_tier   presence_visibility NULL,      -- NULL = invisible (default, opt-in)
  listening_state   listening_state NOT NULL DEFAULT 'active',
  current_track     integer     NULL,
  progress_seconds  integer     NULL,
  last_heartbeat    timestamptz NOT NULL DEFAULT now(),
  session_started   timestamptz NOT NULL DEFAULT now(),

  -- One row per member per cycle
  CONSTRAINT room_presence_member_cycle_unique
    UNIQUE (member_id, cycle_id),

  -- track and progress must both be null or both populated
  CONSTRAINT room_presence_track_progress_consistent
    CHECK (
      (current_track IS NULL AND progress_seconds IS NULL)
      OR
      (current_track IS NOT NULL AND progress_seconds IS NOT NULL)
    ),

  -- current_track only allowed when visibility_tier = 'identified'
  CONSTRAINT room_presence_track_requires_identified
    CHECK (
      current_track IS NULL OR visibility_tier = 'identified'
    )
);

-- ── Indexes ──────────────────────────────────────────────────

-- Active-cycle partial index: supports snapshot query
CREATE INDEX IF NOT EXISTS room_presence_active_cycle_idx
  ON room_presence (cycle_id, last_heartbeat)
  WHERE visibility_tier IS NOT NULL;

-- Member-cycle lookup: supports upsert / cleanup per member
CREATE INDEX IF NOT EXISTS room_presence_member_cycle_idx
  ON room_presence (member_id, cycle_id);

-- Heartbeat lookup: supports cleanup_room_presence()
CREATE INDEX IF NOT EXISTS room_presence_heartbeat_idx
  ON room_presence (last_heartbeat);

-- ── Row-Level Security ────────────────────────────────────────

ALTER TABLE room_presence ENABLE ROW LEVEL SECURITY;

-- Visible rows (counted/identified) are readable by any authenticated user.
-- Invisible rows (visibility_tier IS NULL) are only readable by the owner.
DROP POLICY IF EXISTS "room_presence_select" ON room_presence;
CREATE POLICY "room_presence_select" ON room_presence
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      visibility_tier IS NOT NULL     -- opted-in: visible to all auth users
      OR member_id = auth.uid()       -- invisible: owner only
    )
  );

-- Owner-only insert
DROP POLICY IF EXISTS "room_presence_insert" ON room_presence;
CREATE POLICY "room_presence_insert" ON room_presence
  FOR INSERT
  WITH CHECK (member_id = auth.uid());

-- Owner-only update
DROP POLICY IF EXISTS "room_presence_update" ON room_presence;
CREATE POLICY "room_presence_update" ON room_presence
  FOR UPDATE
  USING (member_id = auth.uid());

-- Owner-only delete
DROP POLICY IF EXISTS "room_presence_delete" ON room_presence;
CREATE POLICY "room_presence_delete" ON room_presence
  FOR DELETE
  USING (member_id = auth.uid());

-- ── RPC: get_room_presence_snapshot ──────────────────────────
--
-- Returns presence_count (all opted-in, fresh within 90 s) and
-- faces (identified only, max 8, stable order by session_started).
-- SECURITY DEFINER so the function can bypass RLS on aggregation.

CREATE OR REPLACE FUNCTION get_room_presence_snapshot(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff  timestamptz := now() - interval '90 seconds';
  v_count   integer;
  v_faces   jsonb;
BEGIN
  -- Count all opted-in (counted + identified) fresh rows
  SELECT COUNT(*)
  INTO v_count
  FROM room_presence rp
  WHERE rp.cycle_id = p_cycle_id
    AND rp.visibility_tier IS NOT NULL
    AND rp.last_heartbeat >= v_cutoff;

  -- Identified faces: stable by session_started ASC, max 8
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'member_id',   up.id,
        'display_name', up.display_name,
        'avatar_url',  up.avatar_url
      )
    ),
    '[]'::jsonb
  )
  INTO v_faces
  FROM (
    SELECT rp.member_id, rp.session_started
    FROM room_presence rp
    WHERE rp.cycle_id = p_cycle_id
      AND rp.visibility_tier = 'identified'
      AND rp.last_heartbeat >= v_cutoff
    ORDER BY rp.session_started ASC
    LIMIT 8
  ) sub
  JOIN user_profiles up ON up.id = sub.member_id;

  RETURN jsonb_build_object(
    'presence_count', COALESCE(v_count, 0),
    'faces',          COALESCE(v_faces, '[]'::jsonb)
  );
END;
$$;

-- ── Cleanup function ─────────────────────────────────────────
--
-- Deletes rows idle for more than 5 minutes.
-- Called by pg_cron (if available) or by the app heartbeat path
-- on a probabilistic basis (1-in-N heartbeats triggers cleanup).

CREATE OR REPLACE FUNCTION cleanup_room_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM room_presence
  WHERE last_heartbeat < now() - interval '5 minutes';
END;
$$;

-- ── pg_cron schedule (optional) ──────────────────────────────
--
-- If pg_cron is not installed the DO block silently exits.
-- Fallback strategy: the app calls cleanup_room_presence() from
-- upsertPresence() on a probabilistic basis (Math.random() < 0.05),
-- so ~1 in 20 heartbeats also triggers a cleanup pass.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-room-presence-hourly',
      '0 * * * *',
      'SELECT cleanup_room_presence()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- pg_cron unavailable; app-layer fallback active
END;
$$;
