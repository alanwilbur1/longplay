-- 0006_rls_completion.sql
--
-- Discipline correction: two tables created by 0001_baseline.sql
-- (platform_events, membership_tier_history) were never enabled for RLS
-- in main's original schema files. The Supabase security advisor has
-- been flagging both. The 0099_rls_audit guard refuses to apply until
-- they're locked down.
--
-- Posture for both:
--   - RLS enabled
--   - REVOKE all from anon + authenticated
--   - Writes happen via the service-role admin client only (these are
--     platform-internal records, not user-owned)
--   - One self-select policy on membership_tier_history so a listener
--     can see their own history if a future profile surface needs it
--
-- platform_events is intentionally policy-less (RLS on, no policies →
-- denies all non-superuser access). The audit guard would flag that as
-- "no policies"; we add a single service-role passthrough policy to
-- document intent.

-- ── platform_events ──────────────────────────────────────────────────────
ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_events FROM anon, authenticated;

DROP POLICY IF EXISTS "platform_events_service_only" ON public.platform_events;
CREATE POLICY "platform_events_service_only" ON public.platform_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── membership_tier_history ──────────────────────────────────────────────
ALTER TABLE public.membership_tier_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.membership_tier_history FROM anon, authenticated;
GRANT SELECT ON public.membership_tier_history TO authenticated;

DROP POLICY IF EXISTS "tier_history_self_select" ON public.membership_tier_history;
CREATE POLICY "tier_history_self_select" ON public.membership_tier_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tier_history_service_write" ON public.membership_tier_history;
CREATE POLICY "tier_history_service_write" ON public.membership_tier_history
  FOR INSERT
  TO service_role
  WITH CHECK (true);
