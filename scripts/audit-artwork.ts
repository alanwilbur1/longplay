/**
 * scripts/audit-artwork.ts
 *
 * Global album-artwork audit. Runs three orthogonal checks and
 * exits non-zero if any of them flag issues:
 *
 *   A. RAW IMAGE TAG audit
 *      Greps app/ + components/ for any `<img>` or `<Image>`
 *      (next/image) tag whose src appears to be album artwork
 *      (heuristic: references `ALBUMS.`, `.cover`, `cover_art`,
 *      `coverArt`, or `Album` types). Any such tag outside
 *      components/album-cover.tsx is a violation — all album art
 *      must flow through the shared AlbumCover/AlbumThumb
 *      components so the bulletproof rendering invariants
 *      (no broken-icon, no alt-text leak, designed fallback)
 *      apply uniformly.
 *
 *   B. ALBUM ARTWORK COVERAGE audit
 *      Walks lib/albums.ts and classifies every album by the
 *      shape of its `cover` URL. Albums with `cover: ""` (empty)
 *      or `placehold.co` URLs are violations unless their `id`
 *      is in ALBUM_ARTWORK_ALLOWLIST. The allowlist is intentional
 *      — albums we know we don't have art for yet and that the
 *      designed fallback covers.
 *
 *   C. REMOTE URL HEALTH audit (optional, gated by --check-remote)
 *      HEAD-validates every remote cover URL. Albums whose URL is
 *      live but returns non-2xx or non-image/* are violations.
 *
 * Usage:
 *   tsx scripts/audit-artwork.ts                  # A + B only
 *   tsx scripts/audit-artwork.ts --check-remote   # A + B + C
 *
 * Wired as `npm run audit:artwork` in package.json. Default mode
 * (no flags) is fast enough for CI / pre-commit and doesn't make
 * network calls. --check-remote is for periodic deeper checks.
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { ALBUMS, type Album } from '../lib/albums'

const ROOT = process.cwd()
const ALLOWED_FILES_FOR_RAW_IMG = new Set([
  // The shared component itself uses no raw <img> as of the bulletproof
  // rewrite — but if a contributor adds one, it must be inside
  // album-cover.tsx, not anywhere else.
  'components/album-cover.tsx',
])
const ALLOWED_FILES_FOR_NEXT_IMAGE = new Set([
  // next/image is allowed for user avatars and generic photography.
  // These files contain only non-album-art Image usages. If a new
  // <Image> for album art appears here, the heuristic will catch it.
  // (Listed for documentation; not actually enforced — the heuristic
  // does the work.)
])

/**
 * Albums we knowingly don't have artwork for. The designed fallback
 * (vinyl glyph + title + artist) is the intentional long-term
 * presentation. Audit passes for these even with empty `cover`.
 *
 * KEEP THIS LIST EMPTY by default. Only add a slug when we've
 * decided to ship without artwork for it. Every entry is a
 * commitment to the fallback being the right call for that album.
 */
const ALBUM_ARTWORK_ALLOWLIST: ReadonlySet<string> = new Set<string>([])

interface Violation {
  bucket: 'raw-img' | 'next-image-album' | 'no-cover' | 'placeholder' | 'dead-remote'
  file?: string
  line?: number
  detail: string
}

// ── A. Raw image tag audit ───────────────────────────────────────────

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      listSourceFiles(full, acc)
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

/**
 * Heuristic: does the line look like it's rendering album art?
 * True if the surrounding context (the line itself plus a small
 * lookahead window) references known album-shaped identifiers.
 */
function looksLikeAlbumArt(window: string): boolean {
  const albumRefs = [
    /\bALBUMS\b/,                       // import { ALBUMS } from '@/lib/albums'
    /\.cover\b(?!_art)/,                 // album.cover (but not cover_art prop name)
    /\bcoverArt\b/,                       // room.coverArt
    /\bcover_art\b/,                      // db column passthrough
    /\b(?:album|track)\.(?:cover|artworkUrl)\b/,
    /\bartworkUrl\d+\b/,                  // iTunes
    /\bappleMusicUrl\b/,
    /\bspotifyId\b/,                      // weak signal but indicative
  ]
  return albumRefs.some((re) => re.test(window))
}

function auditRawImages(files: string[]): Violation[] {
  const violations: Violation[] = []
  for (const file of files) {
    const rel = file.startsWith(ROOT + '/') ? file.slice(ROOT.length + 1) : file
    if (ALLOWED_FILES_FOR_RAW_IMG.has(rel)) continue
    const src = readFileSync(file, 'utf-8')
    const lines = src.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Skip comment lines and string-only lines (heuristic: must be
      // an open JSX tag, not a string mentioning "<img>")
      const stripped = line.trim()
      if (stripped.startsWith('//') || stripped.startsWith('*')) continue

      // Match <img or <Image — must be opening JSX tag, not inside
      // a string literal. We use a regex on the trimmed line.
      const isRawImg = /<img(\s|\/?>)/.test(line)
      const isNextImage = /<Image(\s|\/?>)/.test(line)
      if (!isRawImg && !isNextImage) continue

      // Look at a 5-line window for context (the tag is often split
      // across lines for props).
      const windowText = lines.slice(i, Math.min(i + 8, lines.length)).join('\n')
      if (!looksLikeAlbumArt(windowText)) continue

      violations.push({
        bucket: isRawImg ? 'raw-img' : 'next-image-album',
        file: rel,
        line: i + 1,
        detail: stripped.slice(0, 100),
      })
    }
  }
  return violations
}

// ── B. Album coverage audit ──────────────────────────────────────────

function auditAlbumCoverage(): Violation[] {
  const violations: Violation[] = []
  for (const [, raw] of Object.entries(ALBUMS)) {
    const album = raw as Album
    if (ALBUM_ARTWORK_ALLOWLIST.has(album.id)) continue
    const cover = album.cover ?? ''
    if (!cover) {
      violations.push({
        bucket: 'no-cover',
        detail: `${album.id} — "${album.title}" by ${album.artist}: cover is empty`,
      })
      continue
    }
    if (cover.startsWith('https://placehold.co/')) {
      violations.push({
        bucket: 'placeholder',
        detail: `${album.id} — "${album.title}" by ${album.artist}: cover is placehold.co placeholder`,
      })
    }
  }
  return violations
}

// ── C. Remote URL health audit ───────────────────────────────────────

async function headCheck(url: string): Promise<{
  ok: boolean
  status: number
  reason?: string
}> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        Accept: 'image/*',
        'User-Agent': 'LongPlay/1.0 (artwork-audit)',
      },
      signal: ctrl.signal,
    })
    const ct = res.headers.get('content-type') ?? ''
    if (!res.ok) return { ok: false, status: res.status, reason: `HTTP ${res.status}` }
    if (!ct.startsWith('image/')) return { ok: false, status: res.status, reason: `content-type=${ct || 'unknown'}` }
    return { ok: true, status: res.status }
  } catch (err) {
    return { ok: false, status: 0, reason: err instanceof Error ? err.message.slice(0, 80) : 'fetch failed' }
  } finally {
    clearTimeout(t)
  }
}

async function auditRemoteHealth(): Promise<Violation[]> {
  const violations: Violation[] = []
  const albums = Object.values(ALBUMS) as Album[]
  const toCheck = albums.filter(
    (a) =>
      a.cover &&
      a.cover.length > 0 &&
      !a.cover.startsWith('https://placehold.co/') &&
      !ALBUM_ARTWORK_ALLOWLIST.has(a.id),
  )
  console.log(`  [C] HEAD-checking ${toCheck.length} remote covers (concurrency 4)…`)

  let cursor = 0
  const concurrency = 4
  async function worker() {
    while (true) {
      const i = cursor
      cursor += 1
      if (i >= toCheck.length) return
      const a = toCheck[i]
      const result = await headCheck(a.cover)
      if (!result.ok) {
        violations.push({
          bucket: 'dead-remote',
          detail: `${a.id} — "${a.title}" by ${a.artist}: ${result.reason ?? 'failed'} (${a.cover.slice(0, 60)}…)`,
        })
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return violations
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const checkRemote = args.includes('--check-remote')

  console.log('\n── artwork audit ──\n')

  const componentFiles = listSourceFiles(join(ROOT, 'components'))
  const appFiles = listSourceFiles(join(ROOT, 'app'))
  const allFiles = [...componentFiles, ...appFiles]

  const rawImgViolations = auditRawImages(allFiles)
  const coverageViolations = auditAlbumCoverage()
  const remoteViolations = checkRemote ? await auditRemoteHealth() : []

  const all = [...rawImgViolations, ...coverageViolations, ...remoteViolations]

  // Summary
  console.log('Summary:')
  console.log(`  [A] raw-image violations:        ${rawImgViolations.length}`)
  console.log(`  [B] coverage violations:         ${coverageViolations.length}`)
  if (checkRemote) {
    console.log(`  [C] dead-remote violations:      ${remoteViolations.length}`)
  } else {
    console.log(`  [C] remote-health audit:          skipped (pass --check-remote)`)
  }
  console.log()

  if (all.length === 0) {
    console.log('✓ all artwork audits passed')
    process.exit(0)
  }

  if (rawImgViolations.length > 0) {
    console.log('A) Raw album-art image tags found outside the shared AlbumCover/AlbumThumb component:')
    for (const v of rawImgViolations) {
      console.log(`  ${v.file}:${v.line}  [${v.bucket}]  ${v.detail}`)
    }
    console.log('  → Replace with <AlbumCover> or <AlbumThumb> from @/components/album-cover.')
    console.log()
  }

  if (coverageViolations.length > 0) {
    console.log('B) Albums without verified artwork (and not allowlisted):')
    for (const v of coverageViolations) {
      console.log(`  [${v.bucket}]  ${v.detail}`)
    }
    console.log('  → Source artwork via:')
    console.log('       tsx scripts/resolve-itunes-artwork.ts --validate-existing --use-overrides --use-musicbrainz --write')
    console.log('     OR add the album id to ALBUM_ARTWORK_ALLOWLIST in this script')
    console.log('     (only when shipping with the designed fallback is the intentional choice).')
    console.log()
  }

  if (remoteViolations.length > 0) {
    console.log('C) Dead remote cover URLs (live in lib/albums.ts but fail HEAD-check):')
    for (const v of remoteViolations) {
      console.log(`  [${v.bucket}]  ${v.detail}`)
    }
    console.log('  → Re-run the resolver with --validate-existing to refresh these URLs.')
    console.log()
  }

  console.log(`✗ ${all.length} artwork violation${all.length === 1 ? '' : 's'} — failing.`)
  process.exit(1)
}

main().catch((err) => {
  console.error('audit-artwork failed:', err)
  process.exit(1)
})
