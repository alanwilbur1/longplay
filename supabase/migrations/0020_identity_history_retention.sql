-- 0020_identity_history_retention.sql
--
-- Phase 6A.14 — bounded retention for listener_identity_history.
--
-- listener_identity_history is INSERT-only. The 6A.9 append rules
-- (drift OR ≥7 days since last row) bound growth to ~52 rows/user/year
-- under normal use — manageable but unbounded as ritual cycles add
-- their own historical layers. This migration installs a SQL function
-- that trims a user's history to the N most-recent rows, callable
-- from the app layer on every append.
--
-- Posture:
--   - additive only (no changes to listener_identity_history shape)
--   - SECURITY DEFINER so service-role and authenticated paths both
--     execute the same way; the function only operates on the
--     supplied user_id, so a privilege check by the caller (admin
--     client / RLS) is still required to invoke it for a foreign user
--   - retention is CAP-based, not TTL-based — keeps the most recent N
--     entries regardless of age, so a user with sparse history (3
--     rows over 10 years) never loses any
--   - default cap = 200 rows ≈ 4 years of weekly snapshots; matches
--     6B planning horizon
--
-- Invocation is best-effort. The app layer calls this AFTER a
-- successful append and ignores errors — a retention failure must
-- never block sync.

CREATE OR REPLACE FUNCTION trim_listener_identity_history(
  p_user_id     uuid,
  p_keep_count  integer DEFAULT 200
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF p_keep_count < 1 THEN
    RAISE EXCEPTION 'p_keep_count must be >= 1, got %', p_keep_count;
  END IF;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id
             ORDER BY snapshot_at DESC, created_at DESC, id DESC
           ) AS rn
    FROM listener_identity_history
    WHERE user_id = p_user_id
  ),
  victims AS (
    DELETE FROM listener_identity_history
    WHERE id IN (SELECT id FROM ranked WHERE rn > p_keep_count)
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM victims;

  RETURN v_deleted;
END;
$$;

-- Service-role and authenticated paths can both invoke; the function
-- still scopes its work to the supplied user_id. The app layer should
-- only call it for the listener's OWN row (verified upstream).
REVOKE ALL ON FUNCTION trim_listener_identity_history(uuid, integer)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION trim_listener_identity_history(uuid, integer)
  TO authenticated;

-- Operator audit query example:
--   SELECT user_id, count(*) AS history_rows
--   FROM listener_identity_history
--   GROUP BY user_id
--   ORDER BY history_rows DESC
--   LIMIT 20;
--
-- Per-user manual trim example:
--   SELECT trim_listener_identity_history('<uuid>', 200);
