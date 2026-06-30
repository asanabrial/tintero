/**
 * Atomicity contract for DrizzleContentWriter.
 *
 * Proves that a write method's multi-statement sequence is wrapped in a single
 * transaction: if any statement after the initial `content` insert fails, the
 * WHOLE operation rolls back — no orphan content / term / relationship rows.
 *
 * Fault injection: the libSQL client is wrapped in a Proxy that rejects a chosen
 * statement. Crucially it intercepts BOTH execute paths, because drizzle-orm/libsql
 * routes statements differently depending on context:
 *   - outside a transaction → client.execute(stmt)
 *   - inside  db.transaction → (await client.transaction()).execute(stmt)
 * (see node_modules/drizzle-orm/libsql/session.js). Wrapping only client.execute
 * would let the fixed (transactional) path slip past the fault and give the test
 * no teeth.
 *
 * Before the fix (sequential writes, no transaction) the content row auto-commits
 * before the failing statement → these tests FAIL (orphan row remains).
 * After the fix (withTransaction) the failing statement triggers ROLLBACK → PASS.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { drizzle } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";
import * as schema from "@/lib/content/schema.sqlite";
import { DrizzleContentWriter } from "@/lib/content/drizzle-content-writer";
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

describe("DrizzleContentWriter — write atomicity (transaction rollback)", () => {
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
  async function countTerms(): Promise<number> {
    const rows = await inspectDb.select().from(schema.terms);
    return rows.length;
  }
  async function countRelationships(): Promise<number> {
    const rows = await inspectDb.select().from(schema.term_relationships);
    return rows.length;
  }

  /** Build a writer whose db fails on the chosen statement. */
  function faultingWriter(shouldFail: (sql: string) => boolean): DrizzleContentWriter {
    const faultDb = drizzle(makeFaultingClient(realClient, shouldFail), { schema });
    return new DrizzleContentWriter(faultDb, schema);
  }

  test("createPost rolls back the content row when the term-relationship insert fails", async () => {
    const writer = faultingWriter((sql) => /insert\s+into\s+["'`]?term_relationships/i.test(sql));

    await expect(
      writer.createPost({
        title: "Atomic Post",
        date: "2026-01-01",
        status: "published",
        body: "Body text",
        tags: ["atomicity"],
        categories: [],
        comments: true,
      })
    ).rejects.toThrow();

    // Nothing must persist: not the content row, not the term, not the relationship.
    expect(await countContent()).toBe(0);
    expect(await countTerms()).toBe(0);
    expect(await countRelationships()).toBe(0);
  });

  test("createPost rolls back when SEO content_meta insert fails", async () => {
    const writer = faultingWriter((sql) => /insert\s+into\s+["'`]?content_meta/i.test(sql));

    await expect(
      writer.createPost({
        title: "Seo Post",
        date: "2026-01-01",
        status: "published",
        body: "Body",
        tags: ["t1"],
        categories: [],
        comments: true,
        seo: { metaDescription: "Custom SEO description" },
      })
    ).rejects.toThrow();

    expect(await countContent()).toBe(0);
    expect(await countTerms()).toBe(0);
  });

  test("successful createPost (no fault) commits exactly one content row", async () => {
    const writer = faultingWriter(() => false); // never fails
    const result = await writer.createPost({
      title: "Happy Path",
      date: "2026-01-01",
      status: "published",
      body: "Body",
      tags: ["ok"],
      categories: [],
      comments: true,
    });
    expect(result.ok).toBe(true);
    expect(await countContent()).toBe(1);
    // 2 relationships: the "ok" tag + the auto-assigned "uncategorized" category
    // (createPost defaults empty categories to "uncategorized", WordPress parity).
    expect(await countRelationships()).toBe(2);
  });
});
