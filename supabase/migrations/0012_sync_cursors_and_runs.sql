-- 0012_sync_cursors_and_runs.sql
--
-- Phase 6A.2B — Recurring sync + incremental cursors.
--
-- Phase 4.x sync only ran post-OAuth and from the manual "Sync now"
-- button. Phase 6A.2B adds:
--   1. Cursor columns on listening_connections so the next sync only
--      fetches plays we haven't seen, plus a scheduler-friendly
--      "next_sync_after" stamp + consecutive-failure counter for
--      exponential backoff.
--   2. listening_sync_runs — append-only audit log per sync attempt.
--      Captures outcome + safe error summary; never tokens.
--
-- Preserves existing tables, RLS, and policies. Net-additive only.

-- ── Cursor + scheduler fields on listening_connections ──────────────
ALTER TABLE listening_connections
  ADD COLUMN IF NOT EXISTS recently_played_cursor timestamptz,
  ADD COLUMN IF NOT EXISTS next_sync_after        timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures   integer NOT NULL DEFAULT 0;

-- Scheduler selection index: connections eligible to sync, ordered by
-- next_sync_after ASC (NULLs first = "never synced, take me first").
CREATE INDEX IF NOT EXISTS idx_listening_connections_next_sync
  ON listening_connections (source_id, status, next_sync_after NULLS FIRST)
  WHERE status = 'active';

-- ── Sync run audit log ──────────────────────────────────────────────
-- Append-only. The scheduler inserts one row per attempted sync. Rows
-- carry counts, status, safe error summary, and which cursor moved.
-- Tokens, scopes, raw provider responses are NEVER persisted here.

CREATE TABLE IF NOT EXISTS listening_sync_runs (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                           uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  source_id                         text NOT NULL REFERENCES listening_sources(id),
  -- 'cron'   : runScheduledSync hourly scheduler
  -- 'oauth'  : callback's post-connect warm-up sync
  -- 'manual' : "Sync now" button in /profile
  trigger                           text NOT NULL CHECK (trigger IN ('cron','oauth','manual')),
  -- ok               : full success, no error
  -- partial          : sync persisted data but a sub-stage soft-failed
  --                    (e.g. hydration_error set; events still upserted)
  -- skipped          : selection-side decided not to run (e.g. status
  --                    not active by the time the worker grabbed it)
  -- failed           : hard failure at sync, upsert, or token-decrypt stage
  -- rate_limited     : provider returned 429 during sync
  -- reauth_required  : refresh failed, connection moved to reauth_required
  status                            text NOT NULL CHECK (status IN
    ('ok','partial','skipped','failed','rate_limited','reauth_required')),
  started_at                        timestamptz NOT NULL DEFAULT now(),
  finished_at                       timestamptz,
  duration_ms                       integer,
  -- Counts JSON — same shape as SyncOutcome.counts in lib/streaming/sync.ts.
  counts                            jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_token                   boolean NOT NULL DEFAULT false,
  -- Cursor movement for forensics. NULL when the cursor didn't change.
  recently_played_cursor_before     timestamptz,
  recently_played_cursor_after      timestamptz,
  -- Safe error summary. ≤500 chars; truncated by app layer.
  -- NEVER contains tokens, scopes, or raw provider response bodies.
  error_summary                     text CHECK (error_summary IS NULL OR length(error_summary) <= 500),
  created_at                        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listening_sync_runs_user_started
  ON listening_sync_runs (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_listening_sync_runs_status_started
  ON listening_sync_runs (status, started_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────
-- Same posture as listening_connections: owner SELECT for the listener
-- to inspect their own sync history; service-role only for INSERT/UPDATE.

ALTER TABLE listening_sync_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON listening_sync_runs FROM anon, authenticated;
GRANT SELECT ON listening_sync_runs TO authenticated;

DROP POLICY IF EXISTS listening_sync_runs_self_select ON listening_sync_runs;
CREATE POLICY listening_sync_runs_self_select ON listening_sync_runs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
