-- ============================================================
-- LONGPLAY SCHEMA PATCH — Apply this in Supabase SQL Editor
-- ============================================================
-- 
-- This patch fixes two issues that cause "Database error saving new user":
-- 
-- 1. Makes the on_auth_user_created trigger defensive so a profile-insert
--    failure never rolls back the auth.users INSERT (and never blocks signup).
--
-- 2. Adds missing RLS policies so the server can INSERT and upsert profiles
--    on behalf of authenticated users (required for callback-based creation).
--
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================


-- ─── FIX 1: Defensive trigger ────────────────────────────────────────────────
--
-- The original function has no EXCEPTION handler. If user_profiles is missing
-- or any constraint fails, the entire auth.users INSERT rolls back and Supabase
-- returns "Database error saving new user".
--
-- This version catches all errors, logs them, and lets auth continue.
-- Profile creation is then handled by the /auth/callback route instead.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_profiles (id, display_name)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'Listener')
    )
    ON CONFLICT (id) DO NOTHING;  -- safe for repeated calls (e.g. re-auth)
  EXCEPTION WHEN OTHERS THEN
    -- Log but never block auth
    RAISE LOG 'handle_new_user: could not create profile for user %. error=% detail=%',
      NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ─── FIX 2: Missing INSERT policy on user_profiles ───────────────────────────
--
-- The original schema only has SELECT and UPDATE policies.
-- Without INSERT, authenticated server clients cannot upsert a profile,
-- and the trigger (SECURITY DEFINER) is the only insertion path.
-- Adding this policy lets the auth callback safely upsert the profile
-- after session establishment.

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);


-- ─── FIX 3: INSERT policy for user_memberships ───────────────────────────────
--
-- The callback also creates a starter membership row. This policy is needed.

DROP POLICY IF EXISTS "Users can insert own membership" ON public.user_memberships;
CREATE POLICY "Users can insert own membership" ON public.user_memberships
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own membership" ON public.user_memberships;
CREATE POLICY "Users can update own membership" ON public.user_memberships
  FOR UPDATE USING (auth.uid() = user_id);


-- ─── VERIFY ──────────────────────────────────────────────────────────────────
-- After running, check the output of these queries to confirm:

-- SELECT proname, prosrc FROM pg_proc WHERE proname = 'handle_new_user';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'user_profiles';
