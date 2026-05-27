/**
 * scripts/encrypt-legacy-tokens.ts — Phase 6A.2A backfill
 *
 * One-shot migration to encrypt plaintext OAuth tokens left over from
 * Phase 4.x in listening_connections.{access_token_encrypted,
 * refresh_token_encrypted}. (The columns were named *_encrypted but
 * held plaintext until the Phase 6A.2A app-side AES-256-GCM landed.)
 *
 * Idempotent. Rows where the value already carries the v1 envelope
 * (enc:v1:…) are skipped. The lazy backfill in sync.ts handles
 * un-backfilled rows on the next refresh; this script is the
 * proactive path for operators who want a clean DB state without
 * waiting for every user to sync.
 *
 * Usage:
 *   tsx scripts/encrypt-legacy-tokens.ts          # dry-run (default)
 *   tsx scripts/encrypt-legacy-tokens.ts --write  # apply
 *
 * Required env:
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LISTENING_TOKEN_ENCRYPTION_KEY (base64, 32-byte AES key)
 *
 * Output is intentionally token-free — only counts and per-row tags
 * (id + source_id + verdict). Never the token value itself.
 */

import { createClient } from '@supabase/supabase-js'
import WS from 'ws'
import { encryptToken, isEncrypted } from '../lib/streaming/token-crypto'

interface ConnRow {
  id: string
  user_id: string
  source_id: string
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
}

async function main() {
  const writeMode = process.argv.includes('--write')
  const dryRun = !writeMode

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }
  if (!process.env.LISTENING_TOKEN_ENCRYPTION_KEY) {
    console.error(
      'Missing LISTENING_TOKEN_ENCRYPTION_KEY. Generate with:\n' +
        '  node -e "console.log(require(\\"crypto\\").randomBytes(32).toString(\\"base64\\"))"',
    )
    process.exit(1)
  }

  // Same WebSocket polyfill as refresh-room-metadata.ts /
  // refresh-album-covers.ts — Supabase realtime sub-client builds
  // itself at createClient() time and errors out under Node 20+
  // without a global WebSocket.
  if (typeof globalThis.WebSocket === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).WebSocket = WS
  }
  const db = createClient(url, key, {
    auth: { persistSession: false },
    realtime: {
      transport: WS as unknown as typeof WebSocket,
    },
  })

  console.log(
    `\n── encrypt-legacy-tokens${dryRun ? ' (DRY RUN — no writes; pass --write to apply)' : ''} ──\n`,
  )

  const { data: rows, error } = await db
    .from('listening_connections')
    .select('id, user_id, source_id, access_token_encrypted, refresh_token_encrypted')
  if (error) {
    console.error('Read failed:', error.message)
    process.exit(1)
  }

  let scanned = 0
  let alreadyEncrypted = 0
  let needsAccessEncrypt = 0
  let needsRefreshEncrypt = 0
  let updated = 0
  let failed = 0
  let nullToken = 0

  for (const r of (rows ?? []) as ConnRow[]) {
    scanned += 1
    const tag = `${r.id.slice(0, 8)}… (${r.source_id})`

    const accessIsEnc = isEncrypted(r.access_token_encrypted)
    const refreshIsEnc =
      r.refresh_token_encrypted == null || isEncrypted(r.refresh_token_encrypted)

    if (
      (r.access_token_encrypted == null || accessIsEnc) &&
      refreshIsEnc
    ) {
      alreadyEncrypted += 1
      if (r.access_token_encrypted == null) nullToken += 1
      continue
    }

    const update: { access_token_encrypted?: string; refresh_token_encrypted?: string } = {}
    try {
      if (r.access_token_encrypted && !accessIsEnc) {
        update.access_token_encrypted = encryptToken(r.access_token_encrypted)
        needsAccessEncrypt += 1
      }
      if (r.refresh_token_encrypted && !isEncrypted(r.refresh_token_encrypted)) {
        update.refresh_token_encrypted = encryptToken(r.refresh_token_encrypted)
        needsRefreshEncrypt += 1
      }
    } catch (err) {
      console.log(
        `  ! ${tag}: encryption failed — ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      failed += 1
      continue
    }

    if (Object.keys(update).length === 0) {
      alreadyEncrypted += 1
      continue
    }

    const tags = [
      update.access_token_encrypted ? 'access' : null,
      update.refresh_token_encrypted ? 'refresh' : null,
    ]
      .filter(Boolean)
      .join('+')

    console.log(`  ${dryRun ? '?' : '→'} ${tag}: encrypt [${tags}]`)

    if (dryRun) {
      updated += 1
      continue
    }

    const { error: updErr } = await db
      .from('listening_connections')
      .update(update)
      .eq('id', r.id)
    if (updErr) {
      console.log(`      ! update failed: ${updErr.message}`)
      failed += 1
    } else {
      updated += 1
    }
  }

  console.log(`\n── ${dryRun ? 'dry-run summary' : 'summary'} ──`)
  console.log(`  scanned:              ${scanned}`)
  console.log(`  already encrypted:    ${alreadyEncrypted}${nullToken ? ` (${nullToken} of those had null access_token)` : ''}`)
  console.log(`  would access-encrypt: ${needsAccessEncrypt}`)
  console.log(`  would refresh-encrypt:${needsRefreshEncrypt}`)
  console.log(`  ${dryRun ? 'would update' : 'updated'}:     ${updated}`)
  console.log(`  failed:               ${failed}`)
  if (dryRun && updated > 0) {
    console.log('\n  Pass --write to apply these changes.')
  }
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('encrypt-legacy-tokens failed:', err)
  process.exit(1)
})
