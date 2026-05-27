# LongPlay Schema Policy

Phase 6A.14.1 (post-Supabase Data API default tightening).

## Why this policy exists

Supabase historically exposed every table in the `public` schema
through the PostgREST Data API by default. Tables relied on RLS
policies alone to gate per-row access; the role grants
(`anon`/`authenticated` SELECT/INSERT/...) were inherited from
PostgreSQL defaults.

Supabase has tightened that posture. **Default privileges no longer
imply Data API exposure.** A table is reachable through PostgREST
only when an explicit `GRANT` names a role; RLS continues to gate
which rows that role can see.

The Phase 6A.14.1 audit found 26 LongPlay tables in the
"implicit-grant" cohort (migrations 0001-0005). Of those, 14 were
live app surfaces. They were restored by
`0021_explicit_grants_legacy_cohort.sql` without behavior change.

This document is the policy for **everything created after**
`0021`. New tables must follow it; the guard script enforces it
mechanically.

## The three rules

1. Every new public table **MUST** `ENABLE ROW LEVEL SECURITY`.
2. Every new public table **MUST** `REVOKE ALL ... FROM anon, authenticated`.
3. Every new public table **MUST** then pick exactly one access
   template (A, B, or C) and mark the migration with
   `-- @template:<letter>` so the guard recognizes the choice.

## The three templates

### Template A — Server-only internal table

**Pick this for**: derived substrate (Layer 2-5 recompute output,
ritual cycle state), recompute caches, audit logs, sync runs, any
table the admin client owns and no browser/server-action UI
consumer touches.

**Posture**: no role grant. Service role bypasses RLS naturally,
so admin writes still land. Authenticated browser reads return
empty (no GRANT to act on).

```sql
-- @template:A — server-only internal table
CREATE TABLE IF NOT EXISTS foo (
  user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL DEFAULT now()
  -- ...
);

ALTER TABLE foo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON foo FROM anon, authenticated;
-- Intentionally no GRANT. Service role bypasses RLS.
```

**Examples in this repo** (post-0021): planned ritual cycle state
tables, future audit/log surfaces.

**Counter-example** (don't pick A for these): `listener_artists`,
`listener_genres`, etc. — those are read by server actions on
behalf of the listener, so they're Template B.

### Template B — App-facing owner-owned table

**Pick this for**: per-user state listeners read about themselves
through the UI. The vast majority of derived identity tables.

**Posture**: `GRANT SELECT TO authenticated`, RLS policy
`auth.uid() = user_id`. Browser reads see only the listener's own
rows. INSERT/UPDATE/DELETE grants are added only when the listener
authentically authors rows from the browser.

```sql
-- @template:B — app-facing owner-owned table
CREATE TABLE IF NOT EXISTS foo (
  user_id     uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL DEFAULT now()
  -- ...
);

ALTER TABLE foo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON foo FROM anon, authenticated;
GRANT SELECT ON foo TO authenticated;

DROP POLICY IF EXISTS foo_self_select ON foo;
CREATE POLICY foo_self_select ON foo
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
```

Add browser-write only when needed:

```sql
GRANT INSERT, UPDATE ON foo TO authenticated;

DROP POLICY IF EXISTS foo_self_insert ON foo;
CREATE POLICY foo_self_insert ON foo
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS foo_self_update ON foo;
CREATE POLICY foo_self_update ON foo
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
                              WITH CHECK (auth.uid() = user_id);
```

**Examples in this repo**: `listener_artists`, `listener_genres`,
`listener_identity_traits`, `listener_archetype_snapshots`,
`listener_identity_history`, `room_affinity_scores`,
`listening_sync_runs`.

**Counter-example** (don't pick B for these): `rooms`, `albums` —
those are non-owner-scoped catalog data, so they're Template C.

### Template C — Public-read catalog

**Pick this for**: room/album/cycle/curator catalogs — content any
visitor can read.

**Posture**: `GRANT SELECT TO anon, authenticated`, RLS policy
`USING (true)`. Open read; no writes from the API surface.

```sql
-- @template:C — public catalog table
CREATE TABLE IF NOT EXISTS foo (
  slug text PRIMARY KEY,
  -- ...
);

ALTER TABLE foo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON foo FROM anon, authenticated;
GRANT SELECT ON foo TO anon, authenticated;

DROP POLICY IF EXISTS foo_public_select ON foo;
CREATE POLICY foo_public_select ON foo
  FOR SELECT TO anon, authenticated USING (true);
```

**Examples in this repo**: `rooms`, `albums`, `cycles`, `curators`,
`curator_essays`, `cycle_prompts`, `archetypes`,
`room_ecology_snapshots`, `room_adjacency_scores`.

## When a migration doesn't create tables

Column adds, function definitions, index changes, data fixups, RLS
edits, retention helpers — all valid migrations that don't trigger
this policy. Mark the file at the top:

```sql
-- @template:N/A — no public tables created
```

The guard reads the marker and skips the file.

## Special cases

### Multiple tables in one migration

Use one `@template:<letter>` marker per `CREATE TABLE`, immediately
above it. Or use a single marker at the top of the file if every
table in the migration uses the same template.

```sql
-- @template:B — both tables are owner-owned

CREATE TABLE foo (...);
ALTER TABLE foo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON foo FROM anon, authenticated;
GRANT SELECT ON foo TO authenticated;
-- ... policy ...

CREATE TABLE bar (...);
ALTER TABLE bar ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON bar FROM anon, authenticated;
GRANT SELECT ON bar TO authenticated;
-- ... policy ...
```

### Adding a table that needs both owner-self SELECT and public
catalog INSERT (rare)

Don't. Split into two tables, or move the writes behind an RPC.
Mixed-mode access is a smell.

### Adding a column to an existing table

No template marker needed. Use `@template:N/A`.

### Tables that need write access through server actions (not direct
browser writes)

Template A (no grant) is correct. Server actions use the admin
client (`getSupabaseAdminClient`) which bypasses RLS via the
service role. The lack of `GRANT TO authenticated` doesn't stop
admin writes; it only stops a malicious anon/authenticated client
from bypassing the server action by hitting the Data API directly.

## Guard script

`scripts/check-migration-policy.mjs`. Run via
`npm run guard:migration-policy`.

What it checks (only on migrations numbered ≥ `0021`):

1. If the file contains `CREATE TABLE`:
   - It must also contain `ENABLE ROW LEVEL SECURITY`.
   - It must also contain `REVOKE ALL ON ... FROM anon, authenticated`.
   - It must contain at least one `GRANT` statement OR a
     `-- @template:A` marker.
2. If the file contains no `CREATE TABLE`:
   - It must carry a `-- @template:N/A` marker, OR
   - it must be empty of grant-related concerns (no GRANT/REVOKE
     additions either). The guard accepts both.

The script exits non-zero on policy violations and prints which
migration broke which rule. It does NOT enforce template-letter
correctness — choosing A vs B vs C requires human judgment.

## Legacy cohort (0001-0005) — closed

`0021_explicit_grants_legacy_cohort.sql` made the 0001-0005 grants
explicit without changing behavior. Twelve confirmed-dead tables
from that cohort were intentionally left without grants:

> streaming_connections, identity_profiles, identity_snapshots,
> room_affinities (plural), annotations, listening_moments,
> listening_eras, reflections, saved_passages, listening_artifacts,
> compatibility_readings, ai_generations

A post-6B cleanup will drop them after a final
no-production-dependency confirmation. Not in scope here.

## When to deviate

Don't. The three templates are exhaustive in practice. If you
think you need a fourth, escalate first — usually it means a
different problem (e.g., a write surface that should be an RPC,
or a "public-write" table that should be insert-via-server-action
instead).
