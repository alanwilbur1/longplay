-- 0022_ritual_cadence_substrate.sql
--
-- Phase 6B.1 — Ritual cycle substrate.
--
-- Creates the canonical temporal backbone for LongPlay's weekly
-- ritual platform. Four tables:
--
--   ritual_cycles            Template C — public catalog read.
--                            One row per (room × ritual window ×
--                            artifact). Drives every "this week"
--                            surface.
--
--   ritual_participants      Template B — owner-self SELECT.
--                            Composite PK (cycle, user). Tracks
--                            per-user lifecycle inside a cycle.
--
--   ritual_reflections       Template B — owner-self SELECT plus
--                            peer-select policy gated on cycle
--                            status. Listeners see other listeners'
--                            published reflections only after the
--                            reflection window opens.
--
--   ritual_presence_events   Template A — server-only, append-only.
--                            Continuity memory for what happened
--                            inside a cycle.
--
-- RELATIONSHIP TO EXISTING TABLES
-- ─────────────────────────────────────────────────────────────────
-- The 0001 `cycles` table and 0004 `participation_events` / `moments`
-- tables remain in place. ritual_cycles.legacy_cycle_id bridges to
-- cycles.id so historical content is reachable; ritual_presence_events
-- supersedes the ritual-specific subset of participation_events;
-- ritual_reflections is a first-class ritual artifact distinct from
-- the broader `moments` catch-all. No legacy table is modified or
-- dropped by this migration.
--
-- LIFECYCLE
-- ─────────────────────────────────────────────────────────────────
-- A ritual cycle moves clock-driven through:
--
--     upcoming → active → reflection → archived
--
-- The transition is purely time-derived from (starts_at, lock_at,
-- reflection_opens_at, reflection_closes_at). cycle_status is the
-- materialized projection of that clock state, refreshed by
-- lib/ritual/lifecycle.ts:transitionRitualCycles() on each sweep
-- (cron + on-demand). A partial unique index enforces
-- "exactly one active|reflection cycle per room" at the DB level.
--
-- DURABILITY
-- ─────────────────────────────────────────────────────────────────
-- - ritual_cycles                — non-destructive; archived via
--                                  status + timestamp, not delete.
-- - ritual_participants          — UPSERT-friendly composite PK
--                                  for join idempotency.
-- - ritual_reflections           — soft-delete via deleted_at;
--                                  never hard-deleted to preserve
--                                  the cycle's reflection memory.
-- - ritual_presence_events       — pure append-only.

-- ═════════════════════════════════════════════════════════════════
-- ritual_cycles
-- ═════════════════════════════════════════════════════════════════

-- @template:C — public catalog table
CREATE TABLE IF NOT EXISTS ritual_cycles (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                  uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,

  -- The cultural artifact this cycle revolves around. Album today;
  -- ritual_type opens space for future kinds (e.g. mix, reading).
  artifact_album_id        uuid REFERENCES albums(id) ON DELETE SET NULL,

  -- Optional bridge to the legacy 0001 cycles row. Allows historical
  -- reads to span both substrates during the migration window.
  legacy_cycle_id          uuid REFERENCES cycles(id) ON DELETE SET NULL,

  -- 'album_ritual' is the only kind today. Future kinds add values;
  -- treat as an open vocabulary, not a strict enum, so adding new
  -- ritual shapes doesn't require a type migration.
  ritual_type              text NOT NULL DEFAULT 'album_ritual'
    CHECK (length(ritual_type) <= 64),

  -- Monotonic per-room sequence number. Cycle 1 is the room's first
  -- ritual. UI surfaces "Week N" using this.
  cycle_number             integer NOT NULL CHECK (cycle_number >= 1),

  -- Lifecycle timestamps. All UTC. Ordering is enforced by CHECKs.
  starts_at                timestamptz NOT NULL,
  -- After lock_at, no new participants may join (existing ones can
  -- complete + reflect; reflections submitted later still land).
  lock_at                  timestamptz NOT NULL,
  -- Reflection window opens. ritual_reflections may be submitted
  -- (drafts allowed earlier; visibility to peers turns on at this
  -- timestamp via the RLS policy gated on cycle_status).
  reflection_opens_at      timestamptz NOT NULL,
  -- Reflection window closes. Cycle moves to 'archived' state.
  -- Reflections submitted before this remain visible thereafter;
  -- further reflection writes are blocked by service-side checks.
  reflection_closes_at     timestamptz NOT NULL,

  -- Stamped when the cycle is moved to 'archived'. Distinct from
  -- reflection_closes_at because the transition is performed by
  -- a service sweep (it might run minutes after the clock crosses).
  archived_at              timestamptz,

  -- Materialized status — derived from (now, timestamps). Persisted
  -- so a single index lookup finds the active cycle for a room.
  -- See lib/ritual/lifecycle.ts:computeCycleStatusForTime() for the
  -- pure function that derives this; the transition sweep writes it.
  cycle_status             text NOT NULL DEFAULT 'upcoming'
    CHECK (cycle_status IN ('upcoming','active','reflection','archived')),

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- Per-room cycle numbers are unique. Two rooms can both have
  -- cycle 1, but a single room cannot.
  UNIQUE (room_id, cycle_number),

  -- Timestamp ordering invariants. The lifecycle is monotonic; a
  -- cycle with reflection_opens_at < lock_at would model an
  -- impossible state.
  CONSTRAINT ritual_cycles_lock_after_start
    CHECK (lock_at >= starts_at),
  CONSTRAINT ritual_cycles_reflection_after_lock
    CHECK (reflection_opens_at >= lock_at),
  CONSTRAINT ritual_cycles_close_after_reflection
    CHECK (reflection_closes_at >= reflection_opens_at)
);

-- DB-enforced "exactly one active|reflection cycle per room". A
-- partial unique index — upcoming and archived cycles can coexist
-- freely; active/reflection collapse to at-most-one. The transition
-- sweep MUST archive the old cycle before promoting the next one
-- (handled in a single transaction in lib/ritual/cycles.ts).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ritual_cycles_room_live
  ON ritual_cycles (room_id)
  WHERE cycle_status IN ('active','reflection');

-- Primary serving query: "what's this room doing right now?"
CREATE INDEX IF NOT EXISTS idx_ritual_cycles_room_status_starts
  ON ritual_cycles (room_id, cycle_status, starts_at DESC);

-- Transition-sweep query: find every cycle whose status is stale.
CREATE INDEX IF NOT EXISTS idx_ritual_cycles_status_starts
  ON ritual_cycles (cycle_status, starts_at);

-- Operator query: "what's coming up across the platform?"
CREATE INDEX IF NOT EXISTS idx_ritual_cycles_upcoming_starts
  ON ritual_cycles (starts_at)
  WHERE cycle_status = 'upcoming';

ALTER TABLE ritual_cycles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ritual_cycles FROM anon, authenticated;
GRANT SELECT ON ritual_cycles TO anon, authenticated;

DROP POLICY IF EXISTS ritual_cycles_public_select ON ritual_cycles;
CREATE POLICY ritual_cycles_public_select ON ritual_cycles
  FOR SELECT TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS trg_ritual_cycles_touch ON ritual_cycles;
CREATE TRIGGER trg_ritual_cycles_touch
  BEFORE UPDATE ON ritual_cycles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═════════════════════════════════════════════════════════════════
-- ritual_participants
-- ═════════════════════════════════════════════════════════════════

-- @template:B — app-facing owner-owned table
CREATE TABLE IF NOT EXISTS ritual_participants (
  ritual_cycle_id          uuid NOT NULL REFERENCES ritual_cycles(id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  joined_at                timestamptz NOT NULL DEFAULT now(),
  completed_at             timestamptz,
  reflected_at             timestamptz,
  -- Refreshed on every write/event for this participant within this
  -- cycle. Drives "last_active" displays without joining the events
  -- table.
  last_activity_at         timestamptz NOT NULL DEFAULT now(),

  -- joined         — accepted the ritual; no listening signal yet
  -- listening      — at least one listen_start event observed
  -- completed      — listen_complete observed
  -- reflected      — completed + submitted a reflection
  -- withdrawn      — explicitly opted out (preserved for continuity)
  participation_state      text NOT NULL DEFAULT 'joined'
    CHECK (participation_state IN ('joined','listening','completed','reflected','withdrawn')),

  -- [0..1] fraction of the artifact engaged with. NULL when no
  -- listening signal yet OR no completion model available for the
  -- ritual_type (Phase 6B.1 ships with NULL; future phases populate
  -- via Layer 1 listening_events join).
  completion_percent       numeric(4,3) CHECK (completion_percent IS NULL OR (completion_percent BETWEEN 0 AND 1)),

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (ritual_cycle_id, user_id)
);

-- Listener's own "what am I in?" lookup.
CREATE INDEX IF NOT EXISTS idx_ritual_participants_user_activity
  ON ritual_participants (user_id, last_activity_at DESC);

-- Room-side roster: who's in cycle X, ranked by activity.
CREATE INDEX IF NOT EXISTS idx_ritual_participants_cycle_state
  ON ritual_participants (ritual_cycle_id, participation_state, last_activity_at DESC);

ALTER TABLE ritual_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ritual_participants FROM anon, authenticated;
GRANT SELECT ON ritual_participants TO authenticated;

DROP POLICY IF EXISTS ritual_participants_self_select ON ritual_participants;
CREATE POLICY ritual_participants_self_select ON ritual_participants
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- INSERT/UPDATE happen through server actions using the admin
-- client (which bypasses RLS) so participation state writes carry
-- the same audit and validation as any other ritual lifecycle event.
-- No browser INSERT/UPDATE/DELETE grants — listeners cannot rewrite
-- their participation state directly.

DROP TRIGGER IF EXISTS trg_ritual_participants_touch ON ritual_participants;
CREATE TRIGGER trg_ritual_participants_touch
  BEFORE UPDATE ON ritual_participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═════════════════════════════════════════════════════════════════
-- ritual_reflections
-- ═════════════════════════════════════════════════════════════════

-- @template:B — app-facing owner-owned table
CREATE TABLE IF NOT EXISTS ritual_reflections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ritual_cycle_id          uuid NOT NULL REFERENCES ritual_cycles(id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  body                     text NOT NULL CHECK (
    char_length(body) > 0 AND char_length(body) <= 8000
  ),

  -- draft     — author is still composing; visible only to self
  -- published — visible per the cycle-status-gated peer policy below
  -- archived  — author soft-removed; not rendered anywhere
  reflection_state         text NOT NULL DEFAULT 'draft'
    CHECK (reflection_state IN ('draft','published','archived')),

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  -- Soft-delete sentinel. Reflections are NEVER hard-deleted so that
  -- archived cycle continuity (e.g. "this cycle had 23 reflections")
  -- remains true. Filter on deleted_at IS NULL in serving queries.
  deleted_at               timestamptz
);

-- Peer-facing serving query: "show me the published reflections for
-- this cycle". Partial index on the visibility predicate.
CREATE INDEX IF NOT EXISTS idx_ritual_reflections_cycle_published
  ON ritual_reflections (ritual_cycle_id, created_at DESC)
  WHERE deleted_at IS NULL AND reflection_state = 'published';

-- Listener's own reflection history.
CREATE INDEX IF NOT EXISTS idx_ritual_reflections_user_created
  ON ritual_reflections (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE ritual_reflections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ritual_reflections FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ritual_reflections TO authenticated;

-- Self-select — own reflections always readable (drafts included).
DROP POLICY IF EXISTS ritual_reflections_self_select ON ritual_reflections;
CREATE POLICY ritual_reflections_self_select ON ritual_reflections
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Peer-select — other listeners' published reflections only become
-- visible AFTER the reflection window opens (cycle in 'reflection'
-- or 'archived' state). Drafts and archived rows are never peer-
-- visible. This is the canonical "no spoilers during the ritual"
-- gate, enforced in the database — not the UI.
DROP POLICY IF EXISTS ritual_reflections_peer_select ON ritual_reflections;
CREATE POLICY ritual_reflections_peer_select ON ritual_reflections
  FOR SELECT TO authenticated USING (
    reflection_state = 'published'
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM ritual_cycles rc
      WHERE rc.id = ritual_reflections.ritual_cycle_id
        AND rc.cycle_status IN ('reflection','archived')
    )
  );

-- Self-insert / self-update — listeners author and edit their own.
-- The body length and reflection_state CHECKs guard against
-- malformed writes; the cycle-window gating happens in the service
-- layer (lib/ritual/reflections.ts) rather than RLS so we can
-- return clean user-facing errors instead of opaque 403s.
DROP POLICY IF EXISTS ritual_reflections_self_insert ON ritual_reflections;
CREATE POLICY ritual_reflections_self_insert ON ritual_reflections
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ritual_reflections_self_update ON ritual_reflections;
CREATE POLICY ritual_reflections_self_update ON ritual_reflections
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
                              WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_ritual_reflections_touch ON ritual_reflections;
CREATE TRIGGER trg_ritual_reflections_touch
  BEFORE UPDATE ON ritual_reflections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═════════════════════════════════════════════════════════════════
-- ritual_presence_events
-- ═════════════════════════════════════════════════════════════════

-- @template:A — server-only internal table
--
-- Pure append-only continuity memory. Every transition inside a
-- ritual cycle stamps a row here. Not exposed to the Data API —
-- only the admin client (service role) reads/writes. Future
-- analytics / continuity-scoring services read this directly.

CREATE TABLE IF NOT EXISTS ritual_presence_events (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ritual_cycle_id          uuid NOT NULL REFERENCES ritual_cycles(id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- Open vocabulary, not enum, so future events (e.g. 'marked',
  -- 'shared') can be added without a type migration. Bounded length
  -- prevents accidental blob payloads in the type column.
  event_type               text NOT NULL CHECK (length(event_type) <= 64),

  -- Free-form per-event payload. Examples:
  --   joined                   { "via": "auto-place" | "manual" }
  --   listening_started        { "source": "spotify" }
  --   listening_completed      { "completion_percent": 0.97 }
  --   reflection_submitted     { "reflection_id": "<uuid>", "char_count": 412 }
  --   reflection_updated       { "reflection_id": "<uuid>", "from_state": "draft" }
  --   revisited                { "days_since_archive": 14 }
  --   withdrew                 { "reason": "explicit" | "lifecycle_lock" }
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ritual_presence_events_cycle_created
  ON ritual_presence_events (ritual_cycle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ritual_presence_events_user_created
  ON ritual_presence_events (user_id, created_at DESC);

ALTER TABLE ritual_presence_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ritual_presence_events FROM anon, authenticated;
-- Intentionally no GRANT. Service role bypasses RLS naturally.
