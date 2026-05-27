/**
 * scripts/identity-history-status.ts — Phase 6A.9
 *
 * Reports the Layer 5 history state across users:
 *   - Total history rows + distinct users
 *   - Algorithm version distribution
 *   - Archetype transition count (rows where the previous primary
 *     archetype was different)
 *   - Recent appends (last 24h, last 7d)
 *
 * Usage:
 *   tsx scripts/identity-history-status.ts
 *
 * Required env:
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
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

  console.log('\n── identity history status (Layer 5 / Phase 6A.9) ──\n')

  const { count: totalRows } = await db
    .from('listener_identity_history')
    .select('id', { count: 'exact', head: true })
  console.log(`  total history rows:           ${totalRows ?? 0}`)

  // Distinct users (sampled).
  const { data: sample } = await db
    .from('listener_identity_history')
    .select('user_id, algorithm_version, snapshot_at, drift_summary')
    .order('snapshot_at', { ascending: false })
    .limit(2000)
  const byUser = new Set<string>()
  const byVersion = new Map<string, number>()
  let archetypeTransitionCount = 0
  let driftSummaryCount = 0
  for (const row of (sample ?? []) as Array<{
    user_id: string
    algorithm_version: string
    snapshot_at: string
    drift_summary: unknown
  }>) {
    byUser.add(row.user_id)
    byVersion.set(
      row.algorithm_version,
      (byVersion.get(row.algorithm_version) ?? 0) + 1,
    )
    const drift = row.drift_summary as
      | { archetype_transition?: unknown }
      | null
    if (drift && drift.archetype_transition) archetypeTransitionCount += 1
    if (drift) driftSummaryCount += 1
  }
  console.log(`  distinct users (sample):      ${byUser.size}`)
  console.log(`  rows with drift_summary:      ${driftSummaryCount}`)
  console.log(`  rows recording transition:    ${archetypeTransitionCount}`)

  if (byVersion.size > 0) {
    console.log(`\n  algorithm_version distribution:`)
    for (const [ver, count] of [...byVersion.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${ver}: ${count} rows`)
    }
  }

  // Append cadence — last 24h / 7d.
  const now = Date.now()
  const oneDay = 24 * 60 * 60 * 1000
  const sevenDays = 7 * oneDay
  const { count: last24h } = await db
    .from('listener_identity_history')
    .select('id', { count: 'exact', head: true })
    .gte('snapshot_at', new Date(now - oneDay).toISOString())
  const { count: last7d } = await db
    .from('listener_identity_history')
    .select('id', { count: 'exact', head: true })
    .gte('snapshot_at', new Date(now - sevenDays).toISOString())
  console.log(`\n  appends in last 24h:          ${last24h ?? 0}`)
  console.log(`  appends in last 7d:           ${last7d ?? 0}`)

  process.exit(0)
}

main().catch((err) => {
  console.error('identity-history-status failed:', err)
  process.exit(1)
})
