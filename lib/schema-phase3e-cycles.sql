-- ════════════════════════════════════════════════════════════════════════════
-- lib/schema-phase3e-cycles.sql — Cycle Progression Engine
-- ════════════════════════════════════════════════════════════════════════════
--
-- The room evolves on its own. Cycles advance phases through the week and
-- roll over to a new album on each cadence boundary. Everything is
-- idempotent, deterministic, and scheduler-driven. Safe to apply more
-- than once; safe to call the advance function on any cadence.
--
-- Public surface:
--   compute_expected_cycle_phase(start_date, today)  pure
--   next_anchor_date(from, anchor_day)               pure
--   activate_next_cycle_for_room(room_id, previous?, start?)
--   advance_cycle_phases(today?)                     idempotent driver
--
-- Apply in Supabase SQL editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Schema additions ────────────────────────────────────────────────────────
-- Per-room cycle scheduling. 'weekly' is the only cadence today; the columns
-- exist so curator-defined cadences (biweekly, editorial, hiatus) and per-room
-- start days can land later without a schema migration.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cycle_cadence TEXT DEFAULT 'weekly';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cycle_anchor_day SMALLINT DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE rooms ADD CONSTRAINT rooms_cycle_anchor_day_range
    CHECK (cycle_anchor_day IS NULL OR cycle_anchor_day BETWEEN 0 AND 6);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Album queue. Optional per-room override of the rotation strategy: when
-- entries exist with consumed_at IS NULL, the engine consumes them in
-- queue_position order. When the queue is empty the engine falls back to
-- least-recently-used rotation across the room's historical cycles.

CREATE TABLE IF NOT EXISTS room_album_queue (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id            UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  album_id           UUID NOT NULL REFERENCES albums(id),
  queue_position     INTEGER NOT NULL,
  consumed_at        TIMESTAMPTZ,
  consumed_cycle_id  UUID REFERENCES cycles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, queue_position)
);

CREATE INDEX IF NOT EXISTS idx_queue_room_pending
  ON room_album_queue (room_id, queue_position)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_queue_room_consumed
  ON room_album_queue (room_id, consumed_at DESC NULLS LAST);

-- ── Pure helpers ────────────────────────────────────────────────────────────

-- Maps (cycle start, today) → expected phase for a weekly cadence.
-- Day 0 of the cycle (start_date itself) = arrival.
-- Days 1–3 = private (annotation).
-- Day 4 = discussion (Friday).
-- Days 5–6 = curators-note (Saturday/Sunday).
-- Day ≥ 7 = archived (rollover trigger).
-- Day < 0 = upcoming (cycle scheduled but not yet active).
CREATE OR REPLACE FUNCTION compute_expected_cycle_phase(
  p_start_date DATE,
  p_today      DATE
) RETURNS cycle_phase
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_days_in INTEGER;
BEGIN
  v_days_in := p_today - p_start_date;
  IF v_days_in < 0 THEN RETURN 'upcoming';
  ELSIF v_days_in = 0 THEN RETURN 'arrival';
  ELSIF v_days_in BETWEEN 1 AND 3 THEN RETURN 'private';
  ELSIF v_days_in = 4 THEN RETURN 'discussion';
  ELSIF v_days_in BETWEEN 5 AND 6 THEN RETURN 'curators-note';
  ELSE RETURN 'archived';
  END IF;
END;
$$;

-- Returns the next day-of-week match on or after p_from.
-- p_anchor_day uses Postgres EXTRACT(DOW): 0 = Sunday, 1 = Monday, …, 6 = Saturday.
CREATE OR REPLACE FUNCTION next_anchor_date(
  p_from       DATE,
  p_anchor_day SMALLINT
) RETURNS DATE
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_diff INTEGER;
BEGIN
  v_diff := (p_anchor_day - EXTRACT(DOW FROM p_from)::INTEGER + 7) % 7;
  RETURN p_from + v_diff;
END;
$$;

-- ── Rollover: activate the next cycle for a room ────────────────────────────
-- Idempotent over the (room_id, year, week_number) unique constraint:
-- a second concurrent call resolves to the existing cycle row rather than
-- failing. Returns the new (or existing) cycle id. NULL if there is no
-- album to activate (no queue entries and no historical cycles).
CREATE OR REPLACE FUNCTION activate_next_cycle_for_room(
  p_room_id            UUID,
  p_previous_cycle_id  UUID DEFAULT NULL,
  p_start_date         DATE DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_album_id     UUID;
  v_queue_id     UUID;
  v_start_date   DATE;
  v_end_date     DATE;
  v_week_number  INTEGER;
  v_year         INTEGER;
  v_season_label TEXT;
  v_anchor_day   SMALLINT;
  v_new_cycle_id UUID;
BEGIN
  -- Lock the room row to avoid concurrent rollovers selecting the same
  -- queue entry or computing the same week twice.
  SELECT cycle_anchor_day INTO v_anchor_day
  FROM rooms WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Choose the new cycle's start date. Default: next anchor-day on or
  -- after today, so a rollover triggered mid-week schedules forward.
  v_start_date := COALESCE(
    p_start_date,
    next_anchor_date(CURRENT_DATE, COALESCE(v_anchor_day, 1))
  );
  v_end_date    := v_start_date + INTERVAL '6 days';
  v_week_number := EXTRACT(WEEK FROM v_start_date)::INTEGER;
  v_year        := EXTRACT(YEAR FROM v_start_date)::INTEGER;
  v_season_label := CASE
    WHEN EXTRACT(MONTH FROM v_start_date) BETWEEN 3 AND 5 THEN 'Spring ' || v_year
    WHEN EXTRACT(MONTH FROM v_start_date) BETWEEN 6 AND 8 THEN 'Summer ' || v_year
    WHEN EXTRACT(MONTH FROM v_start_date) BETWEEN 9 AND 11 THEN 'Autumn ' || v_year
    ELSE 'Winter ' || v_year
  END;

  -- Pick the next album.
  -- Strategy 1: room_album_queue (curator-managed upcoming sequence).
  SELECT q.id, q.album_id INTO v_queue_id, v_album_id
  FROM room_album_queue q
  WHERE q.room_id = p_room_id AND q.consumed_at IS NULL
  ORDER BY q.queue_position
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- Strategy 2 (fallback): least-recently-used album from the room's
  -- own history, excluding the cycle currently being rolled over.
  IF v_album_id IS NULL THEN
    SELECT c.album_id INTO v_album_id
    FROM cycles c
    WHERE c.room_id = p_room_id
      AND c.id IS DISTINCT FROM p_previous_cycle_id
    GROUP BY c.album_id
    ORDER BY MAX(c.start_date) ASC NULLS FIRST, c.album_id
    LIMIT 1;
  END IF;

  -- No queue, no history → nothing to activate. Bail without error so the
  -- driver can continue processing other rooms.
  IF v_album_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Insert the new cycle. Composite uniqueness on (room_id, year,
  -- week_number) makes this safe to call twice within the same week.
  INSERT INTO cycles (
    room_id, album_id, week_number, year,
    start_date, end_date, season_label,
    current_phase, phase_changed_at
  ) VALUES (
    p_room_id, v_album_id, v_week_number, v_year,
    v_start_date, v_end_date, v_season_label,
    compute_expected_cycle_phase(v_start_date, CURRENT_DATE), now()
  )
  ON CONFLICT (room_id, year, week_number) DO NOTHING
  RETURNING id INTO v_new_cycle_id;

  -- If the insert was a no-op (cycle already exists for this week),
  -- fetch the existing cycle's id so we still point the room at it.
  IF v_new_cycle_id IS NULL THEN
    SELECT id INTO v_new_cycle_id
    FROM cycles
    WHERE room_id = p_room_id AND year = v_year AND week_number = v_week_number;
  END IF;

  IF v_new_cycle_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Copy prompts forward from the previous cycle. New cycles inherit the
  -- prior prompt set so the active room is never visually empty at
  -- rollover. Curator essays are intentionally NOT copied — those are
  -- per-cycle artifacts written after listening, not boilerplate.
  IF p_previous_cycle_id IS NOT NULL THEN
    INSERT INTO cycle_prompts (cycle_id, question, hint, display_order, release_phase)
    SELECT v_new_cycle_id, question, hint, display_order, release_phase
    FROM cycle_prompts
    WHERE cycle_id = p_previous_cycle_id
    ON CONFLICT DO NOTHING;
  END IF;

  -- Point the room at the new cycle.
  UPDATE rooms
  SET current_cycle_id = v_new_cycle_id, updated_at = now()
  WHERE id = p_room_id;

  -- Mark queue entry consumed if we used one.
  IF v_queue_id IS NOT NULL THEN
    UPDATE room_album_queue
    SET consumed_at = now(), consumed_cycle_id = v_new_cycle_id
    WHERE id = v_queue_id;
  END IF;

  RETURN v_new_cycle_id;
END;
$$;

-- ── Driver: advance every active room's cycle ───────────────────────────────
-- The heart of the engine. Idempotent. Cheap to call repeatedly: each
-- room is a single phase comparison and at most one UPDATE.
--
-- Returns a one-row summary for observability:
--   rooms_advanced      = phase shifted within an active cycle (e.g. Mon→Tue)
--   rooms_rolled_over   = previous cycle archived + next cycle activated
--   rooms_activated     = room had no current cycle; one was activated
CREATE OR REPLACE FUNCTION advance_cycle_phases(
  p_today DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  rooms_advanced     INTEGER,
  rooms_rolled_over  INTEGER,
  rooms_activated    INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_room                RECORD;
  v_cycle               RECORD;
  v_expected            cycle_phase;
  v_new_cycle_id        UUID;
  v_rooms_advanced      INTEGER := 0;
  v_rooms_rolled_over   INTEGER := 0;
  v_rooms_activated     INTEGER := 0;
BEGIN
  FOR v_room IN
    SELECT r.id, r.current_cycle_id, r.cycle_cadence, r.cycle_anchor_day
    FROM rooms r
    WHERE r.cycle_cadence IS DISTINCT FROM 'hiatus'  -- skip dormant rooms
  LOOP
    -- Case A: room has no current cycle. Activate one.
    IF v_room.current_cycle_id IS NULL THEN
      v_new_cycle_id := activate_next_cycle_for_room(v_room.id, NULL, NULL);
      IF v_new_cycle_id IS NOT NULL THEN
        v_rooms_activated := v_rooms_activated + 1;
      END IF;
      CONTINUE;
    END IF;

    -- Fetch current cycle (with row lock to serialize concurrent advances).
    SELECT c.id, c.start_date, c.current_phase
    INTO v_cycle
    FROM cycles c
    WHERE c.id = v_room.current_cycle_id
    FOR UPDATE;

    -- Case B: dangling FK (cycle row missing). Activate fresh.
    IF NOT FOUND THEN
      v_new_cycle_id := activate_next_cycle_for_room(v_room.id, NULL, NULL);
      IF v_new_cycle_id IS NOT NULL THEN
        v_rooms_activated := v_rooms_activated + 1;
      END IF;
      CONTINUE;
    END IF;

    v_expected := compute_expected_cycle_phase(v_cycle.start_date, p_today);

    -- Case C: cycle has expired (past its 6-day window). Archive + activate next.
    IF v_expected = 'archived' THEN
      UPDATE cycles
      SET current_phase    = 'archived',
          phase_changed_at = now(),
          archived_at      = COALESCE(archived_at, now())
      WHERE id = v_cycle.id
        AND current_phase IS DISTINCT FROM 'archived';

      v_new_cycle_id := activate_next_cycle_for_room(v_room.id, v_cycle.id, NULL);
      IF v_new_cycle_id IS NOT NULL THEN
        v_rooms_rolled_over := v_rooms_rolled_over + 1;
      END IF;
      CONTINUE;
    END IF;

    -- Case D: phase advance within an active cycle.
    IF v_cycle.current_phase IS DISTINCT FROM v_expected THEN
      UPDATE cycles
      SET current_phase    = v_expected,
          phase_changed_at = now()
      WHERE id = v_cycle.id;
      v_rooms_advanced := v_rooms_advanced + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_rooms_advanced, v_rooms_rolled_over, v_rooms_activated;
END;
$$;

-- Lock down the driver to service-role / function-internal callers.
-- App code reaches it via the /api/cron/advance-cycles endpoint (which uses
-- the admin client) or via pg_cron.
REVOKE EXECUTE ON FUNCTION advance_cycle_phases(DATE) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION activate_next_cycle_for_room(UUID, UUID, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION advance_cycle_phases(DATE) TO service_role;
GRANT  EXECUTE ON FUNCTION activate_next_cycle_for_room(UUID, UUID, DATE) TO service_role;

-- ── pg_cron schedule (optional) ────────────────────────────────────────────
-- Hourly check. The function is a no-op on hours where nothing needs to
-- change, so the cost is negligible. If pg_cron is not installed the DO
-- block silently exits and the app-layer / external-cron path takes over.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drop any prior schedule before re-creating, so renames or schedule
    -- changes apply cleanly on re-run.
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'advance-cycle-phases-hourly';
    PERFORM cron.schedule(
      'advance-cycle-phases-hourly',
      '0 * * * *',
      'SELECT advance_cycle_phases()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- pg_cron unavailable; app/external-cron fallback active
END $$;
