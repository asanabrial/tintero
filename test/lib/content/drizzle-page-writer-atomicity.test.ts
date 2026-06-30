/**
 * Atomicity contract for DrizzlePageWriter.
 *
 * Proves that a write method's multi-statement sequence is wrapped in a single
 * transaction: if a statement after the initial `content` (page) insert fails,
 * the WHOLE operation rolls back — no orphan content / content_meta rows.
 *
 * Pages have NO tags/categories/term_relationships, so the natural "later write"
 * to fault is the SEO `content_meta` insert that follows the page row insert.
 *
 * Fault injection: the libSQL client is wrapped in a Proxy that rejects a chosen
 * statement. It intercepts BOTH execute paths, because drizzle-orm/libsql routes
 * statements differently depending on context:
 *   - outside a transaction → client.execute(stmt)
 *   - inside  db.transaction → (await client.transaction()).execute(stmt)
 * Wrapping only client.execute would let the fixed (transactional) path slip past
 * the fault and give the test no teeth.
 *
 * Before the fix (sequential writes, no transaction) the page row auto-commits
 * before the failing statement → orphan row remains.
 * After the fix (withTransaction) the failing statement triggers ROLLBACK → PASS.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { drizzle } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";
import * as schema from "@/lib/content/schema.sqlite";
import { DrizzlePageWriter } from "@/lib/content/drizzle-page-writer";
import { makeTestContentDb, type TestContentDb } from "./make-test-content-db";
import { CONTENT_DDL } from "./content-ddl";

/**
 * Wrap a libSQL client so any statement whose SQL matches `shouldFail` rejects.
 * Intercepts client.execute AND the execute() of transaction objects returned by
 * client.transaction(), so the fault fires regardless of how drizzle issues it.
 */
function makeFaultingClient(real: Client, shouldFail: (sql: string) => boolean): Client {
  const sqlOf = (stmt: unknown): string =>
    typeof stmt === "string" ? stmt : ((stmt as { sql?: string })?.sql ?? "");

  const wrapExecute =
    (target: { execute: (stmt: unknown) => unknown }) =>
    (stmt: unknown): unknown => {
      if (shouldFail(sqlOf(stmt))) {
        return Promise.reject(new Error(`injected fault on: ${sqlOf(stmt)}`));
      }
      return target.execute(stmt);
    };

  const proxyTx = (tx: object): object =>
    new Proxy(tx, {
      get(t, prop, recv) {
        if (prop === "execute") return wrapExecute(t as { execute: (s: unknown) => unknown });
        const v = Reflect.get(t, prop, recv);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });

  return new Proxy(real, {
    get(target, prop, recv) {
      if (prop === "execute") return wrapExecute(target as unknown as { execute: (s: unknown) => unknown });
      if (prop === "transaction") {
        return async (...args: unknown[]) => {
          const tx = await (target.transaction as (...a: unknown[]) => Promise<object>)(...args);
          return proxyTx(tx);
        };
      }
      const v = Reflect.get(target, prop, recv);
      return typeof v === "function" ? v.bind(target) : v;
    },
  }) as Client;
}

describe("DrizzlePageWriter — write atomicity (transaction rollback)", () => {
  let inspectDb: TestContentDb;
  let realClient: Client;
  let closeDb: () => void;

  beforeEach(async () => {
    ({ db: inspectDb, client: realClient, cleanup: closeDb } = await makeTestContentDb(CONTENT_DDL));
  });

  afterEach(() => {
    closeDb();
  });

  async function countContent(): Promise<number> {
    const rows = await inspectDb.select().from(schema.content);
    return rows.length;
  }
  async function countMeta(): Promise<number> {
    const rows = await inspectDb.select().from(schema.content_meta);
    return rows.length;
  }

  /** Build a writer whose db fails on the chosen statement. */
  function faultingWriter(shouldFail: (sql: string) => boolean): DrizzlePageWriter {
    const faultDb = drizzle(makeFaultingClient(realClient, shouldFail), { schema });
    return new DrizzlePageWriter(faultDb, schema);
  }

  test("createPage rolls back the content row when the SEO content_meta insert fails", async () => {
    const writer = faultingWriter((sql) => /insert\s+into\s+["'`]?content_meta/i.test(sql));

    await expect(
      writer.createPage({
        title: "Atomic Page",
        date: "2026-01-01",
        status: "published",
        body: "Body text",
        seo: { metaDescription: "Custom SEO description" },
      })
    ).rejects.toThrow();

    // Nothing must persist: not the page row, not the meta row.
    expect(await countContent()).toBe(0);
    expect(await countMeta()).toBe(0);
  });

  test("successful createPage (no fault) commits exactly one content row + meta", async () => {
    const writer = faultingWriter(() => false); // never fails
    const result = await writer.createPage({
      title: "Happy Page",
      date: "2026-01-01",
      status: "published",
      body: "Body",
      seo: { metaDescription: "Stored SEO" },
    });
    expect(result.ok).toBe(true);
    expect(await countContent()).toBe(1);
    // The single SEO field (metaDescription) is stored as one content_meta row.
    expect(await countMeta()).toBe(1);
  });
});
