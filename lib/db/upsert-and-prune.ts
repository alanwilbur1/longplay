/**
 * lib/db/upsert-and-prune.ts — Phase 6A.14
 *
 * Atomicity-safe recompute primitive for per-user derived tables
 * (Layer 2 listener_*, Layer 4 room_affinity_scores, Layer 5 identity).
 *
 * BEFORE (delete-then-insert):
 *
 *     await admin.from(TABLE).delete().eq('user_id', userId)   ← table empties
 *     await admin.from(TABLE).insert(newRows)                  ← refill
 *
 *   Reader between the two awaits sees ZERO rows. A crash in the
 *   second call leaves the table empty until the next sync.
 *
 * AFTER (upsert-and-prune):
 *
 *     await admin.from(TABLE).upsert(newRows, { onConflict })   ← new rows present
 *     await admin.from(TABLE).delete().eq(user_id).not.in(newKeys)  ← stale removed
 *
 *   Reader at any moment sees a populated table:
 *     - before upsert:    old rows (last successful recompute)
 *     - mid-upsert:       mix of old + already-upserted new rows
 *     - between calls:    new rows + lingering stale rows (consistent, just superset)
 *     - mid-prune:        new rows + some stale rows
 *     - after prune:      new rows only
 *
 *   Crash recovery: any failure leaves the table strictly MORE populated
 *   than the previous successful state — never empty. The next sync's
 *   upsert overwrites and the next prune cleans up the leftovers.
 *
 * Required preconditions on TABLE:
 *   - has a composite PK or unique constraint on `(user_id, <keyCol>)`
 *   - service-role write grant
 *   - identifies the per-row natural key via `keyCol` (e.g. 'canonical_artist_key',
 *     'genre', 'room_id', 'trait_key', 'archetype_key')
 *
 * Chunk size matches the prior implementation (250) so PostgREST request
 * size budgets aren't disturbed.
 *
 * Pure of the recompute logic — accepts pre-built rows. Composes with
 * existing `recomputeListenerGraph`, `recomputeRoomAffinities`,
 * `recomputeListenerIdentity` without changing their formulas.
 */

const DEFAULT_CHUNK = 250

/**
 * Minimal structural type for the Supabase client. We accept ANY
 * `.from(table)` builder shape because the helper casts internally
 * to issue the upsert/delete/eq/not chain. Declaring the full
 * SupabaseClient<Database> here would force the caller to pre-cast
 * (a regression from the previous direct-write code), so duck typing
 * is the right choice for an infrastructure primitive.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any }

export interface UpsertAndPruneOptions<K extends string | number> {
  /** The Supabase admin client (service-role). */
  admin: SupabaseLike
  /** Target table name. */
  table: string
  /** User the recompute is scoped to. All deletes are `.eq('user_id', userId)`-bounded. */
  userId: string
  /** New row payloads. Must each include `user_id = userId` and a value at `keyCol`. */
  rows: Array<Record<string, unknown>>
  /** The natural-key column on this table. Used for both the conflict target and
   *  the prune `NOT IN (…)` filter. Multi-column conflict targets aren't supported
   *  here on purpose — every per-user derived table in Layer 2-5 uses a single
   *  natural key per row. */
  keyCol: string
  /** Conflict target string passed to `.upsert({ onConflict })`. Usually
   *  `'user_id,<keyCol>'` matching the table's composite PK. */
  onConflict: string
  /** Chunk size for both upsert and prune-IN-list. Default 250. */
  chunk?: number
}

export interface UpsertAndPruneResult {
  /** Number of rows upserted (matches caller's input length on success). */
  upserted: number
  /** Number of stale rows pruned (rows that existed before but were not in `rows`). */
  pruned: number
  /** Internal stage timings (ms). Surfaced for telemetry; safe to ignore. */
  timing: {
    upsert_ms: number
    prune_ms: number
  }
}

/**
 * Run a continuity-safe recompute for one (table, user) pair.
 *
 * Stage 1 — UPSERT the new rows in chunks. PK conflict overwrites the
 *           existing row in place. Table is continuously populated at
 *           a count >= max(prev, new).
 *
 * Stage 2 — PRUNE rows for this user whose natural key isn't in the
 *           new set. Skipped entirely when `rows.length === 0` AND we
 *           have no way to identify "stale" (treat empty-rows recompute
 *           as a no-op — callers that genuinely want to clear the
 *           user's rows should pass `pruneAllWhenEmpty: true` or
 *           call `.delete()` directly).
 *
 * Throws on the FIRST upsert/prune error; the caller's existing
 * try/catch behavior is preserved. The thrown Error message includes
 * Postgres code/details/hint via the same shape used by the existing
 * listener-graph error wrapper.
 */
export async function upsertAndPrune<K extends string | number>(
  options: UpsertAndPruneOptions<K>,
): Promise<UpsertAndPruneResult> {
  const {
    admin,
    table,
    userId,
    rows,
    keyCol,
    onConflict,
    chunk = DEFAULT_CHUNK,
  } = options

  // Stage 1 — UPSERT chunked
  const upsertStart = Date.now()
  let upserted = 0
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk)
    // Workaround: supabase-js typed clients sometimes infer `never` for
    // dynamic table names. Cast through `unknown` so the helper accepts
    // arbitrary table strings without polluting callers.
    const { error, count } = await (
      admin.from(table) as unknown as {
        upsert: (
          values: Array<Record<string, unknown>>,
          opts: { onConflict: string; count: 'exact' },
        ) => Promise<{ error: { code?: string; details?: string; hint?: string; message: string } | null; count: number | null }>
      }
    ).upsert(slice, { onConflict, count: 'exact' })
    if (error) {
      throw new Error(
        `[upsert-and-prune] upsert ${table} failed:` +
          ` code=${error.code ?? 'n/a'}` +
          ` rows=${slice.length}` +
          ` details=${error.details ?? 'n/a'}` +
          ` hint=${error.hint ?? 'n/a'}` +
          ` message=${error.message}`,
      )
    }
    upserted += count ?? slice.length
  }
  const upsertMs = Date.now() - upsertStart

  // Stage 2 — PRUNE stale rows
  const pruneStart = Date.now()
  let pruned = 0
  if (rows.length > 0) {
    // Collect the new natural keys; use them as a NOT IN allow-list.
    // We intentionally do NOT delete when `rows.length === 0` because
    // that's ambiguous (no recompute output? or user genuinely has
    // nothing?). Callers that need full-wipe semantics can issue a
    // .delete().eq('user_id', userId) directly.
    const newKeys = Array.from(
      new Set(
        rows
          .map((r) => r[keyCol])
          .filter((v): v is K => v !== null && v !== undefined),
      ),
    )
    // PostgREST `.in()` is fine for the natural-key counts we see in
    // Layer 2-5 (95 favorite artists, ~50 genres, ~13 rooms, ~10
    // traits, ~3 archetypes). For unbounded growth this would need
    // chunking; not worth pre-engineering until counts approach the
    // PostgREST query-length budget.
    //
    // Prune is `.eq(user_id).not.in(keyCol, newKeys)`.
    const { error, count } = await (
      admin.from(table) as unknown as {
        delete: (opts: { count: 'exact' }) => {
          eq: (k: string, v: string) => {
            not: (k: string, op: 'in', v: string) => Promise<{
              error: { code?: string; details?: string; hint?: string; message: string } | null
              count: number | null
            }>
          }
        }
      }
    )
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .not(keyCol, 'in', `(${newKeys.map((k) => `"${String(k).replace(/"/g, '\\"')}"`).join(',')})`)
    if (error) {
      throw new Error(
        `[upsert-and-prune] prune ${table} failed:` +
          ` code=${error.code ?? 'n/a'}` +
          ` details=${error.details ?? 'n/a'}` +
          ` hint=${error.hint ?? 'n/a'}` +
          ` message=${error.message}`,
      )
    }
    pruned = count ?? 0
  }
  const pruneMs = Date.now() - pruneStart

  return {
    upserted,
    pruned,
    timing: { upsert_ms: upsertMs, prune_ms: pruneMs },
  }
}

/**
 * Build a PostgREST `.not('col', 'in', value)` argument from a key list.
 * Exported only for unit testing — production callers go through
 * `upsertAndPrune`.
 *
 * Values are quoted and inner double-quotes escaped. Result shape:
 *   ("a","b","c")
 */
export function buildNotInList(keys: ReadonlyArray<string | number>): string {
  return (
    '(' +
    keys
      .map((k) => `"${String(k).replace(/"/g, '\\"')}"`)
      .join(',') +
    ')'
  )
}
