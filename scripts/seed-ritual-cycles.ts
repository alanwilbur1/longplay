/**
 * scripts/seed-ritual-cycles.ts — Phase 6B.2
 *
 * Idempotent seeder. For each room in the DB, ensures three ritual
 * cycles exist:
 *
 *   cycle_number=1 — archived  (last week's ritual; for continuity)
 *   cycle_number=2 — active    (this week)
 *   cycle_number=3 — upcoming  (next week)
 *
 * Album selection priority (no fabrication — skip if all fail):
 *   1. Most-recent legacy `cycles` row for this room → album_id
 *   2. Room.current_album_id (if the rooms table carries one)
 *   3. SKIP the room — log a warning, do not invent an artifact
 *
 * Idempotency
 *   - Rooms with ANY existing ritual_cycles are left alone. Re-run
 *     is a no-op. To re-seed a single room, delete its rows first.
 *   - cycle_number is hard-coded 1/2/3 in this initial seed; future
 *     phases will compute next_cycle_number via MAX(cycle_number)+1.
 *
 * Status realization
 *   - Cycles are persisted as 'upcoming' regardless of clock state;
 *     the transitionRitualCycles() sweep promotes them on the next
 *     cron tick. This keeps the seed pure (no clock-dependent
 *     side-effects) and matches how new cycles are normally created.
 *
 * Run:
 *   npm run seed:ritual-cycles
 *
 * Env required:
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import WS from 'ws'
import { seedWeekWindows } from '../lib/ritual/seed-windows'
import {
  computeCycleStatusForTime,
  shouldRefreshCycleStatus,
} from '../lib/ritual/lifecycle'
import type {
  RitualCycleRow,
  RitualCycleStatus,
} from '../lib/ritual/types'

interface RoomRow {
  id: string
  slug: string
  name: string
  current_cycle_id: string | null
}

interface LegacyCycleRow {
  id: string
  album_id: string
  start_date: string
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[seed-ritual-cycles] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
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

  console.log('\n── ritual cycle seeder (Phase 6B.2) ──\n')

  const { data: rooms, error: roomsErr } = await db
    .from('rooms')
    .select('id, slug, name, current_cycle_id')
  if (roomsErr) {
    console.error(`[seed-ritual-cycles] failed to load rooms: ${roomsErr.message}`)
    process.exit(1)
  }
  const roomList = (rooms ?? []) as unknown as RoomRow[]
  if (roomList.length === 0) {
    console.log('No rooms in DB. Nothing to seed.')
    process.exit(0)
  }

  const windows = seedWeekWindows(new Date())
  console.log('Cycle windows:')
  console.log(`  archived:  ${windows.archived.starts_at} → ${windows.archived.reflection_closes_at}`)
  console.log(`  active:    ${windows.active.starts_at} → ${windows.active.reflection_closes_at}`)
  console.log(`  upcoming:  ${windows.upcoming.starts_at} → ${windows.upcoming.reflection_closes_at}`)
  console.log('')

  let seeded = 0
  let skipped = 0
  let errored = 0

  for (const room of roomList) {
    // Skip rooms that already have any ritual_cycles.
    const { count: existingCount, error: existingErr } = await db
      .from('ritual_cycles')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', room.id)
    if (existingErr) {
      console.warn(`  ✗ ${room.slug}: failed to check existing — ${existingErr.message}`)
      errored += 1
      continue
    }
    if ((existingCount ?? 0) > 0) {
      console.log(`  · ${room.slug}: already has ${existingCount} cycle(s); skipping`)
      skipped += 1
      continue
    }

    // Find an album. Try legacy cycles first.
    const { data: legacyCycle, error: legacyErr } = await db
      .from('cycles')
      .select('id, album_id, start_date')
      .eq('room_id', room.id)
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (legacyErr) {
      console.warn(`  ✗ ${room.slug}: legacy cycle lookup failed — ${legacyErr.message}`)
      errored += 1
      continue
    }

    const album_id = (legacyCycle as LegacyCycleRow | null)?.album_id ?? null
    const legacy_cycle_id = (legacyCycle as LegacyCycleRow | null)?.id ?? null

    if (!album_id) {
      console.warn(
        `  · ${room.slug}: no album found (no legacy cycle); skipping rather than fabricating`,
      )
      skipped += 1
      continue
    }

    // Insert three rows in one batch. Status is REALIZED at insert
    // via computeCycleStatusForTime so the rooms render correctly
    // without waiting for the cron sweep to tick — that's the bug
    // the previous "always insert as upcoming" pattern hit when the
    // sweep cron was disabled or capped. The trailing
    // transitionRitualCycles() sweep below also fixes any rooms
    // that were skipped here for already having cycles.
    const now = new Date()
    const realize = (w: typeof windows.archived): RitualCycleStatus =>
      computeCycleStatusForTime(w, now)
    const rows = [
      {
        room_id: room.id,
        artifact_album_id: album_id,
        legacy_cycle_id,
        ritual_type: 'album_ritual',
        cycle_number: 1,
        starts_at: windows.archived.starts_at,
        lock_at: windows.archived.lock_at,
        reflection_opens_at: windows.archived.reflection_opens_at,
        reflection_closes_at: windows.archived.reflection_closes_at,
        cycle_status: realize(windows.archived),
      },
      {
        room_id: room.id,
        artifact_album_id: album_id,
        legacy_cycle_id,
        ritual_type: 'album_ritual',
        cycle_number: 2,
        starts_at: windows.active.starts_at,
        lock_at: windows.active.lock_at,
        reflection_opens_at: windows.active.reflection_opens_at,
        reflection_closes_at: windows.active.reflection_closes_at,
        cycle_status: realize(windows.active),
      },
      {
        room_id: room.id,
        artifact_album_id: album_id,
        legacy_cycle_id,
        ritual_type: 'album_ritual',
        cycle_number: 3,
        starts_at: windows.upcoming.starts_at,
        lock_at: windows.upcoming.lock_at,
        reflection_opens_at: windows.upcoming.reflection_opens_at,
        reflection_closes_at: windows.upcoming.reflection_closes_at,
        cycle_status: realize(windows.upcoming),
      },
    ]

    const { error: insertErr } = await db.from('ritual_cycles').insert(rows)
    if (insertErr) {
      console.warn(
        `  ✗ ${room.slug}: insert failed — code=${insertErr.code} ${insertErr.message}`,
      )
      errored += 1
      continue
    }
    console.log(`  ✓ ${room.slug}: seeded 3 cycles (archived/active/upcoming) album=${album_id.slice(0, 8)}…`)
    seeded += 1
  }

  console.log('')
  console.log(`── result: ${seeded} seeded · ${skipped} skipped · ${errored} errored ──`)

  // Trailing sweep. Idempotent. Two important jobs:
  //   1. For rooms inserted ABOVE with realized statuses, this is a
  //      no-op (the persisted status already matches the clock).
  //   2. For rooms SKIPPED above (already had cycles from an older
  //      seed that wrote everything as 'upcoming'), this is the only
  //      thing that brings them up to date — without it, the
  //      operator would have to hit /api/cron/ritual-transitions
  //      manually, and if their plan can't enable that cron entry,
  //      the rooms would render the "No ritual" empty state
  //      indefinitely. The sweep fixes them in-band here.
  //
  // Logic is duplicated from lib/ritual/cycles.ts:transitionRitualCycles
  // because that module imports 'server-only' (a Next.js boundary
  // package that isn't resolvable from tsx scripts). Keep the
  // two implementations in lock-step — both consult the same
  // lib/ritual/lifecycle.ts pure helpers.
  console.log('')
  console.log('Running lifecycle sweep to align statuses on existing rooms…')
  await sweepCycleStatuses(db, new Date())
  console.log('')
  process.exit(0)
}

async function sweepCycleStatuses(
  db: SupabaseClient,
  now: Date,
): Promise<void> {
  const { data, error } = await db
    .from('ritual_cycles')
    .select(
      'id, room_id, artifact_album_id, legacy_cycle_id, ritual_type, cycle_number, starts_at, lock_at, reflection_opens_at, reflection_closes_at, archived_at, cycle_status, created_at, updated_at',
    )
    .in('cycle_status', ['upcoming', 'active', 'reflection'])
    .order('room_id', { ascending: true })
  if (error) {
    console.warn(`  sweep select failed: ${error.message}`)
    return
  }
  const cycles = (data ?? []) as unknown as RitualCycleRow[]

  // Two-pass: archive first, then promote — the partial unique
  // index uq_ritual_cycles_room_live rejects two live cycles in the
  // same room.
  const toArchive: RitualCycleRow[] = []
  const toAdvance: Array<{ cycle: RitualCycleRow; target: RitualCycleStatus }> = []
  for (const cycle of cycles) {
    if (
      !shouldRefreshCycleStatus(
        cycle.cycle_status,
        cycle.archived_at,
        cycle,
        now,
      )
    )
      continue
    const derived = computeCycleStatusForTime(cycle, now)
    if (derived === 'archived') toArchive.push(cycle)
    else toAdvance.push({ cycle, target: derived })
  }

  let archived = 0
  let advanced = 0
  let errors = 0
  for (const cycle of toArchive) {
    const { error: archErr } = await db
      .from('ritual_cycles')
      .update({
        cycle_status: 'archived',
        archived_at: cycle.archived_at ?? now.toISOString(),
      })
      .eq('id', cycle.id)
    if (archErr) {
      console.warn(
        `  ✗ archive ${cycle.id} failed: code=${archErr.code} ${archErr.message}`,
      )
      errors += 1
      continue
    }
    archived += 1
  }
  for (const { cycle, target } of toAdvance) {
    const { error: advErr } = await db
      .from('ritual_cycles')
      .update({ cycle_status: target })
      .eq('id', cycle.id)
    if (advErr) {
      console.warn(
        `  ✗ advance ${cycle.id} → ${target} failed: code=${advErr.code} ${advErr.message}`,
      )
      errors += 1
      continue
    }
    advanced += 1
  }
  console.log(
    `  swept ${cycles.length} cycles · ${advanced} advanced · ${archived} archived · ${errors} errors`,
  )
}

main().catch((err) => {
  console.error('[seed-ritual-cycles] fatal:', err)
  process.exit(1)
})
