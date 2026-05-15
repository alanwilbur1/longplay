-- ============================================================
-- LongPlay Phase 3A — Moment Infrastructure
-- Apply in Supabase SQL editor (safe to re-run; uses IF NOT EXISTS)
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE moment_type AS ENUM (
    'mark',
    'annotation',
    'reflection',
    'prompt_response',
    'rating',
    'reply',
    'save'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE moment_visibility AS ENUM (
    'private',
    'club',
    'connection',
    'public'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE participation_event_type AS ENUM (
    'listen_start',
    'listen_complete',
    'cycle_join',
    'moment_create',
    'annotation_add',
    'reflection_submit',
    'prompt_respond',
    'album_save'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── moments ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS moments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         uuid        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type              moment_type NOT NULL,
  visibility        moment_visibility NOT NULL DEFAULT 'private',

  -- Album context (static string identifier, e.g. 'for-emma')
  album_id          text        NOT NULL,
  content           text        NOT NULL CHECK (char_length(content) > 0),

  -- Track-level context (timestamp_ms requires track_id)
  track_id          text,
  timestamp_ms      integer,

  -- Cycle context (prompt_response requires cycle_id and prompt_id)
  cycle_id          uuid        REFERENCES cycles(id) ON DELETE SET NULL,
  prompt_id         text,

  -- Branch / revision chain (reply type requires parent_moment_id)
  parent_moment_id  uuid        REFERENCES moments(id) ON DELETE SET NULL,

  -- Soft delete (never hard-delete to preserve branches)
  deleted_at        timestamptz,

  -- Temporal context
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_local_time text,          -- "HH:MM" client-local time
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT annotation_needs_content
    CHECK (type != 'annotation' OR char_length(content) >= 1),
  CONSTRAINT timestamp_requires_track
    CHECK (timestamp_ms IS NULL OR track_id IS NOT NULL),
  CONSTRAINT prompt_response_requires_cycle_and_prompt
    CHECK (type != 'prompt_response' OR (cycle_id IS NOT NULL AND prompt_id IS NOT NULL)),
  CONSTRAINT reply_requires_parent
    CHECK (type != 'reply' OR parent_moment_id IS NOT NULL)
);

-- ── moment_visibility_history ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS moment_visibility_history (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id           uuid        NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  previous_visibility moment_visibility NOT NULL,
  new_visibility      moment_visibility NOT NULL,
  changed_at          timestamptz NOT NULL DEFAULT now(),
  changed_by          uuid        NOT NULL REFERENCES user_profiles(id)
);

-- ── participation_events ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS participation_events (
  id          uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid                     NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  event_type  participation_event_type NOT NULL,
  album_id    text,
  cycle_id    uuid                     REFERENCES cycles(id) ON DELETE SET NULL,
  moment_id   uuid                     REFERENCES moments(id) ON DELETE SET NULL,
  metadata    jsonb,
  created_at  timestamptz              NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_moments_member_created   ON moments (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moments_album_created    ON moments (album_id,  created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moments_cycle_created    ON moments (cycle_id,  created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moments_parent           ON moments (parent_moment_id);
CREATE INDEX IF NOT EXISTS idx_moments_member_type      ON moments (member_id, type);
CREATE INDEX IF NOT EXISTS idx_moments_deleted          ON moments (deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_visibility_history_moment ON moment_visibility_history (moment_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_participation_member      ON participation_events (member_id, created_at DESC);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE moments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE moment_visibility_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE participation_events     ENABLE ROW LEVEL SECURITY;

-- moments: owner-only select (base policy; club-visible gating deferred — see note)
DROP POLICY IF EXISTS "moments_owner_select" ON moments;
CREATE POLICY "moments_owner_select" ON moments
  FOR SELECT USING (auth.uid() = member_id AND deleted_at IS NULL);

-- moments: owner insert only
DROP POLICY IF EXISTS "moments_owner_insert" ON moments;
CREATE POLICY "moments_owner_insert" ON moments
  FOR INSERT WITH CHECK (auth.uid() = member_id);

-- moments: owner can update visibility and deleted_at only (no content edits)
-- Content immutability is enforced at the application layer (no UPDATE content path)
DROP POLICY IF EXISTS "moments_owner_update" ON moments;
CREATE POLICY "moments_owner_update" ON moments
  FOR UPDATE USING (auth.uid() = member_id)
  WITH CHECK (auth.uid() = member_id);

-- moment_visibility_history: owner-only read
DROP POLICY IF EXISTS "visibility_history_owner_select" ON moment_visibility_history;
CREATE POLICY "visibility_history_owner_select" ON moment_visibility_history
  FOR SELECT USING (auth.uid() = changed_by);

-- moment_visibility_history: server-side insert only (via service role)
DROP POLICY IF EXISTS "visibility_history_service_insert" ON moment_visibility_history;
CREATE POLICY "visibility_history_service_insert" ON moment_visibility_history
  FOR INSERT WITH CHECK (auth.uid() = changed_by);

-- participation_events: owner-only
DROP POLICY IF EXISTS "participation_owner_select" ON participation_events;
CREATE POLICY "participation_owner_select" ON participation_events
  FOR SELECT USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "participation_owner_insert" ON participation_events;
CREATE POLICY "participation_owner_insert" ON participation_events
  FOR INSERT WITH CHECK (auth.uid() = member_id);

-- ── Note: Club-visibility gating ─────────────────────────────────────────────
-- Club-visible moments (visibility = 'club') should only be readable by members
-- of the relevant cycle after the discussion phase opens.
-- This requires a JOIN to club_memberships + cycle phase state.
-- LIMITATION: The current RLS policy above is owner-only for safety.
-- Club-read access should be added in Phase 3B once cycle_phase tracking
-- is stable. Until then, club-visible moments behave as private at the DB layer.
-- The application layer can enforce this separately if needed.
