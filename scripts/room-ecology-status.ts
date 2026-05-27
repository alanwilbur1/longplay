/**
 * scripts/room-ecology-status.ts — Phase 6A.11
 *
 * Reports the Layer 7 ecology + adjacency state across the rooms
 * catalog.
 *   - Total ecology snapshot rows + distinct rooms
 *   - Latest snapshot timestamp per room
 *   - Algorithm-version distribution
 *   - Adjacency: total pairs + band distribution
 *
 * Usage:
 *   tsx scripts/room-ecology-status.ts
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

  console.log('\n── room ecology status (Phase 6A.11) ──\n')

  // Ecology snapshots
  const { count: ecoTotal } = await db
    .from('room_ecology_snapshots')
    .select('id', { count: 'exact', head: true })
  console.log(`  total ecology snapshots:        ${ecoTotal ?? 0}`)

  const { data: ecoSample } = await db
    .from('room_ecology_snapshots')
    .select('room_id, snapshot_at, algorithm_version, active_listener_count')
    .order('snapshot_at', { ascending: false })
    .limit(2000)

  const roomsWithSnapshot = new Set<string>()
  const byVersion = new Map<string, number>()
  let activeSum = 0
  for (const row of (ecoSample ?? []) as Array<{
    room_id: string
    snapshot_at: string
    algorithm_version: string
    active_listener_count: number
  }>) {
    roomsWithSnapshot.add(row.room_id)
    byVersion.set(
      row.algorithm_version,
      (byVersion.get(row.algorithm_version) ?? 0) + 1,
    )
    activeSum += row.active_listener_count
  }
  console.log(`  distinct rooms covered (sample): ${roomsWithSnapshot.size}`)
  console.log(
    `  active listener count (sample sum): ${activeSum}`,
  )

  if (byVersion.size > 0) {
    console.log(`\n  algorithm_version distribution:`)
    for (const [ver, count] of [...byVersion.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${ver}: ${count} snapshots`)
    }
  }

  // Adjacency
  const { count: adjTotal } = await db
    .from('room_adjacency_scores')
    .select('room_id_a', { count: 'exact', head: true })
  console.log(`\n  total adjacency pairs:          ${adjTotal ?? 0}`)

  const { data: adjSample } = await db
    .from('room_adjacency_scores')
    .select('band, score')
    .order('score', { ascending: false })
    .limit(2000)

  const BANDS = ['aligned', 'overlapping', 'adjacent', 'disjoint']
  const byBand = new Map<string, number>()
  for (const row of (adjSample ?? []) as Array<{ band: string; score: number }>) {
    byBand.set(row.band, (byBand.get(row.band) ?? 0) + 1)
  }
  console.log(`\n  adjacency band distribution:`)
  for (const b of BANDS) {
    console.log(`    ${b.padEnd(12)}  ${byBand.get(b) ?? 0}`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('room-ecology-status failed:', err)
  process.exit(1)
})
