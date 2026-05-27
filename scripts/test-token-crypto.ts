/**
 * scripts/test-token-crypto.ts — Phase 6A.2A
 *
 * Focused tests for lib/streaming/token-crypto. Same shape as
 * scripts/smoke-recommendations.ts — runs assertions, prints
 * pass/fail per case, exits non-zero on any failure. No test
 * framework dependency.
 *
 * Run: npx tsx scripts/test-token-crypto.ts
 *
 * Generates its own ephemeral 32-byte key per-invocation so the
 * test never depends on the operator's real LISTENING_TOKEN_
 * ENCRYPTION_KEY (and never logs/uses real tokens).
 */

import { randomBytes } from 'crypto'

let pass = 0
let fail = 0
const failures: string[] = []

function assert(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass += 1
    console.log(`  ✓ ${label}`)
  } else {
    fail += 1
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function expectThrow(label: string, fn: () => unknown, messageMatch?: RegExp) {
  try {
    fn()
    assert(label, false, 'expected throw, none thrown')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (messageMatch && !messageMatch.test(msg)) {
      assert(label, false, `wrong error: ${msg}`)
    } else {
      assert(label, true)
    }
  }
}

async function main() {
  // Set a known-good key BEFORE first import so the module cache picks it up.
  process.env.LISTENING_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64')

  const {
    encryptToken,
    decryptToken,
    isEncrypted,
    __resetKeyCacheForTesting,
  } = await import('../lib/streaming/token-crypto')

  console.log('\n── token-crypto tests ──\n')

  // ── Round-trip ───────────────────────────────────────────────────
  console.log('round-trip:')
  const samples = [
    'BQA7...short-spotify-token',
    'a',
    'a'.repeat(2048), // long token
    'special chars: 你好 → 👋 \n\t" \'\\ \0 end',
    'BQDEh...',
  ]
  for (const plain of samples) {
    const enc = encryptToken(plain)
    const dec = decryptToken(enc)
    assert(`encrypt→decrypt preserves "${plain.slice(0, 18)}${plain.length > 18 ? '…' : ''}"`, dec === plain)
    assert(`envelope detected for sample`, isEncrypted(enc))
    assert(`envelope distinct from plaintext`, enc !== plain)
  }

  // ── Random IVs (same plaintext → different ciphertexts) ─────────
  console.log('\nrandom IVs:')
  const a = encryptToken('same-plain')
  const b = encryptToken('same-plain')
  assert('encrypting the same plaintext twice yields different ciphertexts', a !== b)
  assert('both still decrypt to the same plaintext', decryptToken(a) === 'same-plain' && decryptToken(b) === 'same-plain')

  // ── isEncrypted detector ────────────────────────────────────────
  console.log('\nisEncrypted detector:')
  assert('isEncrypted("") → false', !isEncrypted(''))
  assert('isEncrypted(null) → false', !isEncrypted(null))
  assert('isEncrypted(undefined) → false', !isEncrypted(undefined))
  assert('isEncrypted(plaintext) → false', !isEncrypted('BQA7-plain-spotify-token'))
  assert('isEncrypted(envelope) → true', isEncrypted(encryptToken('x')))
  assert('isEncrypted("enc:v1:") → true (prefix-only is technically prefixed)', isEncrypted('enc:v1:'))

  // ── Legacy plaintext passes through decrypt unchanged ───────────
  console.log('\nlegacy plaintext passthrough:')
  assert(
    'decryptToken("legacy-plaintext") returns the value unchanged',
    decryptToken('legacy-plaintext') === 'legacy-plaintext',
  )
  assert('decryptToken(null) → null', decryptToken(null) === null)
  assert('decryptToken(undefined) → null', decryptToken(undefined) === null)
  assert('decryptToken("") → null', decryptToken('') === null)

  // ── Refuse double-encryption ────────────────────────────────────
  console.log('\nno double-encryption:')
  const once = encryptToken('test')
  expectThrow(
    'encryptToken(envelope) throws',
    () => encryptToken(once),
    /already encrypted/,
  )

  // ── Tamper detection (GCM auth tag) ─────────────────────────────
  console.log('\ntamper detection:')
  const good = encryptToken('untampered')
  // Flip a character inside the base64 payload to corrupt the ciphertext
  // or auth tag (both are after the "enc:v1:" prefix). Pick a position
  // well into the payload so we don't accidentally hit padding.
  const flipPos = good.length - 5
  const tampered =
    good.slice(0, flipPos) +
    (good[flipPos] === 'A' ? 'B' : 'A') +
    good.slice(flipPos + 1)
  expectThrow(
    'decryptToken(tampered ciphertext) throws',
    () => decryptToken(tampered),
    // GCM final() throws "Unsupported state" or similar; we just want a throw
  )

  // ── Malformed envelope ──────────────────────────────────────────
  console.log('\nmalformed envelope:')
  expectThrow(
    'decryptToken("enc:v1:short") throws — envelope too short',
    () => decryptToken('enc:v1:AAAA'),
    /too short/,
  )

  // ── Missing key ─────────────────────────────────────────────────
  console.log('\nmissing key:')
  const savedKey = process.env.LISTENING_TOKEN_ENCRYPTION_KEY
  delete process.env.LISTENING_TOKEN_ENCRYPTION_KEY
  __resetKeyCacheForTesting()
  expectThrow(
    'encryptToken without key throws',
    () => encryptToken('whatever'),
    /not set/,
  )
  expectThrow(
    'decryptToken(envelope) without key throws',
    () => decryptToken(once),
    /not set/,
  )
  process.env.LISTENING_TOKEN_ENCRYPTION_KEY = savedKey
  __resetKeyCacheForTesting()

  // ── Wrong key size ──────────────────────────────────────────────
  console.log('\nwrong key size:')
  process.env.LISTENING_TOKEN_ENCRYPTION_KEY = Buffer.from('not32bytes').toString('base64')
  __resetKeyCacheForTesting()
  expectThrow(
    'encryptToken with 10-byte key throws',
    () => encryptToken('whatever'),
    /32 bytes/,
  )
  process.env.LISTENING_TOKEN_ENCRYPTION_KEY = savedKey
  __resetKeyCacheForTesting()

  // ── Empty / non-string input rejected on encrypt ────────────────
  console.log('\nbad encrypt input:')
  expectThrow(
    'encryptToken("") throws — empty',
    () => encryptToken(''),
    /non-empty string/,
  )

  // ── Sync-like flow: decrypt legacy → next refresh writes encrypted ──
  console.log('\nlazy backfill scenario:')
  const legacyOnDisk = 'plaintext-from-phase4'
  const decryptedForUse = decryptToken(legacyOnDisk)
  assert(
    'legacy plaintext flows through decryptToken for the access-token path',
    decryptedForUse === legacyOnDisk,
  )
  // After provider.refreshTokens() returns a fresh access token, the
  // sync code writes encryptToken(refreshed.access_token). Simulate:
  const refreshedFreshAccess = 'fresh-from-spotify-refresh'
  const writeBack = encryptToken(refreshedFreshAccess)
  assert('encrypted writeback survives a round trip', decryptToken(writeBack) === refreshedFreshAccess)
  assert('writeback is encrypted (carries envelope)', isEncrypted(writeBack))

  console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
  if (fail > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('test-token-crypto crashed:', err)
  process.exit(1)
})
