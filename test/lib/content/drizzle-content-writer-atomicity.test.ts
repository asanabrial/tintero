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
import { and, eq } from "drizzle-orm";
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

  /** A non-faulting writer (shares the same db file) for precondition setup. */
  function cleanWriter(): DrizzleContentWriter {
    return new DrizzleContentWriter(inspectDb, schema);
  }

  /** Fetch a post content row by slug (regardless of deleted_at), or null. */
  async function postBySlug(slug: string) {
    const rows = await inspectDb
      .select()
      .from(schema.content)
      .where(and(eq(schema.content.type, "post"), eq(schema.content.slug, slug)));
    return rows[0] ?? null;
  }

  /** Convenience: seed one live post and return its slug. */
  async function seedPost(overrides: Record<string, unknown> = {}): Promise<string> {
    const res = await cleanWriter().createPost({
      title: "Original Title",
      date: "2026-01-01",
      status: "published",
      body: "Original body",
      tags: ["keep"],
      categories: [],
      comments: true,
      ...overrides,
    } as Parameters<DrizzleContentWriter["createPost"]>[0]);
    expect(res.ok).toBe(true);
    return (res as { ok: true; slug: string }).slug;
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

  // ---------------------------------------------------------------------------
  // Additive contract: rollback atomicity for the remaining transactional methods.
  // Each seeds precondition state with a clean writer, injects a mid-sequence fault
  // with a faulting writer, and asserts the DB is unchanged (full rollback).
  // ---------------------------------------------------------------------------

  test("updatePost rolls back the content UPDATE when a later write fails", async () => {
    const slug = await seedPost({ tags: ["oldtag"] });
    const before = await postBySlug(slug);

    // Fault on the new term-relationship insert — fires AFTER the content UPDATE
    // and the old-relationship delete have run inside the transaction.
    const writer = faultingWriter((sql) =>
      /insert\s+into\s+["'`]?term_relationships/i.test(sql)
    );

    await expect(
      writer.updatePost(slug, {
        title: "Changed Title",
        date: "2026-02-02",
        status: "draft",
        body: "Changed body",
        tags: ["newtag"],
        categories: [],
        comments: false,
      })
    ).rejects.toThrow();

    const after = await postBySlug(slug);
    expect(after.title).toBe("Original Title");
    expect(after.status).toBe("published");
    expect(after.body_markdown).toBe(before.body_markdown);
    // The new term must not have leaked through.
    const newTerm = await inspectDb
      .select()
      .from(schema.terms)
      .where(eq(schema.terms.slug, "newtag"));
    expect(newTerm.length).toBe(0);
  });

  test("deletePost rolls back the cascade when the content delete fails", async () => {
    const slug = await seedPost({ tags: ["keep"] });
    const relsBefore = await countRelationships();

    // Fault on the content row delete — the term_relationships + content_meta
    // deletes ran first inside the transaction and must be restored on rollback.
    const writer = faultingWriter((sql) =>
      /delete\s+from\s+["'`]?content["'`]?\s+where/i.test(sql)
    );

    await expect(writer.deletePost(slug)).rejects.toThrow();

    expect(await postBySlug(slug)).not.toBeNull();
    expect(await countRelationships()).toBe(relsBefore);
  });

  test("setPostStatus rolls back (throws, status unchanged) when its update fails", async () => {
    const slug = await seedPost();

    const writer = faultingWriter((sql) =>
      /update\s+["'`]?content["'`]?\s+set/i.test(sql)
    );

    await expect(writer.setPostStatus(slug, "draft")).rejects.toThrow();

    const after = await postBySlug(slug);
    expect(after.status).toBe("published");
  });

  test("trashPost rolls back the deleted_at update when count reconciliation fails", async () => {
    const slug = await seedPost({ tags: ["keep"] });

    // Fault on the terms count UPDATE — fires AFTER the deleted_at UPDATE inside
    // the transaction, so a non-atomic trashPost would leave the post trashed.
    const writer = faultingWriter((sql) =>
      /update\s+["'`]?terms["'`]?\s+set/i.test(sql)
    );

    await expect(writer.trashPost(slug)).rejects.toThrow();

    const after = await postBySlug(slug);
    expect(after.deleted_at).toBeNull();
  });

  test("restorePost rolls back the deleted_at clear when count reconciliation fails", async () => {
    const slug = await seedPost({ tags: ["keep"] });
    expect((await cleanWriter().trashPost(slug)).ok).toBe(true);

    const writer = faultingWriter((sql) =>
      /update\s+["'`]?terms["'`]?\s+set/i.test(sql)
    );

    await expect(writer.restorePost(slug)).rejects.toThrow();

    const after = await postBySlug(slug);
    expect(after.deleted_at).not.toBeNull();
  });

  test("permanentlyDeletePost rolls back the cascade when the content delete fails", async () => {
    const slug = await seedPost({ tags: ["keep"] });
    expect((await cleanWriter().trashPost(slug)).ok).toBe(true);
    const relsBefore = await countRelationships();

    const writer = faultingWriter((sql) =>
      /delete\s+from\s+["'`]?content["'`]?\s+where/i.test(sql)
    );

    await expect(writer.permanentlyDeletePost(slug)).rejects.toThrow();

    // The trashed row and its relationships must survive the rollback.
    expect(await postBySlug(slug)).not.toBeNull();
    expect(await countRelationships()).toBe(relsBefore);
  });
});
