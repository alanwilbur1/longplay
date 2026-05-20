-- 0099_rls_audit.sql
--
-- Final guardrail. Fails the migration apply if any table in the public
-- schema does not have RLS enabled, OR has RLS enabled but no policies.
--
-- This is the deploy-blocking version of the Supabase advisor: drift
-- can't slip in through a missed ALTER TABLE.

DO $$
DECLARE
  unprotected RECORD;
  policyless RECORD;
  unprotected_count INTEGER := 0;
  policyless_count INTEGER := 0;
BEGIN
  -- RLS disabled
  FOR unprotected IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false
  LOOP
    unprotected_count := unprotected_count + 1;
    RAISE WARNING 'Table public.% has RLS disabled', unprotected.relname;
  END LOOP;

  IF unprotected_count > 0 THEN
    RAISE EXCEPTION
      'RLS audit failed: % public table(s) have RLS disabled', unprotected_count;
  END IF;

  -- RLS enabled but zero policies (denies all non-superusers — almost
  -- always a misconfiguration we want to surface).
  FOR policyless IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_policies p
      ON p.schemaname = 'public' AND p.tablename = c.relname
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
    GROUP BY c.relname
    HAVING COUNT(p.policyname) = 0
  LOOP
    policyless_count := policyless_count + 1;
    RAISE WARNING 'Table public.% has RLS enabled but no policies (denies all)', policyless.relname;
  END LOOP;

  IF policyless_count > 0 THEN
    RAISE EXCEPTION
      'RLS audit failed: % public table(s) have RLS enabled but no policies', policyless_count;
  END IF;
END $$;
