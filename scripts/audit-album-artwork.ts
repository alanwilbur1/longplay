/**
 * scripts/audit-album-artwork.ts
 *
 * Pure-audit, no mutations. Classifies every album in lib/albums.ts
 * by the shape of its cover URL, optionally HEAD-validating any
 * remote URL to upgrade "plausible-remote" into "verified-remote"
 * or "dead-remote".
 *
 * Buckets:
 *   verified-itunes   Apple Music CDN URL (is*-ssl.mzstatic.com)
 *   plausible-remote  Other remote CDN (mostly i.scdn.co); not
 *                     HEAD-checked unless --check-remote is passed
 *   verified-remote   (with --check-remote) HEAD returned 200 + image/*
 *   dead-remote       (with --check-remote) HEAD failed
 *   placeholder       placehold.co URL
 *   empty             cover === ""
 *
 * Usage:
 *   tsx scripts/audit-album-artwork.ts                # classify-only
 *   tsx scripts/audit-album-artwork.ts --check-remote # HEAD-validate
 *
 * Pairs with:
 *   tsx scripts/resolve-itunes-artwork.ts             # fix empty/placeholder
 *   tsx scripts/resolve-itunes-artwork.ts --validate-existing
 *                                                     # ... plus revalidate live
 */

import { ALBUMS, type Album } from '../lib/albums'

type Bucket =
  | 'verified-itunes'
  | 'plausible-remote'
  | 'verified-remote'
  | 'dead-remote'
  | 'placeholder'
  | 'empty'

interface Entry {
  key: string
  id: string
  title: string
  artist: string
  cover: string
  bucket: Bucket
  status?: number
  reason?: string
}

function classify(cover: string): Bucket {
  if (!cover) return 'empty'
  if (cover.startsWith('https://placehold.co/')) return 'placeholder'
  // Apple Music CDN — the only family we treat as auto-verified by
  // shape because the URLs include the album's iTunes asset ID +
  // detailed path, which can't be cheaply fabricated.
  if (/^https:\/\/is\d?-ssl\.mzstatic\.com\//.test(cover)) return 'verified-itunes'
  return 'plausible-remote'
}

interface HeadResult {
  ok: boolean
  status: number
  reason?: string
}

async function headCheck(url: string, timeoutMs = 5000): Promise<HeadResult> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        Accept: 'image/*',
        'User-Agent': 'LongPlay/1.0 (+https://longplay.app)',
      },
      signal: ctrl.signal,
    })
    const ct = res.headers.get('content-type') ?? ''
    const isImage = ct.startsWith('image/')
    if (!res.ok) return { ok: false, status: res.status, reason: `HTTP ${res.status}` }
    if (!isImage) return { ok: false, status: res.status, reason: `content-type=${ct || 'unknown'}` }
    return { ok: true, status: res.status }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 0, reason: msg.slice(0, 80) }
  } finally {
    clearTimeout(t)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const checkRemote = args.includes('--check-remote')

  const entries: Entry[] = []
  for (const [key, raw] of Object.entries(ALBUMS)) {
    const album = raw as Album
    const cover = album.cover ?? ''
    entries.push({
      key,
      id: album.id,
      title: album.title,
      artist: album.artist,
      cover,
      bucket: classify(cover),
    })
  }

  if (checkRemote) {
    // HEAD-check every remote URL (verified-itunes + plausible-remote
    // + placeholder — even placehold.co can go down, worth checking).
    const toCheck = entries.filter(
      (e) =>
        e.bucket === 'verified-itunes' ||
        e.bucket === 'plausible-remote' ||
        e.bucket === 'placeholder',
    )
    console.log(`Validating ${toCheck.length} remote URLs (concurrency 4)…`)

    let cursor = 0
    const concurrency = 4
    async function worker() {
      while (true) {
        const i = cursor
        cursor += 1
        if (i >= toCheck.length) return
        const entry = toCheck[i]
        const result = await headCheck(entry.cover)
        entry.status = result.status
        if (result.ok) {
          // verified-itunes stays as verified-itunes.
          // plausible-remote graduates to verified-remote.
          // placeholder stays as placeholder (intentional flag).
          if (entry.bucket === 'plausible-remote') entry.bucket = 'verified-remote'
        } else {
          // Promote any failing remote (including 'placeholder') to
          // dead-remote — the operator needs to know if placehold.co
          // is actually serving the placeholder URLs.
          entry.bucket = 'dead-remote'
          entry.reason = result.reason ?? `HTTP ${result.status}`
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
  }

  const counts: Record<Bucket, number> = {
    'verified-itunes': 0,
    'plausible-remote': 0,
    'verified-remote': 0,
    'dead-remote': 0,
    placeholder: 0,
    empty: 0,
  }
  for (const e of entries) counts[e.bucket] += 1

  console.log('\n── Album artwork audit ──\n')
  const buckets: Bucket[] = [
    'verified-itunes',
    'verified-remote',
    'plausible-remote',
    'placeholder',
    'empty',
    'dead-remote',
  ]
  for (const b of buckets) {
    if (counts[b] > 0) {
      console.log(`  ${b.padEnd(20)} ${String(counts[b]).padStart(3)}`)
    }
  }
  console.log('  ' + '─'.repeat(24))
  console.log(`  ${'total'.padEnd(20)} ${String(entries.length).padStart(3)}\n`)

  console.log('Per-album:\n')
  for (const e of entries.sort((a, b) => a.id.localeCompare(b.id))) {
    const cov =
      e.cover.length === 0 ? '∅' : e.cover.slice(0, 60) + (e.cover.length > 60 ? '…' : '')
    const status = e.status !== undefined ? ` [${e.status}]` : ''
    const reason = e.reason ? ` (${e.reason})` : ''
    console.log(`  [${e.bucket.padEnd(18)}] ${e.id.padEnd(30)} ${cov}${status}${reason}`)
  }

  console.log()
  // Albums considered "without verified artwork":
  //   - empty
  //   - dead-remote
  //   - placeholder (placeholder image, not real cover art)
  //   - plausible-remote when --check-remote NOT passed (unverified)
  const missing =
    counts.empty +
    counts['dead-remote'] +
    counts.placeholder +
    (checkRemote ? 0 : counts['plausible-remote'])
  console.log(`Albums without verified artwork: ${missing}`)
  if (!checkRemote && counts['plausible-remote'] > 0) {
    console.log(
      `(${counts['plausible-remote']} plausible-remote URLs are UNVERIFIED — rerun with --check-remote to HEAD-check them)`,
    )
  }
  if (missing > 0) {
    console.log('\nTo source verified covers for the missing ones:')
    console.log('  tsx scripts/resolve-itunes-artwork.ts                # empty + placeholder')
    console.log(
      '  tsx scripts/resolve-itunes-artwork.ts --validate-existing # ... plus revalidate live URLs',
    )
  }
}

main().catch((err) => {
  console.error('audit-album-artwork failed:', err)
  process.exit(1)
})
