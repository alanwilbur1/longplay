import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// Note: not marked with `import 'server-only'` because both Next
// server code and the standalone tsx scripts (test-token-crypto,
// encrypt-legacy-tokens) need to import this module. The Node
// `crypto` APIs (createCipheriv, randomBytes) are intrinsically
// server-only — any accidental client-bundle import would fail at
// runtime anyway.

/**
 * lib/streaming/token-crypto.ts — Phase 6A.2A
 *
 * App-side AES-256-GCM for OAuth tokens stored in the
 * `listening_connections.*_encrypted` columns. The columns were
 * mis-named: they were holding plaintext from Phase 4.x. This module
 * makes the naming truthful and the storage authenticated-encrypted.
 *
 * Envelope:
 *     enc:v1:<base64( iv | auth_tag | ciphertext )>
 *       iv:         12 bytes  (GCM standard nonce size)
 *       auth_tag:   16 bytes  (GCM authentication tag)
 *       ciphertext: N bytes   (variable, UTF-8 plaintext encrypted)
 *
 * Why the prefix?
 *   1. Doubles as the plaintext detector. Any value without the
 *      `enc:v1:` prefix is treated as legacy plaintext, so the
 *      deploy is safe even with un-backfilled rows — the next
 *      refresh writes back encrypted (lazy backfill).
 *   2. Version bump path: future `enc:v2:` could switch algorithm
 *      or key. Don't repurpose the v1 prefix.
 *
 * Key handling:
 *   Read once from process.env.LISTENING_TOKEN_ENCRYPTION_KEY, decode
 *   as base64, cache for the process lifetime. Validates length on
 *   first use; throws a distinct error per failure mode so an
 *   operator can tell "key missing" from "key wrong length" without
 *   guessing. Key bytes are never logged. Plaintext is never logged.
 *
 * Double-encryption guard:
 *   encryptToken() refuses to encrypt a value that already carries
 *   the v1 envelope. The backfill script uses isEncrypted() to skip
 *   rows that are already encrypted; this guard catches programmer
 *   error in write paths (no path should pass already-encrypted
 *   data to encryptToken — callers always start from raw provider
 *   output).
 *
 * Tamper detection:
 *   GCM's auth tag is verified by decipher.final(); any modification
 *   to iv, tag, or ciphertext throws. decryptToken() does not catch
 *   that throw — the caller sees a real error rather than a silent
 *   credential corruption.
 */

const ENVELOPE_PREFIX = 'enc:v1:'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

let cachedKey: Buffer | null = null

function loadKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.LISTENING_TOKEN_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      '[token-crypto] LISTENING_TOKEN_ENCRYPTION_KEY is not set. ' +
        'Generate with: node -e "console.log(require(\\"crypto\\").randomBytes(32).toString(\\"base64\\"))"',
    )
  }
  let decoded: Buffer
  try {
    decoded = Buffer.from(raw, 'base64')
  } catch {
    throw new Error(
      '[token-crypto] LISTENING_TOKEN_ENCRYPTION_KEY must be base64-encoded',
    )
  }
  if (decoded.length !== KEY_BYTES) {
    throw new Error(
      `[token-crypto] LISTENING_TOKEN_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${decoded.length}). ` +
        'Re-generate with: node -e "console.log(require(\\"crypto\\").randomBytes(32).toString(\\"base64\\"))"',
    )
  }
  cachedKey = decoded
  return decoded
}

/**
 * Test-only: forget the cached key so the next call re-reads env.
 * Exported so the test script can simulate "env changed" scenarios.
 * Production code never needs this.
 */
export function __resetKeyCacheForTesting(): void {
  cachedKey = null
}

/** True iff `value` carries the v1 encryption envelope. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENVELOPE_PREFIX)
}

/**
 * Encrypt a plaintext token. Returns `enc:v1:<base64>`.
 *
 * Throws if:
 *   - `plaintext` is not a non-empty string
 *   - `plaintext` is already encrypted (re-encryption refused — see
 *     module header)
 *   - LISTENING_TOKEN_ENCRYPTION_KEY is missing / wrong length
 */
export function encryptToken(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('[token-crypto] encryptToken: plaintext must be a non-empty string')
  }
  if (isEncrypted(plaintext)) {
    throw new Error(
      '[token-crypto] encryptToken: value already encrypted; refusing re-encryption',
    )
  }
  const key = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, tag, ciphertext]).toString('base64')
  return ENVELOPE_PREFIX + payload
}

/**
 * Decrypt a stored token value.
 *
 * Returns:
 *   - `null` when `stored` is null / undefined / empty
 *   - the plaintext when `stored` is a v1 envelope (auth-tag verified)
 *   - `stored` unchanged when it has no envelope prefix (LEGACY:
 *     pre-encryption plaintext from Phase 4.x; safe to return as-is
 *     so callers keep working until the next refresh writes back
 *     encrypted)
 *
 * Throws if the v1 envelope is malformed or the auth tag fails to
 * verify — surface to the caller rather than silently returning
 * a corrupt credential.
 */
export function decryptToken(stored: string | null | undefined): string | null {
  if (typeof stored !== 'string' || stored.length === 0) return null
  if (!isEncrypted(stored)) return stored

  const key = loadKey()
  let payload: Buffer
  try {
    payload = Buffer.from(stored.slice(ENVELOPE_PREFIX.length), 'base64')
  } catch {
    throw new Error('[token-crypto] decryptToken: envelope is not valid base64')
  }
  if (payload.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('[token-crypto] decryptToken: envelope too short to be valid')
  }
  const iv = payload.subarray(0, IV_BYTES)
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}
