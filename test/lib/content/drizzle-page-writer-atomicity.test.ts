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
import { and, eq } from "drizzle-orm";
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

  /** A non-faulting writer (shares the same db file) for precondition setup. */
  function cleanWriter(): DrizzlePageWriter {
    return new DrizzlePageWriter(inspectDb, schema);
  }

  /** Fetch a page content row by slug (regardless of deleted_at), or null. */
  async function pageBySlug(slug: string) {
    const rows = await inspectDb
      .select()
      .from(schema.content)
      .where(and(eq(schema.content.type, "page"), eq(schema.content.slug, slug)));
    return rows[0] ?? null;
  }

  /** Fetch all content_meta rows for a content id. */
  async function metaFor(contentId: string) {
    return inspectDb
      .select()
      .from(schema.content_meta)
      .where(eq(schema.content_meta.content_id, contentId));
  }

  /** Convenience: seed one live page (with one SEO field) and return its slug. */
  async function seedPage(overrides: Record<string, unknown> = {}): Promise<string> {
    const res = await cleanWriter().createPage({
      title: "Original Page",
      date: "2026-01-01",
      status: "published",
      body: "Original body",
      seo: { metaDescription: "Old SEO" },
      ...overrides,
    } as Parameters<DrizzlePageWriter["createPage"]>[0]);
    expect(res.ok).toBe(true);
    return (res as { ok: true; slug: string }).slug;
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

  // ---------------------------------------------------------------------------
  // Additive contract: rollback atomicity for the remaining transactional methods.
  // Each seeds precondition state with a clean writer, injects a mid-sequence fault
  // with a faulting writer, and asserts the DB is unchanged (full rollback).
  // ---------------------------------------------------------------------------

  test("updatePage rolls back the content UPDATE when the SEO meta insert fails", async () => {
    const slug = await seedPage();
    const before = await pageBySlug(slug);

    // Fault on the new SEO content_meta insert — fires AFTER the content UPDATE
    // and the old-meta delete have run inside the transaction.
    const writer = faultingWriter((sql) =>
      /insert\s+into\s+["'`]?content_meta/i.test(sql)
    );

    await expect(
      writer.updatePage(slug, {
        title: "Changed Page",
        date: "2026-02-02",
        status: "draft",
        body: "Changed body",
        seo: { metaDescription: "New SEO" },
      })
    ).rejects.toThrow();

    const after = await pageBySlug(slug);
    expect(after.title).toBe("Original Page");
    expect(after.status).toBe("published");
    expect(after.body_markdown).toBe(before.body_markdown);
    // Old SEO meta must survive (the in-transaction delete rolled back too).
    const meta = await metaFor(after.id);
    expect(meta.length).toBe(1);
    expect(meta[0].meta_value).toBe("Old SEO");
  });

  test("deletePage rolls back the cascade when the content delete fails", async () => {
    const slug = await seedPage();
    const row = await pageBySlug(slug);

    // Fault on the content row delete — the content_meta delete ran first inside
    // the transaction and must be restored on rollback.
    const writer = faultingWriter((sql) =>
      /delete\s+from\s+["'`]?content["'`]?\s+where/i.test(sql)
    );

    await expect(writer.deletePage(slug)).rejects.toThrow();

    expect(await pageBySlug(slug)).not.toBeNull();
    expect((await metaFor(row.id)).length).toBe(1);
  });

  test("setPageStatus rolls back (throws, status unchanged) when its update fails", async () => {
    const slug = await seedPage();

    const writer = faultingWriter((sql) =>
      /update\s+["'`]?content["'`]?\s+set/i.test(sql)
    );

    await expect(writer.setPageStatus(slug, "draft")).rejects.toThrow();

    const after = await pageBySlug(slug);
    expect(after.status).toBe("published");
  });

  test("trashPage rolls back (throws, page stays live) when its update fails", async () => {
    const slug = await seedPage();

    const writer = faultingWriter((sql) =>
      /update\s+["'`]?content["'`]?\s+set/i.test(sql)
    );

    await expect(writer.trashPage(slug)).rejects.toThrow();

    const after = await pageBySlug(slug);
    expect(after.deleted_at).toBeNull();
  });

  test("restorePage rolls back (throws, page stays trashed) when its update fails", async () => {
    const slug = await seedPage();
    expect((await cleanWriter().trashPage(slug)).ok).toBe(true);

    const writer = faultingWriter((sql) =>
      /update\s+["'`]?content["'`]?\s+set/i.test(sql)
    );

    await expect(writer.restorePage(slug)).rejects.toThrow();

    const after = await pageBySlug(slug);
    expect(after.deleted_at).not.toBeNull();
  });

  test("permanentlyDeletePage rolls back the cascade when the content delete fails", async () => {
    const slug = await seedPage();
    expect((await cleanWriter().trashPage(slug)).ok).toBe(true);
    const row = await pageBySlug(slug);

    const writer = faultingWriter((sql) =>
      /delete\s+from\s+["'`]?content["'`]?\s+where/i.test(sql)
    );

    await expect(writer.permanentlyDeletePage(slug)).rejects.toThrow();

    // The trashed row and its meta must survive the rollback.
    expect(await pageBySlug(slug)).not.toBeNull();
    expect((await metaFor(row.id)).length).toBe(1);
  });
});
