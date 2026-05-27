/**
 * scripts/test-upsert-and-prune.ts — Phase 6A.14
 *
 * Tests for lib/db/upsert-and-prune. Pure helpers + a stub Supabase
 * client tracking call shapes — no live DB.
 *
 * Asserts:
 *   - buildNotInList escapes correctly
 *   - upsertAndPrune calls .upsert() once per chunk, never .delete()-before-upsert
 *   - PRUNE step is .not(keyCol, 'in', listOfNewKeys), scoped to user_id
 *   - rows.length === 0 results in NO delete (safe no-op semantics)
 *   - chunking happens at the configured boundary
 *   - upsert errors throw with code/details/hint/message
 *
 * Run: npm run test:upsert-and-prune
 */

import { buildNotInList, upsertAndPrune } from '../lib/db/upsert-and-prune'

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

async function main() {

// ── buildNotInList ───────────────────────────────────────────────
console.log('\nbuildNotInList:')
assert(
  'simple strings → ("a","b","c")',
  buildNotInList(['a', 'b', 'c']) === '("a","b","c")',
)
assert(
  'numeric keys cast to string',
  buildNotInList([1, 2, 3]) === '("1","2","3")',
)
assert(
  'embedded double-quote escaped',
  buildNotInList(['a"b']) === '("a\\"b")',
)
assert('empty list → ()', buildNotInList([]) === '()')

// ── upsertAndPrune via stub client ───────────────────────────────
//
// The stub mirrors enough of supabase-js's fluent API to exercise the
// call sequence the helper produces. Each .from(table) returns a fresh
// builder that records what was called on it. The test inspects the
// recorded call log after upsertAndPrune resolves.
//
// We're testing that the helper:
//   1. Calls upsert(rows, { onConflict, count: 'exact' }) for each chunk.
//   2. Calls delete({ count: 'exact' }).eq('user_id', userId)
//      .not(keyCol, 'in', listOfNewKeys) — exactly once.
//   3. Does NOT call .delete() when rows.length === 0.

type Call =
  | {
      kind: 'upsert'
      table: string
      values: Array<Record<string, unknown>>
      onConflict: string
    }
  | {
      kind: 'delete'
      table: string
      eq: { col: string; val: string }
      not: { col: string; op: string; val: string }
    }

function makeStubClient(opts: {
  upsertError?: { code?: string; details?: string; hint?: string; message: string } | null
  pruneError?: { code?: string; details?: string; hint?: string; message: string } | null
} = {}) {
  const calls: Call[] = []
  const upsertError = opts.upsertError ?? null
  const pruneError = opts.pruneError ?? null

  function buildFor(table: string) {
    return {
      upsert: (
        values: Array<Record<string, unknown>>,
        upOpts: { onConflict: string; count: 'exact' },
      ) => {
        calls.push({ kind: 'upsert', table, values, onConflict: upOpts.onConflict })
        return Promise.resolve({ error: upsertError, count: values.length })
      },
      delete: (_delOpts: { count: 'exact' }) => ({
        eq: (col: string, val: string) => ({
          not: (notCol: string, op: 'in', notVal: string) => {
            calls.push({
              kind: 'delete',
              table,
              eq: { col, val },
              not: { col: notCol, op, val: notVal },
            })
            return Promise.resolve({ error: pruneError, count: 0 })
          },
        }),
      }),
    }
  }

  return {
    calls,
    client: {
      from: (table: string) => buildFor(table),
    } as unknown as Parameters<typeof upsertAndPrune>[0]['admin'],
  }
}

console.log('\nupsertAndPrune: basic call sequence')
{
  const stub = makeStubClient()
  const rows = [
    { user_id: 'u1', genre: 'indie', score: 0.5 },
    { user_id: 'u1', genre: 'ambient', score: 0.3 },
    { user_id: 'u1', genre: 'jazz', score: 0.2 },
  ]
  const result = await upsertAndPrune({
    admin: stub.client,
    table: 'listener_genres',
    userId: 'u1',
    rows,
    keyCol: 'genre',
    onConflict: 'user_id,genre',
  })
  assert('upserted count matches rows', result.upserted === 3)
  assert('exactly one upsert call (rows < chunk)', stub.calls.filter(c => c.kind === 'upsert').length === 1)
  assert('exactly one delete call', stub.calls.filter(c => c.kind === 'delete').length === 1)
  const upsertCall = stub.calls.find(c => c.kind === 'upsert')
  const deleteCall = stub.calls.find(c => c.kind === 'delete')
  assert(
    'upsert ran BEFORE delete (atomicity guarantee)',
    stub.calls[0].kind === 'upsert' && stub.calls[stub.calls.length - 1].kind === 'delete',
  )
  assert(
    'onConflict carries composite PK',
    upsertCall?.kind === 'upsert' && upsertCall.onConflict === 'user_id,genre',
  )
  assert(
    'delete scoped to user_id',
    deleteCall?.kind === 'delete' && deleteCall.eq.col === 'user_id' && deleteCall.eq.val === 'u1',
  )
  assert(
    'prune NOT IN list contains all new keys',
    deleteCall?.kind === 'delete' &&
      deleteCall.not.val.includes('indie') &&
      deleteCall.not.val.includes('ambient') &&
      deleteCall.not.val.includes('jazz'),
  )
}

console.log('\nupsertAndPrune: empty rows is a safe no-op')
{
  const stub = makeStubClient()
  const result = await upsertAndPrune({
    admin: stub.client,
    table: 'listener_genres',
    userId: 'u1',
    rows: [],
    keyCol: 'genre',
    onConflict: 'user_id,genre',
  })
  assert('upserted = 0', result.upserted === 0)
  assert('pruned = 0', result.pruned === 0)
  assert('no upsert call', stub.calls.filter(c => c.kind === 'upsert').length === 0)
  assert('no delete call (would wipe data otherwise)', stub.calls.filter(c => c.kind === 'delete').length === 0)
}

console.log('\nupsertAndPrune: chunking at configured boundary')
{
  const stub = makeStubClient()
  const rows = Array.from({ length: 7 }, (_, i) => ({
    user_id: 'u1',
    genre: `g${i}`,
    score: i,
  }))
  await upsertAndPrune({
    admin: stub.client,
    table: 'listener_genres',
    userId: 'u1',
    rows,
    keyCol: 'genre',
    onConflict: 'user_id,genre',
    chunk: 3,
  })
  const upsertCalls = stub.calls.filter((c): c is Extract<Call, { kind: 'upsert' }> => c.kind === 'upsert')
  assert('chunked into 3 calls (ceil(7/3))', upsertCalls.length === 3)
  assert('chunk sizes: 3, 3, 1', upsertCalls[0].values.length === 3 && upsertCalls[1].values.length === 3 && upsertCalls[2].values.length === 1)
  // Prune still only one call.
  assert('one prune call regardless of chunks', stub.calls.filter(c => c.kind === 'delete').length === 1)
}

console.log('\nupsertAndPrune: upsert error throws with code/details/hint')
{
  const stub = makeStubClient({
    upsertError: { code: '42P01', details: 'table missing', hint: 'check migrations', message: 'relation does not exist' },
  })
  let threw = false
  let msg = ''
  try {
    await upsertAndPrune({
      admin: stub.client,
      table: 'listener_genres',
      userId: 'u1',
      rows: [{ user_id: 'u1', genre: 'indie' }],
      keyCol: 'genre',
      onConflict: 'user_id,genre',
    })
  } catch (e) {
    threw = true
    msg = e instanceof Error ? e.message : String(e)
  }
  assert('threw on upsert error', threw)
  assert('error message contains code', msg.includes('code=42P01'))
  assert('error message contains details', msg.includes('details=table missing'))
  assert('error message contains hint', msg.includes('hint=check migrations'))
  assert('error message contains original message', msg.includes('relation does not exist'))
  assert('did NOT proceed to prune after upsert error', stub.calls.filter(c => c.kind === 'delete').length === 0)
}

console.log('\nupsertAndPrune: prune error throws with code/details/hint')
{
  const stub = makeStubClient({
    pruneError: { code: '42501', details: 'rls denied', hint: 'service role required', message: 'permission denied' },
  })
  let threw = false
  let msg = ''
  try {
    await upsertAndPrune({
      admin: stub.client,
      table: 'listener_genres',
      userId: 'u1',
      rows: [{ user_id: 'u1', genre: 'indie' }],
      keyCol: 'genre',
      onConflict: 'user_id,genre',
    })
  } catch (e) {
    threw = true
    msg = e instanceof Error ? e.message : String(e)
  }
  assert('threw on prune error', threw)
  assert('error message contains code 42501', msg.includes('code=42501'))
  assert('upsert ran (before prune failure)', stub.calls.filter(c => c.kind === 'upsert').length === 1)
}

console.log('\nupsertAndPrune: deduplication of new keys before NOT IN list')
{
  const stub = makeStubClient()
  // Intentionally pass duplicate keys — should still produce a single
  // NOT IN entry per key.
  await upsertAndPrune({
    admin: stub.client,
    table: 'listener_genres',
    userId: 'u1',
    rows: [
      { user_id: 'u1', genre: 'indie' },
      { user_id: 'u1', genre: 'indie' },
      { user_id: 'u1', genre: 'jazz' },
    ],
    keyCol: 'genre',
    onConflict: 'user_id,genre',
  })
  const del = stub.calls.find((c): c is Extract<Call, { kind: 'delete' }> => c.kind === 'delete')!
  // Count occurrences of "indie" in the NOT IN list — should be exactly 1.
  const indieMatches = (del.not.val.match(/indie/g) ?? []).length
  assert('duplicates collapsed to one NOT IN entry', indieMatches === 1)
}

console.log(`\n── result: ${pass} pass / ${fail} fail ──`)
if (fail > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
process.exit(0)
}

main().catch((err) => {
  console.error('test failed:', err)
  process.exit(1)
})
