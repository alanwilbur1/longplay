/**
 * scripts/refresh-room-metadata.ts
 *
 * Surgical room-metadata refresh. Updates the v2.1-recommender-
 * relevant columns on existing rooms by slug, without touching
 * cycles, prompts, essays, memberships, or any other relation.
 *
 * Safe to run repeatedly. Idempotent. Lower blast radius than the
 * full `seed-phase2.ts` pass.
 *
 * Use this when:
 *   - You've edited the ROOM_TAXONOMY overlay or lib/rooms.ts and
 *     want the changes to propagate to existing prod/preview rows
 *     without re-running the entire seed.
 *   - You suspect taxonomy drift between code and DB.
 *
 * Use the full seed-phase2.ts when:
 *   - You've ADDED a new room (refresh-room-metadata won't insert it
 *     — it intentionally only updates existing rows by slug).
 *   - You need cycles/prompts/essays/curator-essays linked.
 *
 * Usage:
 *   tsx scripts/refresh-room-metadata.ts          # apply
 *   tsx scripts/refresh-room-metadata.ts --dry    # report only, no writes
 *
 * Required env:
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import WS from 'ws'
import { ALL_ROOMS } from '../lib/rooms'

// ── Inline the same RoomTaxonomyOverlay shape + ROOM_TAXONOMY map
// that seed-phase2.ts uses. Keeping these in sync is a known
// duplication we tolerate so this script can run standalone without
// pulling in the much heavier seed module.

interface RoomTaxonomyOverlay {
  description?: string
  genres: string[]
  moods: string[]
  energy_level: 'low' | 'medium' | 'high'
  cadence: 'weekly' | 'biweekly' | 'monthly' | 'seasonal' | 'ongoing'
  featured?: boolean
  recommendation_weight?: number
}

// Copied from scripts/seed-phase2.ts. If that file's ROOM_TAXONOMY
// changes, mirror it here too. See the comment at the top of seed-
// phase2.ts for the rule (lowercase + space-separated, no hyphens,
// mood-shaped values in moods not genres).
const ROOM_TAXONOMY: Record<string, RoomTaxonomyOverlay> = {
  'nocturnal-room': {
    genres: ['indie', 'indie rock', 'indie folk', 'electronic', 'ambient'],
    moods: ['late-night', 'nocturnal', 'intimate', 'reflective', 'album-listener'],
    energy_level: 'low', cadence: 'weekly', featured: true, recommendation_weight: 75,
  },
  'analog-futures': {
    genres: ['electronic', 'ambient electronic', 'ambient', 'post-rock', 'experimental'],
    moods: ['textural', 'patient', 'experimental', 'cinematic', 'electronic'],
    energy_level: 'medium', cadence: 'weekly', featured: true, recommendation_weight: 70,
  },
  'cathedral-hour': {
    genres: ['ambient', 'modern classical', 'orchestral', 'spiritual'],
    moods: ['expansive', 'spiritual', 'meditative', 'patient', 'ambient', 'album-listener'],
    energy_level: 'low', cadence: 'weekly', featured: false, recommendation_weight: 65,
  },
  'beautiful-damage': {
    genres: ['indie', 'indie folk', 'indie rock', 'chamber folk', 'folk'],
    moods: ['intimate', 'confessional', 'reflective', 'catharsis', 'singer-songwriter', 'album-listener'],
    energy_level: 'low', cadence: 'weekly', featured: true, recommendation_weight: 72,
  },
  'records-for-rain': {
    genres: ['folk', 'indie folk', 'chamber folk', 'jazz', 'ambient', 'indie'],
    moods: ['quiet', 'soft', 'patient', 'meditative', 'ambient', 'jazz', 'indie', 'album-listener'],
    energy_level: 'low', cadence: 'biweekly', featured: false, recommendation_weight: 60,
  },
  'warm-static': {
    genres: ['rock', 'pop', 'art pop', 'soul', 'indie rock'],
    moods: ['warm', 'analog', 'singer-songwriter'],
    energy_level: 'medium', cadence: 'weekly', featured: false, recommendation_weight: 55,
  },
  'spiritual-jazz': {
    genres: ['jazz', 'spiritual jazz', 'modal', 'free jazz'],
    moods: ['spiritual', 'expansive', 'meditative', 'jazz', 'album-listener'],
    energy_level: 'medium', cadence: 'weekly', featured: false, recommendation_weight: 58,
  },
  'criterion-listening': {
    genres: ['soundtrack', 'orchestral', 'modern classical', 'ambient'],
    moods: ['cinematic', 'atmospheric', 'reflective', 'score', 'album-listener'],
    energy_level: 'medium', cadence: 'biweekly', featured: false, recommendation_weight: 60,
  },
  'pitchfork-deep-cuts': {
    genres: ['indie', 'indie rock', 'indie pop', 'art pop', 'electronic', 'experimental'],
    moods: ['restless', 'cinematic', 'textural'],
    energy_level: 'medium', cadence: 'weekly', featured: true, recommendation_weight: 68,
  },
  'hip-hop-hours': {
    genres: ['hip hop', 'rap', 'conscious hip hop', 'jazz rap'],
    moods: ['intimate', 'confessional', 'cinematic', 'hip-hop', 'album-listener'],
    energy_level: 'medium', cadence: 'weekly', featured: false, recommendation_weight: 65,
  },
  'southern-listening': {
    genres: ['country', 'americana', 'alt-country', 'folk'],
    moods: ['warm', 'singer-songwriter', 'reflective', 'country', 'nocturnal', 'album-listener'],
    energy_level: 'medium', cadence: 'weekly', featured: false, recommendation_weight: 60,
  },
  'soul-quarters': {
    genres: ['soul', 'r&b', 'neo soul', 'jazz soul'],
    moods: ['warm', 'intimate', 'communal', 'reflective', 'album-listener'],
    energy_level: 'medium', cadence: 'weekly', featured: false, recommendation_weight: 63,
  },
}

interface UpdatePayload {
  genres: string[]
  moods: string[]
  energy_level: 'low' | 'medium' | 'high'
  cadence: 'weekly' | 'biweekly' | 'monthly' | 'seasonal' | 'ongoing'
  featured: boolean
  recommendation_weight: number
  tagline: string | null
  cover_art: string | null
}

function payloadForRoom(slug: string): UpdatePayload | null {
  const tax = ROOM_TAXONOMY[slug]
  if (!tax) return null
  const room = ALL_ROOMS.find((r) => r.slug === slug)
  if (!room) return null
  const cover =
    room.currentAlbum?.cover && room.currentAlbum.cover.length > 0
      ? room.currentAlbum.cover
      : null
  return {
    genres: tax.genres,
    moods: tax.moods,
    energy_level: tax.energy_level,
    cadence: tax.cadence,
    featured: tax.featured ?? false,
    recommendation_weight: tax.recommendation_weight ?? 50,
    tagline: room.tagline ?? null,
    cover_art: cover,
  }
}

interface ExistingRow {
  id: string
  slug: string
  genres: string[] | null
  moods: string[] | null
  energy_level: string | null
  cadence: string | null
  featured: boolean | null
  recommendation_weight: number | null
  tagline: string | null
  cover_art: string | null
}

function diffSummary(before: ExistingRow, after: UpdatePayload): string[] {
  const changes: string[] = []
  const beforeGenres = (before.genres ?? []).join(',')
  const afterGenres = after.genres.join(',')
  if (beforeGenres !== afterGenres) {
    changes.push(`genres: [${beforeGenres}] → [${afterGenres}]`)
  }
  const beforeMoods = (before.moods ?? []).join(',')
  const afterMoods = after.moods.join(',')
  if (beforeMoods !== afterMoods) {
    changes.push(`moods: [${beforeMoods}] → [${afterMoods}]`)
  }
  if (before.energy_level !== after.energy_level) {
    changes.push(`energy_level: ${before.energy_level ?? 'null'} → ${after.energy_level}`)
  }
  if (before.cadence !== after.cadence) {
    changes.push(`cadence: ${before.cadence ?? 'null'} → ${after.cadence}`)
  }
  if ((before.featured ?? false) !== after.featured) {
    changes.push(`featured: ${before.featured ?? false} → ${after.featured}`)
  }
  if ((before.recommendation_weight ?? 50) !== after.recommendation_weight) {
    changes.push(
      `recommendation_weight: ${before.recommendation_weight ?? 50} → ${after.recommendation_weight}`,
    )
  }
  if ((before.tagline ?? null) !== after.tagline) {
    changes.push(`tagline: ${truncate(before.tagline ?? 'null')} → ${truncate(after.tagline ?? 'null')}`)
  }
  if ((before.cover_art ?? null) !== after.cover_art) {
    changes.push(`cover_art: ${truncate(before.cover_art ?? 'null', 30)} → ${truncate(after.cover_art ?? 'null', 30)}`)
  }
  return changes
}

function truncate(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

async function main() {
  const dryRun = process.argv.includes('--dry') || process.argv.includes('--dry-run')
  // Default-deny: never write a `cover_art = null` over an existing
  // non-null DB value. Operator can override with --allow-null-cover
  // (e.g. when intentionally retiring a cover). Protects against the
  // common case where lib/albums.ts temporarily clears a cover to ""
  // and the next refresh would silently NULL the DB column even
  // though no artwork triage has happened yet.
  const allowNullCover = process.argv.includes('--allow-null-cover')

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }
  // Node 20 ships without a global WebSocket implementation. supabase-js
  // v2 constructs its realtime sub-client at createClient() time and the
  // realtime client errors out ("Node.js 20 detected without native
  // WebSocket support") even when no .subscribe() is ever called. This
  // script only ever does REST reads + updates, but we still need to
  // satisfy that check. Two layers of defence:
  //
  //   1. Polyfill globalThis.WebSocket from the `ws` package — same
  //      pattern as scripts/seed-phase2.ts.
  //   2. Also pass `realtime.transport` explicitly so the realtime
  //      sub-client picks ws when it instantiates, regardless of
  //      whatever its internal feature-detection does.
  //
  // Either alone would likely be enough; doing both means the script
  // works under Node 18/20/22 without further fiddling.
  if (typeof globalThis.WebSocket === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).WebSocket = WS
  }

  const db = createClient(url, key, {
    auth: { persistSession: false },
    realtime: {
      // `ws`'s default export is the WebSocket constructor — shape-
      // compatible with the browser WebSocket type that supabase-js
      // expects. Cast is necessary because the types differ on
      // peripheral fields we never use.
      transport: WS as unknown as typeof WebSocket,
    },
  })

  console.log(`\n── refresh-room-metadata${dryRun ? ' (DRY RUN — no writes)' : ''} ──\n`)

  // Pull existing rows for the slugs we know about. RLS is bypassed
  // via service role; we read only the columns we'll diff against.
  const slugs = Object.keys(ROOM_TAXONOMY)
  const { data: existing, error: readErr } = await db
    .from('rooms')
    .select(
      'id, slug, genres, moods, energy_level, cadence, featured, recommendation_weight, tagline, cover_art',
    )
    .in('slug', slugs)
  if (readErr) {
    console.error('Read failed:', readErr.message)
    process.exit(1)
  }
  const existingBySlug = new Map<string, ExistingRow>()
  for (const row of (existing ?? []) as unknown as ExistingRow[]) {
    existingBySlug.set(row.slug, row)
  }

  let updated = 0
  let unchanged = 0
  let missing = 0
  let failed = 0

  for (const slug of slugs) {
    const target = payloadForRoom(slug)
    if (!target) {
      console.log(`  ! ${slug}: no taxonomy / room definition`)
      failed += 1
      continue
    }
    const existingRow = existingBySlug.get(slug)
    if (!existingRow) {
      console.log(`  ✗ ${slug}: ROW MISSING in DB. Run \`tsx scripts/seed-phase2.ts\` to create.`)
      missing += 1
      continue
    }
    const changes = diffSummary(existingRow, target)
    // Cover_art downgrade guard: refuse to write null over an
    // existing non-null DB value unless --allow-null-cover. We
    // detect this by inspecting the raw fields rather than parsing
    // the diff strings.
    const wouldDowngradeCover =
      target.cover_art === null && (existingRow.cover_art ?? null) !== null
    const blockCoverDowngrade = wouldDowngradeCover && !allowNullCover

    // If the ONLY change is the blocked cover downgrade, there's
    // nothing else to write — treat as unchanged but log the block.
    const nonCoverChanges = changes.filter((c) => !c.startsWith('cover_art:'))
    if (changes.length === 0) {
      console.log(`  · ${slug}: no changes`)
      unchanged += 1
      continue
    }
    if (blockCoverDowngrade && nonCoverChanges.length === 0) {
      console.log(
        `  · ${slug}: cover_art downgrade blocked (pass --allow-null-cover to override); no other changes`,
      )
      unchanged += 1
      continue
    }

    console.log(`  ${dryRun ? '?' : '→'} ${slug}`)
    for (const change of changes) {
      const isBlocked = blockCoverDowngrade && change.startsWith('cover_art:')
      console.log(
        `      ${change}${isBlocked ? '   ⊘ blocked by default — pass --allow-null-cover' : ''}`,
      )
    }

    if (dryRun) {
      updated += 1
      continue
    }

    // Build the actual UPDATE payload. Conditionally omit cover_art
    // when the downgrade guard fires — leaves the existing DB value
    // intact; every other field still gets refreshed.
    const updatePayload: Partial<UpdatePayload> = {
      genres: target.genres,
      moods: target.moods,
      energy_level: target.energy_level,
      cadence: target.cadence,
      featured: target.featured,
      recommendation_weight: target.recommendation_weight,
      tagline: target.tagline,
    }
    if (!blockCoverDowngrade) {
      updatePayload.cover_art = target.cover_art
    }

    const { error: updErr } = await db
      .from('rooms')
      .update(updatePayload)
      .eq('slug', slug)
    if (updErr) {
      console.log(`      ! update failed: ${updErr.message}`)
      failed += 1
    } else {
      updated += 1
    }
  }

  console.log(
    `\n── ${dryRun ? 'would update' : 'updated'} ${updated} · unchanged ${unchanged} · missing ${missing} · failed ${failed} ──`,
  )
  if (missing > 0) {
    console.log(
      '\nMissing rooms need the full seed (creates cycles + curator essays).',
    )
    console.log('Run: tsx scripts/seed-phase2.ts')
  }
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('refresh-room-metadata failed:', err)
  process.exit(1)
})
