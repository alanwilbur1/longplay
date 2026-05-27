#!/usr/bin/env node
/**
 * scripts/check-migration-policy.mjs — Phase 6A.14.1 guard
 *
 * Enforces the migration policy documented in CLAUDE.md and
 * docs/SCHEMA-POLICY.md. Scans every migration file under
 * supabase/migrations/ numbered ≥ 0021 (older files are the legacy
 * cohort closed by 0021_explicit_grants_legacy_cohort.sql and are
 * not re-checked).
 *
 * For each migration with CREATE TABLE:
 *   - must also contain `ENABLE ROW LEVEL SECURITY`
 *   - must also contain `REVOKE ALL ON ... FROM anon, authenticated`
 *   - must contain at least one `GRANT` statement OR an
 *     `@template:A` marker (Template A legitimately has no GRANT)
 *
 * For migrations without CREATE TABLE:
 *   - either carry an `@template:N/A` marker, OR
 *   - contain no GRANT/REVOKE additions either (accepted as-is).
 *
 * Exits 0 on success, 1 on policy violation.
 *
 * Pure node, no deps. Runs as `npm run guard:migration-policy`.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations')

// Migrations numbered < ENFORCE_FROM are exempt (legacy cohort
// closed by 0021_explicit_grants_legacy_cohort.sql). Files with
// names that don't start with a 4-digit number (e.g. _template.sql)
// are skipped entirely.
const ENFORCE_FROM = 21

const VIOLATIONS = []
const NOTES = []

function recordViolation(file, message) {
  VIOLATIONS.push({ file, message })
}

function recordNote(file, message) {
  NOTES.push({ file, message })
}

function migrationNumber(filename) {
  const m = filename.match(/^(\d{4})_/)
  return m ? parseInt(m[1], 10) : null
}

function checkFile(file) {
  const path = join(MIGRATIONS_DIR, file)
  const src = readFileSync(path, 'utf8')

  // CREATE TABLE detection: case-insensitive, matches both
  // `CREATE TABLE` and `CREATE TABLE IF NOT EXISTS`.
  // Excludes commented-out blocks so the _template.sql examples
  // don't trip the guard.
  const createTableMatches = []
  for (const line of src.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('--')) continue
    const m = trimmed.match(/^\s*CREATE TABLE\s+(IF NOT EXISTS\s+)?([a-z_][a-z0-9_.]*)/i)
    if (m) createTableMatches.push(m[2])
  }

  const hasCreateTable = createTableMatches.length > 0
  const hasEnableRLS = /ENABLE ROW LEVEL SECURITY/i.test(src)
  const hasRevokeAnon = /REVOKE\s+(ALL|SELECT)[\s\S]*?\bFROM\s+[^;]*\b(anon|authenticated)\b/i.test(src)
  const hasGrant = /(^|\n)\s*GRANT\s+/i.test(src)
  const hasTemplateA = /@template:\s*(A|server-only)/i.test(src)
  const hasTemplateNA = /@template:\s*N\/A/i.test(src)

  if (hasCreateTable) {
    if (!hasEnableRLS) {
      recordViolation(
        file,
        `creates ${createTableMatches.length} table(s) [${createTableMatches.join(', ')}] but never calls ENABLE ROW LEVEL SECURITY`,
      )
    }
    if (!hasRevokeAnon) {
      recordViolation(
        file,
        `creates ${createTableMatches.length} table(s) [${createTableMatches.join(', ')}] but never REVOKES from anon/authenticated`,
      )
    }
    if (!hasGrant && !hasTemplateA) {
      recordViolation(
        file,
        `creates ${createTableMatches.length} table(s) [${createTableMatches.join(', ')}] with no GRANT statement and no '-- @template:A' marker. Add explicit grants (Template B/C) or mark the table server-only (Template A).`,
      )
    }
  } else {
    // No CREATE TABLE. Accept either:
    //   - @template:N/A marker, OR
    //   - no grant-related additions at all.
    const hasGrantOrRevoke = /(^|\n)\s*(GRANT|REVOKE)\s+/i.test(src)
    if (!hasTemplateNA && !hasGrantOrRevoke) {
      // Could go either way — accept silently to avoid noise.
      // Migrations that ONLY touch indexes, functions, RLS edits,
      // or data are fine without an explicit marker.
      recordNote(file, 'no CREATE TABLE; consider adding `-- @template:N/A` for clarity')
    }
  }
}

function main() {
  let files
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  } catch (err) {
    console.error(`[migration-policy] cannot read ${MIGRATIONS_DIR}: ${err.message}`)
    process.exit(1)
  }

  // Filter to numbered migrations at or beyond ENFORCE_FROM.
  // _template.sql and other unnumbered files are skipped.
  const enforced = files
    .map((f) => ({ name: f, num: migrationNumber(f) }))
    .filter((m) => m.num !== null && m.num >= ENFORCE_FROM)
    .sort((a, b) => a.num - b.num)

  if (enforced.length === 0) {
    console.log('[migration-policy] no migrations at or beyond enforced floor (0021). nothing to check.')
    process.exit(0)
  }

  console.log(`[migration-policy] checking ${enforced.length} migration(s) (>= 0021):`)
  for (const { name } of enforced) {
    checkFile(name)
    console.log(`  · ${name}`)
  }

  if (NOTES.length > 0) {
    console.log('\n[migration-policy] notes:')
    for (const { file, message } of NOTES) {
      console.log(`  ${file}: ${message}`)
    }
  }

  if (VIOLATIONS.length > 0) {
    console.log('\n[migration-policy] ✗ VIOLATIONS:')
    for (const { file, message } of VIOLATIONS) {
      console.log(`  ${file}: ${message}`)
    }
    console.log(
      `\n[migration-policy] ${VIOLATIONS.length} violation(s). See docs/SCHEMA-POLICY.md.`,
    )
    process.exit(1)
  }

  console.log(`\n[migration-policy] ✓ all ${enforced.length} migration(s) pass`)
  process.exit(0)
}

main()
