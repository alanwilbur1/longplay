/**
 * scripts/snapshot-migration-status.ts — Phase 6A.4
 *
 * Reports the Layer 2 cutover progress. listening_profile_snapshots
 * gained an algorithm_version column in migration 0014. After
 * deploying Phase 6A.4, the next sync per user recomputes the
 * snapshot via the new Layer-2-backed path and stamps the row with
 * algorithm_version='v2'. Old rows stay NULL until their user
 * syncs (hourly cron picks them up).
 *
 * Use this to:
 *   - Verify the cutover deploy actually fires writes on the next
 *     sync (look for v2 count climbing over the first hour)
 *   - Identify users whose snapshots are stale (always NULL =
 *     never synced post-cutover; could be dead Spotify connections)
 *
 * Usage:
 *   tsx scripts/snapshot-migration-status.ts
 *
 * Required env:
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Output is operator-safe — only counts and user_id UUIDs (no PII,
 * no email, no tokens).
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

  console.log('\n── snapshot migration status (Phase 6A.4 → Layer 2) ──\n')

  const { count: total } = await db
    .from('listening_profile_snapshots')
    .select('user_id', { count: 'exact', head: true })

  const { count: v2 } = await db
    .from('listening_profile_snapshots')
    .select('user_id', { count: 'exact', head: true })
    .eq('algorithm_version', 'v2')

  const totalCount = total ?? 0
  const v2Count = v2 ?? 0
  const legacyCount = totalCount - v2Count
  const pct = totalCount > 0 ? Math.round((v2Count / totalCount) * 100) : 0

  console.log(`  total snapshots:       ${totalCount}`)
  console.log(`  v2 (Layer 2-backed):   ${v2Count}  (${pct}%)`)
  console.log(`  v1 / NULL (legacy):    ${legacyCount}`)

  if (legacyCount > 0) {
    const { data: stragglers } = await db
      .from('listening_profile_snapshots')
      .select('user_id, computed_at')
      .or('algorithm_version.is.null,algorithm_version.neq.v2')
      .order('computed_at', { ascending: true })
      .limit(10)
    console.log(`\n  oldest legacy snapshots (top 10):`)
    for (const row of (stragglers ?? []) as Array<{
      user_id: string
      computed_at: string | null
    }>) {
      console.log(`    ${row.user_id.slice(0, 8)}…  ${row.computed_at ?? '(never)'}`)
    }
    console.log(`\n  These will migrate on each user's next sync (hourly cron).`)
    console.log(`  Force-migrate one manually:`)
    console.log(`    tsx -e "import {recomputeListenerGraph} from './lib/streaming/listener-graph'; import {recomputeListeningProfileSnapshot} from './lib/streaming/sync'; (async () => { await recomputeListenerGraph('<user-id>'); await recomputeListeningProfileSnapshot('<user-id>'); })()"`)
  } else if (totalCount > 0) {
    console.log(`\n  ✓ All snapshots are on the v2 (Layer 2) algorithm.`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('snapshot-migration-status failed:', err)
  process.exit(1)
})
