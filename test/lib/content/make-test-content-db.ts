/**
 * Centralized libSQL test-database factory for the content layer.
 *
 * Replaces the old per-file `new Database(":memory:")` + `drizzle-orm/bun-sqlite`
 * setup. Production runs SQLite through libSQL (see src/lib/content/db-factory.ts),
 * so tests use the same driver — including the async transaction path that the
 * atomicity tests depend on.
 *
 * Isolation model:
 *   libSQL's local client cannot share a *named* in-memory database (the `mode`
 *   URL parameter is rejected) and a bare ":memory:" opens a fresh connection per
 *   statement (tables vanish between calls). A unique temp file per call is the
 *   reliable isolation primitive — each call gets a fresh, independent database,
 *   mirroring the old `new Database(":memory:")` semantics.
 *
 * Cleanup model:
 *   On Windows the file lock lingers ~100ms after `client.close()`, so deleting
 *   each db file synchronously in afterEach would add ~100ms per test. Instead all
 *   db files live in ONE per-process temp directory that is removed in bulk at
 *   process exit, by which time every connection is closed and every lock is
 *   released. `cleanup()` only closes the client.
 */
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@/lib/content/schema.sqlite";

export type TestContentDb = LibSQLDatabase<typeof schema>;

export interface TestContentDbHandle {
  /** Drizzle instance wired to the sqlite schema bundle. */
  db: TestContentDb;
  /** Underlying libSQL client (exposed for executeMultiple / raw access). */
  client: Client;
  /** Closes the client. The backing file is removed in bulk at process exit. */
  cleanup: () => void;
}

// One temp directory per process holds every test db file. Removed on exit.
const ROOT = mkdtempSync(join(tmpdir(), "tintero-content-test-"));

let exitHookRegistered = false;
function registerExitCleanup(): void {
  if (exitHookRegistered) return;
  exitHookRegistered = true;
  process.on("exit", () => {
    try {
      rmSync(ROOT, { recursive: true, force: true });
    } catch {
      // Best-effort: a still-locked file leaves the OS temp dir to reap it.
    }
  });
}

let counter = 0;

/**
 * Create a fresh, isolated libSQL content database and apply the given DDL.
 *
 * @param ddl A (possibly multi-statement) SQL DDL string. Applied via the libSQL
 *            client's `executeMultiple`, which — unlike a single `db.run` — accepts
 *            several `;`-separated statements.
 */
export async function makeTestContentDb(ddl: string): Promise<TestContentDbHandle> {
  registerExitCleanup();
  const file = join(ROOT, `db-${process.pid}-${++counter}.db`);
  const client = createClient({ url: `file:${file}` });
  const db = drizzle(client, { schema });
  await client.executeMultiple(ddl);
  return {
    db,
    client,
    cleanup: () => client.close(),
  };
}
