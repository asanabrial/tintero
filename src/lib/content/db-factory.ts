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
 *   - sqlite      — bun:sqlite Database + drizzle-orm/bun-sqlite
 *
 * Not yet supported (deferred to v2 per §4.6):
 *   - mysql / mariadb — throws a clear "not supported in v1" error
 *
 * Config env vars (§8.1):
 *   - DATABASE_DIALECT  ∈ { postgresql, sqlite, mysql, mariadb }
 *   - DATABASE_URL      — server connection string (postgresql)
 *   - DATABASE_FILE     — file path (sqlite); defaults to ":memory:" when unset
 */

import { Database } from "bun:sqlite";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as pgSchema from "./schema.pg";
import * as sqliteSchema from "./schema.sqlite";

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
      const databaseFile = process.env.DATABASE_FILE;
      const sqliteDb = new Database(databaseFile || ":memory:");
      contentDb = drizzleSqlite(sqliteDb, { schema: sqliteSchema });
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
 * Reset the memoised singleton.
 *
 * ONLY for use in tests — call this in beforeEach / afterEach to isolate
 * test cases that manipulate process.env.DATABASE_DIALECT.
 * Never call this in production code.
 */
export function __resetForTests(): void {
  contentDb = null;
}
