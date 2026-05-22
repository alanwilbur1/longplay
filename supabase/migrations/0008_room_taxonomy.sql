-- 0008_room_taxonomy.sql
--
-- Phase 4.2 — Real room taxonomy.
--
-- Turn rooms from atmospheric shells into recommendation-ready
-- entities. Adds structured metadata the heuristic recommender (Phase
-- 4.2 lib/recommendations) consumes: genres, moods, energy level,
-- cadence, featured flag, cover art, weight, and a real member_count.
--
-- Auth/onboarding/listening_connections tables untouched.
--
-- Existing rooms fields kept as-is (description, manifesto, tagline,
-- atmosphere, emotional_tags, sonic_tags, culture_extras, etc.). The
-- new columns are ADDITIVE; nothing removed.

-- ── room_type enum extension ────────────────────────────────────────────
-- Existing values: editorial | genre | creator | private
-- New values:      community | seasonal | event
-- ALTER TYPE ADD VALUE supports IF NOT EXISTS (PG 12+) so this is
-- safe to re-run.
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'community';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'seasonal';
ALTER TYPE room_type ADD VALUE IF NOT EXISTS 'event';

-- ── New rooms columns ───────────────────────────────────────────────────
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS genres                text[]   NOT NULL DEFAULT '{}';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS moods                 text[]   NOT NULL DEFAULT '{}';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS energy_level          text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cadence               text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS featured              boolean  NOT NULL DEFAULT false;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cover_art             text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS recommendation_weight smallint NOT NULL DEFAULT 50
                                            CHECK (recommendation_weight BETWEEN 0 AND 100);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS member_count          integer  NOT NULL DEFAULT 0;

-- ── Value constraints (NOT VALID so adding to a populated table is
--    safe; new INSERT/UPDATE rows are checked). Both columns allow
--    NULL since rooms can opt out of declaring energy/cadence. ──
DO $$ BEGIN
  ALTER TABLE rooms ADD CONSTRAINT rooms_energy_level_check
    CHECK (energy_level IS NULL OR energy_level IN ('low','medium','high'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE rooms ADD CONSTRAINT rooms_cadence_check
    CHECK (cadence IS NULL OR cadence IN ('weekly','biweekly','monthly','seasonal','ongoing'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Indexes for the recommendation read path ────────────────────────────
-- GIN on tag arrays for cheap overlap (&&) queries.
CREATE INDEX IF NOT EXISTS idx_rooms_genres_gin ON rooms USING GIN (genres);
CREATE INDEX IF NOT EXISTS idx_rooms_moods_gin  ON rooms USING GIN (moods);

-- Featured + recommendation_weight partial — small but frequently sorted.
CREATE INDEX IF NOT EXISTS idx_rooms_featured ON rooms (featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_rooms_weight_desc ON rooms (recommendation_weight DESC NULLS LAST);

-- ── Member-count maintenance ────────────────────────────────────────────
-- Keep rooms.member_count in sync with active club_memberships via
-- triggers. Cheap and authoritative; saves the recommender a JOIN.
CREATE OR REPLACE FUNCTION recount_room_members(target_room_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE rooms
  SET member_count = (
    SELECT count(*)
    FROM club_memberships
    WHERE room_id = target_room_id AND status = 'active'
  )
  WHERE id = target_room_id;
$$;

CREATE OR REPLACE FUNCTION on_club_membership_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recount_room_members(NEW.room_id);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Status flip (active ↔ left) changes the count
    PERFORM recount_room_members(NEW.room_id);
    IF OLD.room_id <> NEW.room_id THEN
      PERFORM recount_room_members(OLD.room_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recount_room_members(OLD.room_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_club_membership_recount ON club_memberships;
CREATE TRIGGER trg_club_membership_recount
  AFTER INSERT OR UPDATE OR DELETE ON club_memberships
  FOR EACH ROW EXECUTE FUNCTION on_club_membership_change();

-- One-time backfill for any rooms that already have memberships.
UPDATE rooms r
SET member_count = (
  SELECT count(*) FROM club_memberships m
  WHERE m.room_id = r.id AND m.status = 'active'
);
