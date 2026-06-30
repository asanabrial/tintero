/**
 * Atomicity contract for runBackfill.
 *
 * Proves that the full backfill write sequence (content upserts, term upserts,
 * relationship inserts, content_meta/SEO upserts, count reconciliation) is wrapped
 * in a single transaction: if any statement partway through fails, the WHOLE
 * backfill rolls back — no orphan content / term / relationship / meta rows.
 *
 * Fault injection: the libSQL client is wrapped in a Proxy that rejects a chosen
 * statement. It intercepts BOTH execute paths, because drizzle-orm/libsql routes
 * statements differently depending on context:
 *   - outside a transaction → client.execute(stmt)
 *   - inside  db.transaction → (await client.transaction()).execute(stmt)
 * Wrapping only client.execute would let the fixed (transactional) path slip past
 * the fault and give the test no teeth.
 *
 * Before the fix (sequential writes, no transaction) every content / term /
 * relationship row auto-commits before the failing content_meta insert → orphan
 * rows remain. After the fix (withTransaction) the failing statement triggers
 * ROLLBACK → the database is left completely empty.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { drizzle } from "drizzle-orm/libsql";
import type { Client } from "@libsql/client";
import * as schema from "@/lib/content/schema.sqlite";
import { runBackfill, type BackfillSource } from "@/lib/content/backfill";
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

/**
 * Minimal in-memory backfill source: one post carrying a tag, a category and SEO,
 * so the write sequence touches content, terms, term_relationships AND content_meta.
 */
function makeStubSource(): BackfillSource {
  return {
    async listPosts() {
      return {
        posts: [
          {
            slug: "atomic-post",
            title: "Atomic Post",
            date: "2024-01-01",
            status: "published" as const,
            tags: ["alpha"],
            categories: ["tech"],
            excerpt: "",
            html: "<p>body</p>",
            comments: false,
            sticky: false,
            author: "",
            visibility: "public" as const,
            seo: { metaDescription: "Custom SEO description" },
          },
        ],
        total: 1,
        totalPages: 1,
      };
    },
    async listPages() {
      return { pages: [], total: 0, totalPages: 1 };
    },
    async readRawPost(_slug: string) {
      return { body: "raw post body" };
    },
    async readRawPage(_slug: string) {
      return null;
    },
  } as unknown as BackfillSource;
}

describe("runBackfill — write atomicity (transaction rollback)", () => {
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
  async function countMeta(): Promise<number> {
    const rows = await inspectDb.select().from(schema.content_meta);
    return rows.length;
  }

  test("rolls back ALL writes when the SEO content_meta insert fails partway through", async () => {
    const faultDb = drizzle(
      makeFaultingClient(realClient, (sql) => /insert\s+into\s+["'`]?content_meta/i.test(sql)),
      { schema }
    );

    await expect(
      runBackfill({ source: makeStubSource(), db: faultDb, schema })
    ).rejects.toThrow();

    // The content row, the term rows and the relationship rows that were written
    // BEFORE the failing content_meta insert must ALL be rolled back.
    expect(await countContent()).toBe(0);
    expect(await countTerms()).toBe(0);
    expect(await countRelationships()).toBe(0);
    expect(await countMeta()).toBe(0);
  });

  test("successful backfill (no fault) commits the full corpus", async () => {
    const okDb = drizzle(makeFaultingClient(realClient, () => false), { schema });

    const report = await runBackfill({ source: makeStubSource(), db: okDb, schema });

    expect(report.posts).toBe(1);
    expect(await countContent()).toBe(1);
    // "alpha" tag + "tech" category = 2 terms and 2 relationships.
    expect(await countTerms()).toBe(2);
    expect(await countRelationships()).toBe(2);
    // The single SEO field (metaDescription) is stored as one content_meta row.
    expect(await countMeta()).toBe(1);
  });
});
