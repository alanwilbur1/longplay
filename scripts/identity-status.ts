/**
 * scripts/identity-status.ts — Phase 6A.6
 *
 * Reports the Layer 5 (listener identity) state across the user base.
 * Useful for:
 *   - Verifying the cutover deploy fires recompute writes on next
 *     sync (trait/archetype row counts should climb from 0)
 *   - Spotting algorithm_version drift after a trait/archetype
 *     change (watch v1 → v2 transition)
 *   - Sanity-checking archetype distribution (a healthy population
 *     should have a spread across the catalog — heavy concentration
 *     in one archetype suggests miscalibration)
 *   - Confidence distribution (low average = predicates too narrow;
 *     all 1.0 = predicates too lenient)
 *
 * Usage:
 *   tsx scripts/identity-status.ts
 *
 * Required env:
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Output: counts and distributions. No user-identifying detail beyond
 * UUID prefixes; no tokens.
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

  console.log('\n── listener identity status (Layer 5) ──\n')

  // ── Traits ───────────────────────────────────────────────────────
  const { count: traitsTotal } = await db
    .from('listener_identity_traits')
    .select('user_id', { count: 'exact', head: true })
  console.log(`  total trait rows:     ${traitsTotal ?? 0}`)

  // Distinct users with traits.
  const { data: userSample } = await db
    .from('listener_identity_traits')
    .select('user_id, algorithm_version, computed_at')
    .order('computed_at', { ascending: false })
    .limit(2000)
  const byUser = new Map<
    string,
    { version: string; computed_at: string }
  >()
  for (const row of (userSample ?? []) as Array<{
    user_id: string
    algorithm_version: string
    computed_at: string
  }>) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, {
        version: row.algorithm_version,
        computed_at: row.computed_at,
      })
    }
  }
  console.log(`  distinct users (sample): ${byUser.size}`)

  // algorithm_version distribution.
  const byVersion = new Map<string, number>()
  for (const v of byUser.values()) {
    byVersion.set(v.version, (byVersion.get(v.version) ?? 0) + 1)
  }
  if (byVersion.size > 0) {
    console.log(`  algorithm_version distribution:`)
    for (const [ver, count] of [...byVersion.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${ver}: ${count} users`)
    }
  }

  // ── Archetype distribution ──────────────────────────────────────
  console.log(`\n  primary-archetype distribution (rank=1):`)
  const { data: primary } = await db
    .from('listener_archetype_snapshots')
    .select('archetype_key, archetype_label, confidence_score')
    .eq('rank', 1)
    .limit(2000)
  const byArchetype = new Map<string, { label: string; count: number; sumConfidence: number }>()
  for (const row of (primary ?? []) as Array<{
    archetype_key: string
    archetype_label: string
    confidence_score: number
  }>) {
    const prev = byArchetype.get(row.archetype_key) ?? {
      label: row.archetype_label,
      count: 0,
      sumConfidence: 0,
    }
    prev.count += 1
    prev.sumConfidence += row.confidence_score ?? 0
    byArchetype.set(row.archetype_key, prev)
  }
  if (byArchetype.size === 0) {
    console.log(`    (no primary archetypes — recompute hasn't landed any yet)`)
  } else {
    for (const [key, info] of [...byArchetype.entries()].sort(
      (a, b) => b[1].count - a[1].count,
    )) {
      const meanConf = info.sumConfidence / info.count
      console.log(
        `    ${info.label.padEnd(36)} (${key})  count=${info.count}  mean_confidence=${meanConf.toFixed(2)}`,
      )
    }
  }

  // ── Trait coverage: how many users have non-null score per trait? ─
  console.log(`\n  trait-population coverage (sampled ${userSample?.length ?? 0} rows):`)
  const TRAIT_KEYS = [
    'obscurity_score',
    'exploratory_score',
    'album_focus_score',
    'nocturnal_score',
    'recency_bias_score',
    'genre_breadth_score',
    'consistency_score',
  ]
  for (const tk of TRAIT_KEYS) {
    const { count: nonNull } = await db
      .from('listener_identity_traits')
      .select('user_id', { count: 'exact', head: true })
      .eq('trait_key', tk)
      .not('trait_score', 'is', null)
    const { count: total } = await db
      .from('listener_identity_traits')
      .select('user_id', { count: 'exact', head: true })
      .eq('trait_key', tk)
    console.log(`    ${tk.padEnd(24)}  ${nonNull ?? 0} / ${total ?? 0} with non-null score`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('identity-status failed:', err)
  process.exit(1)
})
