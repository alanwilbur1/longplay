/**
 * scripts/affinity-cache-status.ts — Phase 6A.5
 *
 * Reports the Layer 4 cache state across the user base. Useful for:
 *   - Verifying the cutover deploy fires writes on next sync (rows
 *     should climb from 0 over the first hour post-deploy)
 *   - Spotting score_version drift (after a scoring formula change,
 *     watch the new version's row count grow while the old shrinks)
 *   - Identifying users whose cache is stale relative to their
 *     snapshot (snapshot moved but Layer 4 recompute failed)
 *
 * Usage:
 *   tsx scripts/affinity-cache-status.ts
 *
 * Required env:
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Output: counts + (user_id prefix, status) pairs. No tokens, no PII.
 */

import { createClient } from '@supabase/supabase-js'
import WS from 'ws'

async function main() {
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

  console.log('\n── room affinity cache status (Layer 4) ──\n')

  const { count: totalRows } = await db
    .from('room_affinity_scores')
    .select('user_id', { count: 'exact', head: true })
  console.log(`  total cached rows:    ${totalRows ?? 0}`)

  // Distinct users with at least one cached row.
  const { data: users } = await db
    .from('room_affinity_scores')
    .select('user_id, score_version, computed_at, source_snapshot_computed_at')
    .order('computed_at', { ascending: false })
    .limit(500)
  const byUser = new Map<
    string,
    { version: string; computed_at: string; snapshot_at: string | null }
  >()
  for (const row of (users ?? []) as Array<{
    user_id: string
    score_version: string
    computed_at: string
    source_snapshot_computed_at: string | null
  }>) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        version: row.score_version,
        computed_at: row.computed_at,
        snapshot_at: row.source_snapshot_computed_at,
      })
    }
  }
  console.log(`  distinct users (sample): ${byUser.size}`)

  // Version distribution.
  const byVersion = new Map<string, number>()
  for (const v of byUser.values()) {
    byVersion.set(v.version, (byVersion.get(v.version) ?? 0) + 1)
  }
  if (byVersion.size > 0) {
    console.log(`  score_version distribution:`)
    for (const [ver, count] of [...byVersion.entries()].sort((a, b) =>
      b[1] - a[1],
    )) {
      console.log(`    ${ver}: ${count} users`)
    }
  }

  // Snapshot drift: cross-check current snapshot.computed_at per user.
  const userIds = [...byUser.keys()].slice(0, 20)
  if (userIds.length > 0) {
    const { data: snaps } = await db
      .from('listening_profile_snapshots')
      .select('user_id, computed_at')
      .in('user_id', userIds)
    const snapByUser = new Map<string, string>()
    for (const s of (snaps ?? []) as Array<{
      user_id: string
      computed_at: string | null
    }>) {
      if (s.computed_at) snapByUser.set(s.user_id, s.computed_at)
    }
    let drifted = 0
    let inSync = 0
    for (const [uid, info] of byUser) {
      const snapAt = snapByUser.get(uid)
      if (!snapAt) continue
      if (info.snapshot_at && info.snapshot_at !== snapAt) drifted += 1
      else inSync += 1
    }
    console.log(`\n  snapshot-drift (sample of ${userIds.length}):`)
    console.log(`    in sync:  ${inSync}`)
    console.log(`    drifted:  ${drifted}  (cache rebuilt on next sync)`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('affinity-cache-status failed:', err)
  process.exit(1)
})
