# CLAUDE.md — LongPlay project guidance for Claude Code

This file is read automatically by Claude Code at session start.
Project-wide conventions go here. Phase-specific work, recent context,
and short-lived TODOs live in chat (or in `/docs` for long-form
references).

## Migration policy (REQUIRED for every new migration)

Phase 6A.14.1 audit found 26 legacy tables that relied on PostgreSQL
default privileges + RLS to gate Data API exposure. Supabase has
since tightened those defaults, so implicit reach is gone. Every new
migration that creates a public-schema table **must** use explicit
REVOKE+GRANT and pick one of three templates.

### The three rules

1. **Every new public table MUST `ENABLE ROW LEVEL SECURITY`.**
   The `0099_rls_audit.sql` guardrail will fail the deploy otherwise.

2. **Every new public table MUST `REVOKE ALL ... FROM anon, authenticated`.**
   This is the only way to make role grants explicit. Defaults are no
   longer reliable.

3. **Every new public table MUST then pick exactly ONE of three
   templates** (A / B / C). The choice goes in a `-- @template:`
   marker comment for the guard script (`npm run guard:migration-policy`)
   to recognize.

### Template A — Server-only internal table

For derived substrate, recompute caches, audit logs, sync runs,
ritual cycle state, anything the admin client writes and only the
recompute pipeline reads. **No browser/server-action consumer.**

```sql
-- @template:A — server-only internal table
CREATE TABLE IF NOT EXISTS foo (
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  ...
);

ALTER TABLE foo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON foo FROM anon, authenticated;
-- Intentionally no GRANT. Service role bypasses RLS naturally.
```

### Template B — App-facing owner-owned table

For per-user state listeners read about themselves in the UI
(Layer 2-5 derived tables, identity history, moments). Default to
SELECT-only; add INSERT/UPDATE/DELETE only when the browser
authentically authors rows.

```sql
-- @template:B — app-facing owner-owned table
CREATE TABLE IF NOT EXISTS foo (
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  ...
);

ALTER TABLE foo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON foo FROM anon, authenticated;
GRANT SELECT ON foo TO authenticated;

DROP POLICY IF EXISTS foo_self_select ON foo;
CREATE POLICY foo_self_select ON foo
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Add only when the listener directly authors rows from the browser:
-- GRANT INSERT, UPDATE ON foo TO authenticated;
-- DROP POLICY IF EXISTS foo_self_insert ON foo;
-- CREATE POLICY foo_self_insert ON foo
--   FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- DROP POLICY IF EXISTS foo_self_update ON foo;
-- CREATE POLICY foo_self_update ON foo
--   FOR UPDATE TO authenticated USING (auth.uid() = user_id)
--                                WITH CHECK (auth.uid() = user_id);
```

### Template C — Public catalog table

For room/album/cycle/curator catalogs — content that any visitor
can read.

```sql
-- @template:C — public catalog table
CREATE TABLE IF NOT EXISTS foo (
  ...
);

ALTER TABLE foo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON foo FROM anon, authenticated;
GRANT SELECT ON foo TO anon, authenticated;

DROP POLICY IF EXISTS foo_public_select ON foo;
CREATE POLICY foo_public_select ON foo
  FOR SELECT TO anon, authenticated USING (true);
```

### When a migration doesn't create tables

Add a marker at the top so the guard skips the check:

```sql
-- @template:N/A — no public tables created (column add / function / index / data fix)
```

### Guard

`npm run guard:migration-policy` scans every migration from `0021`
onward. Older migrations are the legacy cohort closed by
`0021_explicit_grants_legacy_cohort.sql` and are not re-checked.

The guard fails when:
- A migration creates a public table but omits `ENABLE ROW LEVEL SECURITY`.
- A migration creates a public table but omits `REVOKE ALL ... FROM anon, authenticated`.
- A migration creates a public table but contains neither a `GRANT`
  statement nor a `-- @template:A` marker.

CI/local convention: run `npm run guard:migration-policy` before
opening any PR that adds a migration. See `docs/SCHEMA-POLICY.md`
for full rationale + examples.

## Sub-skill quick links

- Full schema policy + examples: `docs/SCHEMA-POLICY.md`
- Reusable migration starter: `supabase/migrations/_template.sql`
- The audit that motivated this: see commit message of
  `0021_explicit_grants_legacy_cohort.sql`
