/**
 * scripts/invalidate-room-affinities.ts — Phase 6A.5
 *
 * Manual invalidation of Layer 4 cached affinity rows. Run after
 * known significant changes that the version-bump path doesn't
 * catch — e.g. an operator updates a room's genres/moods/featured
 * flag, which doesn't change SCORE_VERSION but does change what
 * the score SHOULD be.
 *
 * Each user whose rows are deleted will get a fresh recompute on
 * their next sync (hourly cron). Until then, the serving path
 * detects the cache as cold (zero rows) and falls back to live
 * scoring — so user-visible behavior never breaks during the gap.
 *
 * Usage:
 *   # Invalidate one room across all users
 *   tsx scripts/invalidate-room-affinities.ts --room=<room-uuid>
 *
 *   # Invalidate one user across all rooms
 *   tsx scripts/invalidate-room-affinities.ts --user=<user-uuid>
 *
 *   # Invalidate everything (use sparingly)
 *   tsx scripts/invalidate-room-affinities.ts --all
 *
 *   # Dry-run shows what would be deleted; pass --write to apply
 *   tsx scripts/invalidate-room-affinities.ts --room=<id>          # dry
 *   tsx scripts/invalidate-room-affinities.ts --room=<id> --write  # apply
 *
 * Required env:
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import WS from 'ws'

function parseArg(name: string): string | null {
  const prefix = `--${name}=`
  const arg = process.argv.find((a) => a.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

async function main() {
  const writeMode = process.argv.includes('--write')
  const all = process.argv.includes('--all')
  const room = parseArg('room')
  const user = parseArg('user')

  if (!all && !room && !user) {
    console.error(
      'Usage: tsx scripts/invalidate-room-affinities.ts --room=<id> | --user=<id> | --all [--write]',
    )
    process.exit(2)
  }
  if (all && (room || user)) {
    console.error('--all is mutually exclusive with --room / --user')
    process.exit(2)
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  if (typeof globalThis.WebSocket === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).WebSocket = WS
  }
  const db = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: WS as unknown as typeof WebSocket },
  })

  const dryRun = !writeMode

  console.log(
    `\n── invalidate-room-affinities${dryRun ? ' (DRY RUN — pass --write to apply)' : ''} ──\n`,
  )

  const target = all
    ? 'ALL rows'
    : room
      ? `room ${room}`
      : `user ${user}`
  console.log(`  target: ${target}`)

  // Build the query — count first (head:true) so we know the blast
  // radius before applying.
  let query = db.from('room_affinity_scores').select('user_id', { count: 'exact', head: true })
  if (room) query = query.eq('room_id', room)
  if (user) query = query.eq('user_id', user)
  const { count, error: countErr } = await query
  if (countErr) {
    console.error('Count failed:', countErr.message)
    process.exit(1)
  }
  console.log(`  rows that would be deleted: ${count ?? 0}`)

  if (dryRun) {
    console.log('\n  Pass --write to actually delete.')
    process.exit(0)
  }

  if ((count ?? 0) === 0) {
    console.log('  Nothing to delete.')
    process.exit(0)
  }

  // Apply.
  let del = db.from('room_affinity_scores').delete()
  if (room) del = del.eq('room_id', room)
  if (user) del = del.eq('user_id', user)
  if (all) {
    // Delete everything. .delete() without a filter is rejected by
    // PostgREST — add a tautological filter so the DELETE applies
    // unambiguously to every row.
    del = del.not('user_id', 'is', null)
  }
  const { error: delErr } = await del
  if (delErr) {
    console.error('Delete failed:', delErr.message)
    process.exit(1)
  }
  console.log(`  ✓ deleted ${count ?? 0} rows`)
  console.log(`  Affected users will get a fresh recompute on their next sync.`)
  process.exit(0)
}

main().catch((err) => {
  console.error('invalidate-room-affinities failed:', err)
  process.exit(1)
})
