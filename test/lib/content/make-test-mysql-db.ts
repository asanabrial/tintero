/**
 * Live MySQL/MariaDB test-database helper for the content layer.
 *
 * Unlike sqlite (libSQL temp files) and postgres (in-process PGlite), MySQL has
 * NO embeddable/in-process engine, so these tests run against a REAL server
 * (docker mysql:8.4 / mariadb:11). The whole thing is gated behind MYSQL_TEST_URL:
 * when that env var is unset the consuming test files skip entirely, keeping CI
 * and docker-less devs green.
 *
 * ISOLATION MODEL
 *   One shared mysql2 pool + drizzle instance per process (cheap; a real server
 *   is already running). There is no per-test in-memory database, so isolation is
 *   achieved by DELETE-ing every content table before each test, in child→parent
 *   FK order (content_meta, term_relationships, content, terms). DELETE (not
 *   TRUNCATE) is used deliberately: TRUNCATE on an FK-referenced table requires
 *   FOREIGN_KEY_CHECKS=0, which is session-scoped and unreliable across a pool's
 *   rotating connections; ordered DELETE respects the constraints on any
 *   connection.
 *
 * DATABASE_DIALECT
 *   db-upsert.ts reads process.env.DATABASE_DIALECT at call time to choose the
 *   ON DUPLICATE KEY UPDATE + SELECT-by-natural-key path. This helper sets it to
 *   "mysql" on first use and restores the previous value at process exit. Setting
 *   happens lazily (inside getMysqlTestDb), never at import, so a skipped test
 *   file never mutates the environment or opens a connection.
 *
 * COLLATION (CRITICAL ORDERING)
 *   MySQL/MariaDB default to a case-INsensitive collation, diverging from sqlite/pg.
 *   The fix is the DATABASE default collation utf8mb4_bin, which every column
 *   inherits at CREATE time — NOT a per-column ALTER (MariaDB refuses to MODIFY a
 *   FK column; see src/lib/content/mysql-collation.ts). Because ALTER DATABASE only
 *   affects NEWLY created tables, the test database MUST be set to utf8mb4_bin and
 *   the schema pushed AFTERWARDS:
 *       reset (drop tables) -> ALTER DATABASE ... COLLATE utf8mb4_bin -> drizzle-kit push -> run tests
 *   The `db:content:push:mysql` script does collation-first push; run it against the
 *   MYSQL_TEST_URL database before this suite. On first connect we re-apply the
 *   database default (idempotent) so the contract is self-documenting, but the
 *   case-sensitivity guarantee comes from pushing the schema after the default is set.
 */

import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { createPool, type Pool } from "mysql2/promise";
import * as schema from "@/lib/content/schema.mysql";
import {
  applyMysqlDatabaseCollation,
  databaseNameFromUrl,
} from "@/lib/content/mysql-collation";

export { schema as mysqlSchema };
export type TestMysqlDb = MySql2Database<typeof schema>;

/** The live MySQL connection URL, or undefined when the suite should skip. */
export const MYSQL_TEST_URL: string | undefined = process.env.MYSQL_TEST_URL;

interface SharedMysql {
  db: TestMysqlDb;
  pool: Pool;
}

let shared: Promise<SharedMysql> | null = null;
let exitHookRegistered = false;
let priorDialect: string | undefined;
let dialectPatched = false;

/**
 * Tables to clear before each test. `content` carries a self-FK (parent_id → id)
 * which MySQL enforces row-by-row even within a single `DELETE FROM content`, so
 * ordered DELETE is not enough — truncation must run with FOREIGN_KEY_CHECKS
 * disabled on a SINGLE dedicated connection (the setting is session-scoped).
 */
const CONTENT_TABLES = [
  "content_meta",
  "term_relationships",
  "content",
  "terms",
] as const;

function patchDialect(): void {
  if (dialectPatched) return;
  priorDialect = process.env.DATABASE_DIALECT;
  process.env.DATABASE_DIALECT = "mysql";
  dialectPatched = true;
}

function restoreDialect(): void {
  if (!dialectPatched) return;
  if (priorDialect === undefined) {
    delete process.env.DATABASE_DIALECT;
  } else {
    process.env.DATABASE_DIALECT = priorDialect;
  }
  dialectPatched = false;
}

function registerExitCleanup(pool: Pool): void {
  if (exitHookRegistered) return;
  exitHookRegistered = true;
  // Best-effort: end the pool and restore the dialect env at process exit.
  // pool.end() returns a promise; on the synchronous 'exit' event we cannot
  // await it, but the process is terminating anyway.
  process.on("exit", () => {
    restoreDialect();
    void pool.end().catch(() => {});
  });
}

/**
 * Lazily create (once per process) the shared mysql2 pool + drizzle instance,
 * set DATABASE_DIALECT=mysql, and apply the case-sensitive collation override.
 * Throws if MYSQL_TEST_URL is unset — callers must gate on it first.
 */
export function getMysqlTestDb(): Promise<SharedMysql> {
  if (!MYSQL_TEST_URL) {
    throw new Error(
      "MYSQL_TEST_URL is not set — this helper must only be called from a guarded (describe.skipIf) suite"
    );
  }
  if (shared !== null) return shared;

  shared = (async () => {
    patchDialect();
    const pool = createPool(MYSQL_TEST_URL);
    const db = drizzle(pool, { schema, mode: "default" });
    // Pin the case-sensitive (utf8mb4_bin) DATABASE default so slug identity
    // matches sqlite/pg. Idempotent. NOTE: this only re-collates tables created
    // AFTER it runs — the schema must already have been pushed with this default
    // in place (see the COLLATION note in this file's header).
    await applyMysqlDatabaseCollation(db, databaseNameFromUrl(MYSQL_TEST_URL));
    registerExitCleanup(pool);
    return { db, pool };
  })();

  return shared;
}

/**
 * Truncate all four content tables. Run this before each test to isolate it from
 * the previous one. Uses ONE dedicated pool connection with FOREIGN_KEY_CHECKS
 * disabled (session-scoped) so the self-referencing `content` table and the
 * FK-referenced `terms`/`content` tables can be cleared regardless of row order.
 *
 * The `db` argument is accepted for call-site symmetry but truncation goes
 * through the shared pool's raw connection (drizzle's pooled `execute` may land
 * the SET and the TRUNCATE on different connections, defeating the toggle).
 */
export async function truncateAllContentTables(
  _db?: TestMysqlDb
): Promise<void> {
  const { pool } = await getMysqlTestDb();
  const conn = await pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of CONTENT_TABLES) {
      await conn.query(`TRUNCATE TABLE ${table}`);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
}

/**
 * Convenience: get the shared db and clear it. Returns the drizzle instance
 * wired to schema.mysql plus a no-op cleanup (the shared pool lives for the
 * whole process and is closed at exit).
 */
export async function makeTestMysqlDb(): Promise<{
  db: TestMysqlDb;
  cleanup: () => void;
}> {
  const { db } = await getMysqlTestDb();
  await truncateAllContentTables();
  return { db, cleanup: () => {} };
}
