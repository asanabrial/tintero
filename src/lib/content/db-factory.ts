/**
 * Dialect-selecting content DB factory.
 *
 * Mirrors the lazy-singleton pattern from src/lib/comments/factory.ts:
 *   - All env-var reads happen INSIDE the function body (never at module load),
 *     so importing this module is safe at build time.
 *   - The drizzle instance is memoised on the first successful call and reused
 *     for all subsequent calls.
 *
 * Supported dialects (§10 #2 of the architecture design):
 *   - postgresql      — node-postgres Pool + drizzle-orm/node-postgres
 *   - sqlite          — libSQL client + drizzle-orm/libsql
 *   - mysql / mariadb — mysql2 Pool + drizzle-orm/mysql2 (shared schema.mysql)
 *
 * Why libSQL (not bun:sqlite) for SQLite:
 *   bun:sqlite (and better-sqlite3) expose a SYNCHRONOUS transaction callback,
 *   `db.transaction((tx) => T): T`. Async work inside that callback commits
 *   early — the BEGIN/COMMIT wrap only the synchronous portion. libSQL is the
 *   one Drizzle SQLite driver with an ASYNC transaction API,
 *   `db.transaction(async (tx) => T): Promise<T>`, identical to node-postgres.
 *   That lets writers share ONE unified, atomic `withTransaction` helper with
 *   zero per-driver branching. See docs/architecture/content-db-and-multi-dialect.md.
 *
 * Config env vars (§8.1):
 *   - DATABASE_DIALECT  ∈ { postgresql, sqlite, mysql, mariadb }
 *   - DATABASE_URL      — server connection string (postgresql, mysql, mariadb)
 *   - DATABASE_FILE     — sqlite location; defaults to in-memory when unset.
 *     Accepts a plain path ("./content.db"), a libSQL URL ("file:…", "libsql:…",
 *     "http(s):…", "ws(s):…"), or ":memory:". A plain path is wrapped as "file:".
 */

// NOTE: the native DB drivers (@libsql/client, mysql2, pg) and their drizzle
// bindings are require()'d lazily inside each dialect branch — NOT imported at
// the top level. Eager top-level imports load ALL three drivers on any access,
// so a single driver that fails to evaluate (e.g. native bindings under the
// Next.js/Turbopack server runtime) breaks every dialect, including the one in
// use. Per-branch loading means postgres mode only ever loads pg, etc.
import * as mysqlSchema from "./schema.mysql";
import * as pgSchema from "./schema.pg";
import * as sqliteSchema from "./schema.sqlite";

/**
 * In-memory libSQL URL.
 *
 * A bare ":memory:" is NOT usable with the libSQL local client: it opens a
 * fresh connection per statement, so a table created on one connection is
 * invisible to the next ("no such table"). The shared-cache form keeps a single
 * process-wide in-memory database alive across the client's connections.
 */
const LIBSQL_MEMORY_URL = "file::memory:?cache=shared";

/** libSQL URL schemes that must be passed through to createClient verbatim. */
const LIBSQL_URL_SCHEME = /^(file|libsql|https?|wss?):/i;

/**
 * Translate the DATABASE_FILE env var into a libSQL connection URL.
 *
 * - unset / "" / ":memory:" → shared in-memory database
 * - already a libSQL URL (file:, libsql:, http(s):, ws(s):) → passed through
 * - any other value (a filesystem path) → wrapped as a "file:" URL
 */
function resolveLibsqlUrl(databaseFile: string | undefined): string {
  if (!databaseFile || databaseFile === ":memory:") {
    return LIBSQL_MEMORY_URL;
  }
  if (LIBSQL_URL_SCHEME.test(databaseFile)) {
    return databaseFile;
  }
  return `file:${databaseFile}`;
}

// The project convention for the drizzle boundary type — the two dialect
// instances have different concrete types; we expose `any` here just like
// comments/factory.ts uses `DrizzleDb = any` at the adapter boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDb = any;

type Dialect = "postgresql" | "sqlite" | "mysql" | "mariadb";

// Module-level singleton — null until first successful getContentDb() call.
let contentDb: DrizzleDb | null = null;

/**
 * Returns the singleton content database instance, creating it on first call.
 *
 * Reads DATABASE_DIALECT on every first-call (lazy init) to remain build-safe.
 * Throws synchronously with a human-readable message when configuration is
 * invalid or required env vars are missing.
 */
export function getContentDb(): DrizzleDb {
  if (contentDb !== null) {
    return contentDb;
  }

  const dialect = process.env.DATABASE_DIALECT as Dialect | undefined;

  if (!dialect) {
    throw new Error(
      "DATABASE_DIALECT is not set — must be one of: postgresql, sqlite, mysql, mariadb"
    );
  }

  switch (dialect) {
    case "postgresql": {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error(
          "DATABASE_URL is not set — copy .env.example to .env.local and point it at a Postgres instance"
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { drizzle: drizzlePg } = require("drizzle-orm/node-postgres");
      const pool = new Pool({ connectionString: databaseUrl });
      contentDb = drizzlePg(pool, { schema: pgSchema });
      return contentDb;
    }

    case "sqlite": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClient } = require("@libsql/client");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { drizzle: drizzleSqlite } = require("drizzle-orm/libsql");
      const url = resolveLibsqlUrl(process.env.DATABASE_FILE);
      const client = createClient({ url });
      contentDb = drizzleSqlite(client, { schema: sqliteSchema });
      return contentDb;
    }

    case "mysql":
    case "mariadb": {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error(
          "DATABASE_URL is not set — copy .env.example to .env.local and point it at a MySQL/MariaDB instance"
        );
      }
      // createPool is lazy — it does not open a connection until the first query,
      // so construction succeeds without a live server. mysql2/promise yields the
      // promise-based pool drizzle-orm/mysql2 expects.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createPool } = require("mysql2/promise");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { drizzle: drizzleMysql } = require("drizzle-orm/mysql2");
      const pool = createPool(databaseUrl);
      contentDb = drizzleMysql(pool, { schema: mysqlSchema, mode: "default" });
      return contentDb;
    }

    default: {
      throw new Error(
        `Unknown DATABASE_DIALECT "${dialect}" — must be one of: postgresql, sqlite, mysql, mariadb`
      );
    }
  }
}

/**
 * Returns the dialect-appropriate drizzle schema tables module.
 *
 * Pass the returned object as the third argument to DrizzleContentAdapter so
 * the adapter uses the correct table objects (PgTable vs SQLiteTable) without
 * hard-coding the dialect at its import boundary. Must be called with the same
 * DATABASE_DIALECT as getContentDb().
 */
export function getContentSchema():
  | typeof pgSchema
  | typeof sqliteSchema
  | typeof mysqlSchema {
  const dialect = process.env.DATABASE_DIALECT as Dialect | undefined;
  switch (dialect) {
    case "postgresql":
      return pgSchema;
    case "mysql":
    case "mariadb":
      return mysqlSchema;
    case "sqlite":
    default:
      return sqliteSchema;
  }
}

/**
 * Reset the memoised singleton.
 *
 * ONLY for use in tests — call this in beforeEach / afterEach to isolate
 * test cases that manipulate process.env.DATABASE_DIALECT.
 * Never call this in production code.
 */
export function __resetForTests(): void {
  contentDb = null;
}
