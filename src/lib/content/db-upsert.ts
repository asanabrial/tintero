/**
 * Dialect-agnostic upsert / insert-ignore helpers for the content store.
 *
 * WHY THIS EXISTS
 * ----------------
 * sqlite (libSQL) and postgres share the SQL-standard ON CONFLICT family:
 *   - `.onConflictDoUpdate({ target, targetWhere?, set })`
 *   - `.onConflictDoNothing()`
 *   - `.returning({ id })`
 *
 * MySQL / MariaDB have NONE of these. They use:
 *   - `.onDuplicateKeyUpdate({ set })` — auto-keys on whatever unique index was
 *     violated; there is NO conflict-target argument and NO partial-index WHERE.
 *   - NO `RETURNING` clause at all.
 *
 * THE RETURNING-ID SUBTLETY (critical — read before touching upsertReturningId)
 * ----------------------------------------------------------------------------
 * On the upsert-with-returning sites the row carries a freshly generated client
 * id (`newId()`). On sqlite/pg, `.onConflictDoUpdate(...).returning({ id })`
 * returns the id of the row that actually ended up in the table:
 *   - on INSERT  → the new client id
 *   - on UPDATE  → the EXISTING row's ORIGINAL id (onConflictDoUpdate never
 *                  rewrites the PK), which DIFFERS from the client id we sent.
 * So we cannot just assume the client id is the live id on conflict.
 *
 * MySQL has no RETURNING, so we cannot read the live id back from the write.
 * We therefore emulate it: INSERT ... ON DUPLICATE KEY UPDATE, then run a
 * SELECT id ... WHERE <natural key> LIMIT 1 to fetch whichever row is now live
 * (the just-inserted one OR the pre-existing one). The caller supplies the
 * natural key that identifies the row (e.g. taxonomy+slug for terms).
 *
 * DIALECT DETECTION
 * -----------------
 * Read from `process.env.DATABASE_DIALECT` at call time (not module load) so
 * tests can flip the dialect per case. Values: "sqlite" | "postgresql" |
 * "mysql" | "mariadb". mysql and mariadb are treated identically (the "mysql
 * path"); everything else uses the ON CONFLICT path.
 *
 * The `Executor` type is `any` (see ./db-transaction), so calling the
 * mysql-only `.onDuplicateKeyUpdate` compiles fine even though the sqlite/pg
 * query builders don't expose it — the dialect branch guarantees the right
 * method only runs against the matching driver.
 */

import { sql, type Column, type SQL } from "drizzle-orm";
import type { Executor } from "./db-transaction";

/** True when the active dialect is MySQL or MariaDB. */
function isMysqlDialect(): boolean {
  const dialect = (process.env.DATABASE_DIALECT ?? "sqlite").toLowerCase();
  return dialect === "mysql" || dialect === "mariadb";
}

// ---------------------------------------------------------------------------
// upsertReturningId — insert-or-update that returns the live row id
// ---------------------------------------------------------------------------

export interface UpsertReturningIdOpts {
  /** Columns of the unique/conflict target (sqlite/pg only). */
  conflictTarget: Column[];
  /** Partial-index predicate for the conflict target (sqlite/pg only). */
  targetWhere?: SQL;
  /** Columns to write on conflict (same `set` on both paths). */
  updateSet: Record<string, unknown>;
  /** The id column to read back. */
  idColumn: Column;
  /**
   * Natural-key predicate that uniquely identifies the live row. Used ONLY on
   * the mysql path to SELECT the id back (MySQL has no RETURNING). Must match
   * the same row the conflict target/targetWhere resolves to on sqlite/pg.
   * Typed to accept `and(...)`'s `SQL | undefined` result directly.
   */
  naturalKeyWhere: SQL | undefined;
}

/**
 * Insert `values`, updating `updateSet` on a unique-key conflict, and return
 * the id of the row that is now live.
 *
 * sqlite/pg: ON CONFLICT DO UPDATE ... RETURNING id.
 * mysql:     ON DUPLICATE KEY UPDATE, then SELECT id WHERE naturalKeyWhere
 *            (because MySQL has no RETURNING and on UPDATE keeps the original id).
 */
export async function upsertReturningId(
  exec: Executor,
  table: unknown,
  values: Record<string, unknown>,
  opts: UpsertReturningIdOpts
): Promise<string> {
  if (isMysqlDialect()) {
    await exec
      .insert(table)
      .values(values)
      .onDuplicateKeyUpdate({ set: opts.updateSet });
    const rows: Array<{ id: string }> = await exec
      .select({ id: opts.idColumn })
      .from(table)
      .where(opts.naturalKeyWhere)
      .limit(1);
    return rows[0].id;
  }

  const rows: Array<{ id: string }> = await exec
    .insert(table)
    .values(values)
    .onConflictDoUpdate({
      target: opts.conflictTarget,
      ...(opts.targetWhere ? { targetWhere: opts.targetWhere } : {}),
      set: opts.updateSet,
    })
    .returning({ id: opts.idColumn });
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// upsert — insert-or-update with no id needed (e.g. SEO content_meta)
// ---------------------------------------------------------------------------

export interface UpsertOpts {
  /** Columns of the unique/conflict target (sqlite/pg only). */
  conflictTarget: Column[];
  /** Partial-index predicate for the conflict target (sqlite/pg only). */
  targetWhere?: SQL;
  /** Columns to write on conflict (same `set` on both paths). */
  updateSet: Record<string, unknown>;
}

/**
 * Insert `values`, updating `updateSet` on a unique-key conflict. No id is read
 * back.
 *
 * sqlite/pg: ON CONFLICT DO UPDATE.
 * mysql:     ON DUPLICATE KEY UPDATE.
 */
export async function upsert(
  exec: Executor,
  table: unknown,
  values: Record<string, unknown>,
  opts: UpsertOpts
): Promise<void> {
  if (isMysqlDialect()) {
    await exec
      .insert(table)
      .values(values)
      .onDuplicateKeyUpdate({ set: opts.updateSet });
    return;
  }

  await exec
    .insert(table)
    .values(values)
    .onConflictDoUpdate({
      target: opts.conflictTarget,
      ...(opts.targetWhere ? { targetWhere: opts.targetWhere } : {}),
      set: opts.updateSet,
    });
}

// ---------------------------------------------------------------------------
// insertIgnore — insert-or-do-nothing (e.g. term_relationships)
// ---------------------------------------------------------------------------

export interface InsertIgnoreOpts {
  /**
   * A column set to itself to emulate "do nothing" on mysql. MySQL has no
   * INSERT IGNORE equivalent in drizzle's query builder, so the no-op update
   * `SET col = col` makes ON DUPLICATE KEY UPDATE change nothing.
   */
  selfRefColumn: Column;
}

/**
 * Insert `values`, doing nothing if the row already exists.
 *
 * sqlite/pg: ON CONFLICT DO NOTHING.
 * mysql:     ON DUPLICATE KEY UPDATE SET selfRefColumn = selfRefColumn (no-op).
 */
export async function insertIgnore(
  exec: Executor,
  table: unknown,
  values: Record<string, unknown>,
  opts: InsertIgnoreOpts
): Promise<void> {
  if (isMysqlDialect()) {
    const col = opts.selfRefColumn;
    await exec
      .insert(table)
      .values(values)
      .onDuplicateKeyUpdate({ set: { [col.name]: sql`${col}` } });
    return;
  }

  await exec.insert(table).values(values).onConflictDoNothing();
}
