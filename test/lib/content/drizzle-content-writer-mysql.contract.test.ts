/**
 * DrizzleContentWriter + atomicity + collation, run against a LIVE MySQL server.
 *
 * This is the slice-S4 proof that the WRITE path genuinely works on MySQL:
 *   1. The full shared ContentWriter contract (create/update/delete/trash/
 *      restore/setStatus) — exercises upsertTerm → ON DUPLICATE KEY UPDATE →
 *      SELECT id by natural key (db-upsert.ts mysql path), term_relationships
 *      insertIgnore, SEO meta upsert, and the live_slug_key generated column on
 *      create/trash/restore.
 *   2. terms.count trash/restore + reconciliation (DB-specific).
 *   3. Collation parity: slugs differing only in case are DISTINCT live rows
 *      (proves the utf8mb4_bin override fixed MySQL's case-insensitive default),
 *      while same-case duplicates are still rejected.
 *   4. Write atomicity: a fault injected mid-transaction rolls back the whole
 *      write (no orphan content/term/relationship rows), via a drizzle-mysql2
 *      transaction-level fault proxy.
 *
 * GATING: skipped entirely unless MYSQL_TEST_URL is set. Run with, e.g.:
 *   MYSQL_TEST_URL="mysql://root:tintero@127.0.0.1:3307/tintero" \
 *     bun test test/lib/content/drizzle-content-writer-mysql.contract.test.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { and, eq } from "drizzle-orm";
import { DrizzleContentAdapter } from "@/lib/content/drizzle-adapter";
import { DrizzleContentWriter } from "@/lib/content/drizzle-content-writer";
import { newId } from "@/lib/content/db-values";
import {
  runContentWriterContract,
  type WriterHarness,
} from "./content-writer-contract";
import {
  MYSQL_TEST_URL,
  getMysqlTestDb,
  truncateAllContentTables,
  mysqlSchema as schema,
  type TestMysqlDb,
} from "./make-test-mysql-db";

// ============================================================
// Site YAML (minimal — enough for getSiteConfig)
// ============================================================

function buildSiteYaml(): string {
  return (
    [
      'title: "Test Site"',
      'description: ""',
      'baseUrl: "http://localhost:3000"',
      "language: en",
      "author:",
      '  name: "Test Author"',
      "reading:",
      "  homepage: latest-posts",
      "  posts_per_page: 10",
      "comments:",
      "  enabled: false",
      "  moderation: manual",
    ].join("\n") + "\n"
  );
}

// ============================================================
// Writer harness factory (live MySQL)
// ============================================================

async function makeMysqlWriterHarness(): Promise<WriterHarness> {
  const { db } = await getMysqlTestDb();
  await truncateAllContentTables(db);

  const tmpBase = await fs.mkdtemp(
    path.join(os.tmpdir(), "tintero-mysql-writer-")
  );
  const configDir = path.join(tmpBase, "config");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, "site.yaml"), buildSiteYaml(), "utf-8");
  await fs.writeFile(
    path.join(configDir, "taxonomies.yaml"),
    "tags: []\ncategories: []\n",
    "utf-8"
  );

  const writer = new DrizzleContentWriter(db, schema);
  const reader = new DrizzleContentAdapter(db, configDir, schema);

  return {
    writer,
    reader,
    async cleanup(): Promise<void> {
      await fs.rm(tmpBase, { recursive: true, force: true });
    },
  };
}

// ============================================================
// Drizzle-mysql2 transaction-level fault injection
//
// The libSQL atomicity test wraps the @libsql client; mysql2's driver is
// different, so we inject at the drizzle layer instead: wrap the db so that
// `transaction(cb)` runs the REAL transaction but hands the callback a proxied
// tx whose `.insert(targetTable)` throws. drizzle catches the throw, issues
// ROLLBACK, and re-throws — proving the whole write is atomic on MySQL/InnoDB.
// ============================================================

function faultingTx(tx: TestMysqlDb, targetTable: unknown): TestMysqlDb {
  return new Proxy(tx as object, {
    get(t, prop, recv) {
      if (prop === "insert") {
        return (table: unknown) => {
          if (table === targetTable) {
            throw new Error("injected fault: insert into target table");
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (t as any).insert(table);
        };
      }
      const v = Reflect.get(t, prop, recv);
      return typeof v === "function" ? v.bind(t) : v;
    },
  }) as TestMysqlDb;
}

function makeFaultingMysqlDb(
  db: TestMysqlDb,
  targetTable: unknown
): TestMysqlDb {
  return new Proxy(db as object, {
    get(target, prop, recv) {
      if (prop === "transaction") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (cb: (tx: any) => Promise<unknown>, ...rest: unknown[]) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (target as any).transaction(
            (tx: TestMysqlDb) => cb(faultingTx(tx, targetTable)),
            ...rest
          );
      }
      const v = Reflect.get(target, prop, recv);
      return typeof v === "function" ? v.bind(target) : v;
    },
  }) as TestMysqlDb;
}

// ============================================================
// Helpers
// ============================================================

async function getTermCount(
  db: TestMysqlDb,
  taxonomy: string,
  label: string
): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Array<{ count: number }> = await (db as any)
    .select({ count: schema.terms.count })
    .from(schema.terms)
    .where(and(eq(schema.terms.taxonomy, taxonomy), eq(schema.terms.label, label)))
    .limit(1);
  return rows.length > 0 ? rows[0].count : null;
}

// ============================================================
// Suite (gated on MYSQL_TEST_URL)
// ============================================================

if (MYSQL_TEST_URL) {
  // 1. Full shared writer contract against live MySQL.
  runContentWriterContract("DrizzleContentWriter (live MySQL)", makeMysqlWriterHarness);

  // 2. terms.count lifecycle (DB-specific — mirrors the sqlite writer test).
  describe("DrizzleContentWriter (live MySQL) — terms.count lifecycle", () => {
    let db: TestMysqlDb;
    let writer: DrizzleContentWriter;

    beforeEach(async () => {
      ({ db } = await getMysqlTestDb());
      await truncateAllContentTables(db);
      writer = new DrizzleContentWriter(db, schema);
    });

    test("trashPost drops terms live count; restorePost restores it", async () => {
      const post = await writer.createPost({
        title: "Count Trash Test",
        date: "2024-09-01",
        status: "published",
        tags: ["x", "y"],
        categories: [],
        comments: false,
        body: "body",
      });
      expect(post.ok).toBe(true);
      if (!post.ok) return;

      expect(await getTermCount(db, "tag", "x")).toBe(1);
      expect(await getTermCount(db, "tag", "y")).toBe(1);

      const trashResult = await writer.trashPost(post.slug);
      expect(trashResult.ok).toBe(true);
      expect(await getTermCount(db, "tag", "x")).toBe(0);
      expect(await getTermCount(db, "tag", "y")).toBe(0);

      const restoreResult = await writer.restorePost(post.slug);
      expect(restoreResult.ok).toBe(true);
      expect(await getTermCount(db, "tag", "x")).toBe(1);
      expect(await getTermCount(db, "tag", "y")).toBe(1);
    });

    test("terms.count is reconciled across create / delete / update", async () => {
      const post1 = await writer.createPost({
        title: "Post One",
        date: "2024-08-01",
        status: "published",
        tags: ["a", "b"],
        categories: [],
        comments: false,
        body: "body one",
      });
      expect(post1.ok).toBe(true);
      if (!post1.ok) return;
      expect(await getTermCount(db, "tag", "a")).toBe(1);
      expect(await getTermCount(db, "tag", "b")).toBe(1);

      const post2 = await writer.createPost({
        title: "Post Two",
        date: "2024-08-02",
        status: "published",
        tags: ["a"],
        categories: [],
        comments: false,
        body: "body two",
      });
      expect(post2.ok).toBe(true);
      if (!post2.ok) return;
      expect(await getTermCount(db, "tag", "a")).toBe(2);

      const del = await writer.deletePost(post1.slug);
      expect(del.ok).toBe(true);
      expect(await getTermCount(db, "tag", "a")).toBe(1);
      expect(await getTermCount(db, "tag", "b")).toBe(0);

      const update = await writer.updatePost(post2.slug, {
        title: "Post Two",
        date: "2024-08-02",
        status: "published",
        tags: [],
        categories: [],
        comments: false,
        body: "body two updated",
      });
      expect(update.ok).toBe(true);
      expect(await getTermCount(db, "tag", "a")).toBe(0);
    });
  });

  // 3. Collation parity — the slug-uniqueness case-sensitivity proof.
  describe("DrizzleContentWriter (live MySQL) — slug collation parity", () => {
    let db: TestMysqlDb;

    beforeEach(async () => {
      ({ db } = await getMysqlTestDb());
      await truncateAllContentTables(db);
    });

    function contentRow(id: string, slug: string) {
      return {
        id,
        type: "post",
        slug,
        title: "t",
        status: "published",
        visibility: "public",
        password: null,
        body_markdown: "b",
        excerpt: null,
        cover_image: null,
        author_label: null,
        author_id: null,
        sticky: 0,
        comments_enabled: 0,
        parent_id: null,
        menu_order: 0,
        published_at: 1,
        created_at: 1,
        updated_at: 1,
        deleted_at: null,
      };
    }

    test("two live slugs differing only in case are DISTINCT (utf8mb4_bin)", async () => {
      // On MySQL's default utf8mb4_0900_ai_ci this collides; the collation
      // override makes the live_slug_key unique index byte-exact like sqlite/pg.
      await db.insert(schema.content).values(contentRow(newId(), "foo"));
      await db.insert(schema.content).values(contentRow(newId(), "Foo"));

      const rows = await db
        .select({ slug: schema.content.slug })
        .from(schema.content);
      const slugs = rows.map((r) => r.slug).sort();
      expect(slugs).toEqual(["Foo", "foo"]);
    });

    test("two live rows with the SAME slug are still rejected", async () => {
      await db.insert(schema.content).values(contentRow(newId(), "dup"));
      // Manual try/catch instead of expect().rejects: the rejection is a
      // DrizzleQueryError whose object graph is huge, and feeding it through
      // bun's .rejects matcher serializes it and stalls. A boolean flag keeps
      // this fast and deterministic.
      let threw = false;
      try {
        await db.insert(schema.content).values(contentRow(newId(), "dup"));
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });
  });

  // 4. Write atomicity — transaction rollback on injected fault.
  describe("DrizzleContentWriter (live MySQL) — write atomicity", () => {
    let db: TestMysqlDb;

    beforeEach(async () => {
      ({ db } = await getMysqlTestDb());
      await truncateAllContentTables(db);
    });

    async function countContent(): Promise<number> {
      const rows = await db.select().from(schema.content);
      return rows.length;
    }
    async function countTerms(): Promise<number> {
      const rows = await db.select().from(schema.terms);
      return rows.length;
    }
    async function countRelationships(): Promise<number> {
      const rows = await db.select().from(schema.term_relationships);
      return rows.length;
    }

    test("createPost rolls back content + term when the relationship insert fails", async () => {
      const faultDb = makeFaultingMysqlDb(db, schema.term_relationships);
      const writer = new DrizzleContentWriter(faultDb, schema);

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

      expect(await countContent()).toBe(0);
      expect(await countTerms()).toBe(0);
      expect(await countRelationships()).toBe(0);
    });

    test("createPost rolls back when the SEO content_meta insert fails", async () => {
      const faultDb = makeFaultingMysqlDb(db, schema.content_meta);
      const writer = new DrizzleContentWriter(faultDb, schema);

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

    test("successful createPost commits exactly one content row", async () => {
      const writer = new DrizzleContentWriter(db, schema);
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
      // 2 relationships: the "ok" tag + the auto-assigned "uncategorized" category.
      expect(await countRelationships()).toBe(2);
    });
  });
} else {
  describe.skip(
    "DrizzleContentWriter (live MySQL) — skipped: MYSQL_TEST_URL unset",
    () => {
      test("requires MYSQL_TEST_URL", () => {});
    }
  );
}
