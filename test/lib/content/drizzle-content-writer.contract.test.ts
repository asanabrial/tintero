/**
 * DrizzleContentWriter wired into the shared ContentWriter contract suite.
 *
 * Uses an in-memory bun:sqlite database with the DDL from drizzle-content-repository.contract.test.ts.
 * The DrizzleContentAdapter (reader) is wired to the same DB so writes are
 * immediately visible through the read path.
 *
 * GREEN gate: all contract scenarios must pass. The FS contract (fs-content-writer.contract.test.ts)
 * characterizes what each scenario expects; passing both proves parity.
 *
 * To run only this file:
 *   bun test test/lib/content/drizzle-content-writer.contract.test.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { and, eq } from "drizzle-orm";
import * as schema from "@/lib/content/schema.sqlite";
import { DrizzleContentAdapter } from "@/lib/content/drizzle-adapter";
import { DrizzleContentWriter } from "@/lib/content/drizzle-content-writer";
import { runContentWriterContract, type WriterHarness } from "./content-writer-contract";

// ============================================================
// DDL — identical to drizzle-content-repository.contract.test.ts
// ============================================================

const DDL = `
CREATE TABLE IF NOT EXISTS content (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  visibility TEXT NOT NULL,
  password TEXT,
  body_markdown TEXT NOT NULL,
  excerpt TEXT,
  cover_image TEXT,
  author_label TEXT,
  author_id TEXT,
  sticky INTEGER NOT NULL,
  comments_enabled INTEGER NOT NULL,
  parent_id TEXT,
  menu_order INTEGER NOT NULL,
  published_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_type_slug
  ON content (type, slug);

CREATE INDEX IF NOT EXISTS idx_content_type_status_published_at_id
  ON content (type, status, published_at, id);

CREATE INDEX IF NOT EXISTS idx_content_type_status
  ON content (type, status);

CREATE INDEX IF NOT EXISTS idx_content_parent_id
  ON content (parent_id);

CREATE INDEX IF NOT EXISTS idx_content_author_id
  ON content (author_id);

CREATE INDEX IF NOT EXISTS idx_content_deleted_at
  ON content (deleted_at);

CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY,
  taxonomy TEXT NOT NULL,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  parent_id TEXT,
  description_markdown TEXT,
  count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_terms_taxonomy_slug
  ON terms (taxonomy, slug);

CREATE INDEX IF NOT EXISTS idx_terms_parent_id
  ON terms (parent_id);

CREATE TABLE IF NOT EXISTS term_relationships (
  content_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  PRIMARY KEY (content_id, term_id)
);

CREATE INDEX IF NOT EXISTS idx_term_rel_content_id
  ON term_relationships (content_id);

CREATE INDEX IF NOT EXISTS idx_term_rel_term_id
  ON term_relationships (term_id);

CREATE TABLE IF NOT EXISTS content_meta (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  meta_key TEXT NOT NULL,
  meta_value TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_meta_content_id_meta_key
  ON content_meta (content_id, meta_key);
`;

// ============================================================
// Site YAML helpers (minimal — enough for getSiteConfig)
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
// Harness factory
// ============================================================

async function makeDrizzleWriterHarness(): Promise<WriterHarness> {
  const sqliteDb = new Database(":memory:");
  sqliteDb.exec(DDL);
  const db = drizzle(sqliteDb, { schema });

  const tmpBase = await fs.mkdtemp(
    path.join(os.tmpdir(), "tintero-drizzle-writer-contract-")
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
  // Reader shares the same in-memory DB: writes are immediately visible.
  const reader = new DrizzleContentAdapter(db, configDir, schema);

  return {
    writer,
    reader,
    async cleanup(): Promise<void> {
      sqliteDb.close();
      await fs.rm(tmpBase, { recursive: true, force: true });
    },
  };
}

// ============================================================
// Run contract
// ============================================================

runContentWriterContract("DrizzleContentWriter", makeDrizzleWriterHarness);

// ============================================================
// FIX 3 (W3): terms.count reconciliation — DB-writer-specific
// ============================================================
//
// reconcileTermCounts is called by createPost / updatePost / deletePost but
// was not previously exercised by any test. These scenarios guard the count
// maintenance logic that would allow a future O(terms) optimisation to read
// terms.count directly instead of joining through term_relationships.

/** Read terms.count for the term matching (taxonomy, label). Returns null when absent. */
async function getTermCount(
  db: ReturnType<typeof drizzle>,
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

describe("DrizzleContentWriter — terms.count reconciliation (DB-specific)", () => {
  let sqliteDb: InstanceType<typeof Database>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: ReturnType<typeof drizzle<any>>;
  let writer: DrizzleContentWriter;

  beforeEach(() => {
    sqliteDb = new Database(":memory:");
    sqliteDb.exec(DDL);
    db = drizzle(sqliteDb, { schema });
    writer = new DrizzleContentWriter(db, schema);
  });

  afterEach(() => {
    sqliteDb.close();
  });

  test("terms.count is correctly reconciled across create / delete / update", async () => {
    // --- Step 1: createPost with tags ["a", "b"] ---
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

    // --- Step 2: second post also tagged "a" → a.count becomes 2 ---
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
    expect(await getTermCount(db, "tag", "b")).toBe(1);

    // --- Step 3: deletePost(post1) → a.count=1, b.count=0 ---
    const del = await writer.deletePost(post1.slug);
    expect(del.ok).toBe(true);

    expect(await getTermCount(db, "tag", "a")).toBe(1);
    // b had only one post (post1); after deletion its count must be 0
    expect(await getTermCount(db, "tag", "b")).toBe(0);

    // --- Step 4: updatePost(post2) removing tag "a" → a.count=0 ---
    const update = await writer.updatePost(post2.slug, {
      title: "Post Two",
      date: "2024-08-02",
      status: "published",
      tags: [], // "a" removed
      categories: [],
      comments: false,
      body: "body two updated",
    });
    expect(update.ok).toBe(true);

    // term "a" is now unreferenced — count must be 0
    expect(await getTermCount(db, "tag", "a")).toBe(0);
  });
});
