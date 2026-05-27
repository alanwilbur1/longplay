-- 0014_snapshot_algorithm_version.sql
--
-- Phase 6A.4 — snapshot/recommendation cutover to Layer 2 reads.
--
-- Adds an algorithm_version marker to listening_profile_snapshots so
-- the operator (and future code) can distinguish:
--   - v1 snapshots: computed by the Phase 4.5 code path that read
--                   favorite_artists + artist_genre_enrichments
--                   directly and unioned at the snapshot boundary.
--   - v2 snapshots: computed by the Phase 6A.4 path that reads
--                   listener_genres + listener_artists (Layer 2 is
--                   the union point; snapshot just reads it).
--
-- Behavioral semantics — see lib/streaming/sync.ts where the new
-- recomputeListeningProfileSnapshotFromLayer2() lives. The migration
-- is purely metadata; no data migration / backfill needed. Existing
-- rows retain NULL until their next recompute (which happens on the
-- next sync via the hourly cron).
--
-- Why this exists separately from a recompute trigger:
--   - Pre-cutover deployments can read the column to know they're
--     looking at "old" snapshots
--   - Future versioning bumps (Layer 4 affinity cache, archetype
--     attachment) can use the same column without another migration

ALTER TABLE listening_profile_snapshots
  ADD COLUMN IF NOT EXISTS algorithm_version text;

COMMENT ON COLUMN listening_profile_snapshots.algorithm_version IS
  'Identifier of the recompute algorithm that last wrote this row. '
  'NULL = pre-Phase 6A.4 (Layer 1 reads). v2 = post-Phase 6A.4 (Layer 2 reads).';
