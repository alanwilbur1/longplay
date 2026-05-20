-- ============================================================
-- LongPlay Phase 2 Schema Additions
-- Additive, idempotent. Run as Supabase superuser.
-- ============================================================

-- ── Rooms: add missing columns ──────────────────────────────
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS emotional_temperature TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS emotional_tags TEXT[] DEFAULT '{}';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS sonic_tags TEXT[] DEFAULT '{}';

-- culture_extras stores unmapped UI fields:
--   invitationText, entryPhrase, associatedArchetypes (rich),
--   albumSample (slug array), weeklyPhase, phaseDay
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS culture_extras JSONB DEFAULT '{}';

-- ── Albums: add slug column ──────────────────────────────────
ALTER TABLE albums ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_slug ON albums(slug) WHERE slug IS NOT NULL;

-- ── Curators: add slug for stable identity mapping ───────────
ALTER TABLE curators ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_curators_slug ON curators(slug) WHERE slug IS NOT NULL;

-- ── Enable RLS on all public-read tables ────────────────────
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE curators ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE curator_essays ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_memberships ENABLE ROW LEVEL SECURITY;

-- ── Public-read policies (idempotent: drop + create) ────────

DROP POLICY IF EXISTS "public_read_rooms" ON rooms;
CREATE POLICY "public_read_rooms" ON rooms
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_read_albums" ON albums;
CREATE POLICY "public_read_albums" ON albums
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_read_cycles" ON cycles;
CREATE POLICY "public_read_cycles" ON cycles
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_read_curators" ON curators;
CREATE POLICY "public_read_curators" ON curators
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_read_cycle_prompts" ON cycle_prompts;
CREATE POLICY "public_read_cycle_prompts" ON cycle_prompts
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_read_curator_essays" ON curator_essays;
CREATE POLICY "public_read_curator_essays" ON curator_essays
  FOR SELECT TO anon, authenticated USING (true);

-- ── Club memberships: own-row access ────────────────────────

DROP POLICY IF EXISTS "memberships_select_own" ON club_memberships;
CREATE POLICY "memberships_select_own" ON club_memberships
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "memberships_insert_own" ON club_memberships;
CREATE POLICY "memberships_insert_own" ON club_memberships
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "memberships_update_own" ON club_memberships;
CREATE POLICY "memberships_update_own" ON club_memberships
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "memberships_delete_own" ON club_memberships;
CREATE POLICY "memberships_delete_own" ON club_memberships
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
