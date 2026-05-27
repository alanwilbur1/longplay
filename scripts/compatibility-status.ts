/**
 * scripts/compatibility-status.ts — Phase 6A.10
 *
 * Reports the Layer 6 compatibility cache state across users.
 *   - Total rows + distinct users involved
 *   - Algorithm version distribution
 *   - Band distribution (strong/clear/emerging/adjacent/limited)
 *   - Neighborhood size per user (top 10 by count)
 *
 * Usage:
 *   tsx scripts/compatibility-status.ts
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

  console.log('\n── compatibility cache status (Phase 6A.10) ──\n')

  const { count: total } = await db
    .from('listener_compatibility_scores')
    .select('user_id_a', { count: 'exact', head: true })
  console.log(`  total compatibility rows:    ${total ?? 0}`)

  const { data: sample } = await db
    .from('listener_compatibility_scores')
    .select('user_id_a, user_id_b, score, band, algorithm_version, computed_at')
    .order('computed_at', { ascending: false })
    .limit(5000)

  // Distinct users + neighborhood counts.
  const userCount = new Map<string, number>()
  const byBand = new Map<string, number>()
  const byVersion = new Map<string, number>()
  let scoreSum = 0
  let scoreCount = 0
  for (const r of (sample ?? []) as Array<{
    user_id_a: string
    user_id_b: string
    score: number
    band: string
    algorithm_version: string
  }>) {
    userCount.set(r.user_id_a, (userCount.get(r.user_id_a) ?? 0) + 1)
    userCount.set(r.user_id_b, (userCount.get(r.user_id_b) ?? 0) + 1)
    byBand.set(r.band, (byBand.get(r.band) ?? 0) + 1)
    byVersion.set(
      r.algorithm_version,
      (byVersion.get(r.algorithm_version) ?? 0) + 1,
    )
    if (Number.isFinite(r.score)) {
      scoreSum += r.score
      scoreCount += 1
    }
  }
  console.log(`  distinct users in cache:     ${userCount.size}`)
  if (scoreCount > 0) {
    console.log(`  mean score (sampled):        ${(scoreSum / scoreCount).toFixed(2)}`)
  }

  // Band distribution.
  const BAND_ORDER = ['strong', 'clear', 'emerging', 'adjacent', 'limited']
  console.log(`\n  band distribution:`)
  for (const band of BAND_ORDER) {
    const c = byBand.get(band) ?? 0
    console.log(`    ${band.padEnd(10)}  ${c}`)
  }

  // Version distribution.
  if (byVersion.size > 0) {
    console.log(`\n  algorithm_version distribution:`)
    for (const [ver, count] of [...byVersion.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${ver}: ${count} rows`)
    }
  }

  // Top neighborhoods by row count.
  const topUsers = [...userCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  if (topUsers.length > 0) {
    console.log(`\n  top neighborhoods (by row count):`)
    for (const [uid, count] of topUsers) {
      console.log(`    ${uid.slice(0, 8)}…   ${count} compatibility rows`)
    }
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('compatibility-status failed:', err)
  process.exit(1)
})
