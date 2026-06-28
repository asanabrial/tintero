/**
 * Unified, dialect-agnostic transaction helper for the content store.
 *
 * Every supported driver exposes the SAME async transaction API:
 *   - libSQL          (drizzle-orm/libsql)        — db.transaction(async tx => T): Promise<T>
 *   - node-postgres   (drizzle-orm/node-postgres)  — db.transaction(async tx => T): Promise<T>
 *   - mysql2          (drizzle-orm/mysql2)          — db.transaction(async tx => T): Promise<T>
 *
 * So a single wrapper works for all of them with ZERO per-driver branching.
 * (This is the reason the SQLite driver was moved from bun:sqlite — whose
 * transaction callback is synchronous and commits async work early — to libSQL.)
 *
 * Usage: run a method's full write sequence inside one transaction so a failure
 * partway through rolls back EVERYTHING — no orphan content/term/meta rows.
 *
 *   return withTransaction(this.db, async (tx) => {
 *     await tx.insert(content).values(...);
 *     await this.upsertTerm(tx, ...);   // helpers take the executor as 1st arg
 *     await this.reconcileTermCounts(tx, ...);
 *   });
 *
 * The `tx` handed to the callback exposes the same drizzle query-builder API as
 * `db` (insert/update/delete/select), so write helpers can accept either by
 * taking an `Executor` parameter and using it in place of `this.db`.
 */

// The drizzle instances for the three dialects have different concrete types;
// we expose `any` here exactly as the adapter/writer boundaries already do.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Executor = any;

/**
 * Run `fn` inside a database transaction, committing on success and rolling
 * back if `fn` throws. The thrown error propagates to the caller after rollback.
 */
export async function withTransaction<T>(
  db: Executor,
  fn: (tx: Executor) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx: Executor) => fn(tx));
}
