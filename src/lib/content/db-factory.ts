/**
 * Dialect-selecting content DB factory.
 *
 * Mirrors the lazy-singleton pattern from src/lib/comments/factory.ts:
 *   - All env-var reads happen INSIDE the function body (never at module load),
 *     so importing this module is safe at build time.
 *   - The drizzle instance is memoised on the first successful call and reused
 *     for all subsequent calls.
 *
 * Supported in v1 (§10 #2 of the architecture design):
 *   - postgresql  — node-postgres Pool + drizzle-orm/node-postgres
 *   - sqlite      — libSQL client + drizzle-orm/libsql
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
 * Not yet supported (deferred to v2 per §4.6):
 *   - mysql / mariadb — throws a clear "not supported in v1" error
 *
 * Config env vars (§8.1):
 *   - DATABASE_DIALECT  ∈ { postgresql, sqlite, mysql, mariadb }
 *   - DATABASE_URL      — server connection string (postgresql)
 *   - DATABASE_FILE     — sqlite location; defaults to in-memory when unset.
 *     Accepts a plain path ("./content.db"), a libSQL URL ("file:…", "libsql:…",
 *     "http(s):…", "ws(s):…"), or ":memory:". A plain path is wrapped as "file:".
 */

import { createClient } from "@libsql/client";
import { drizzle as drizzleSqlite } from "drizzle-orm/libsql";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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
      "DATABASE_DIALECT is not set — must be one of: postgresql, sqlite"
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
      const pool = new Pool({ connectionString: databaseUrl });
      contentDb = drizzlePg(pool, { schema: pgSchema });
      return contentDb;
    }

    case "sqlite": {
      const url = resolveLibsqlUrl(process.env.DATABASE_FILE);
      const client = createClient({ url });
      contentDb = drizzleSqlite(client, { schema: sqliteSchema });
      return contentDb;
    }

    case "mysql":
    case "mariadb": {
      throw new Error(
        `${dialect} is not supported in v1 (Postgres + SQLite only)`
      );
    }

    default: {
      throw new Error(
        `Unknown DATABASE_DIALECT "${dialect}" — must be one of: postgresql, sqlite`
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
export function getContentSchema(): typeof pgSchema | typeof sqliteSchema {
  const dialect = process.env.DATABASE_DIALECT as Dialect | undefined;
  switch (dialect) {
    case "postgresql":
      return pgSchema;
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
