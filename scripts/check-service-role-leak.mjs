#!/usr/bin/env node
/**
 * Build guardrail: fails if any file outside the admin client imports
 * the service-role key. Run via `pnpm guard:service-role`.
 *
 * This is a defense-in-depth measure on top of Next's bundle-time
 * server-only enforcement: the grep also catches accidental references
 * in scripts, route handlers, and config that wouldn't bundle but
 * could still leak.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const ALLOWLIST = new Set([
  'lib/supabase/admin.ts',
  'scripts/check-service-role-leak.mjs',
  'scripts/seed-phase2.ts',
])

const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  '.turbo',
  'dist',
  'build',
  '.vercel',
  '.supabase',
])

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...walk(full))
    } else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full)
    }
  }
  return out
}

const offenders = []
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file)
  if (ALLOWLIST.has(rel)) continue
  const contents = readFileSync(file, 'utf8')
  if (contents.includes('SUPABASE_SERVICE_ROLE_KEY')) {
    offenders.push(rel)
  }
}

if (offenders.length > 0) {
  console.error(
    'Service-role key reference found outside the admin client:\n' +
      offenders.map((f) => `  - ${f}`).join('\n'),
  )
  process.exit(1)
}

console.log('OK: service-role key only referenced inside lib/supabase/admin.ts (+ allowed scripts)')
