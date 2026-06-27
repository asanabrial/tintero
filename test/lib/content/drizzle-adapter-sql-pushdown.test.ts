/**
 * SQL pushdown proof tests for DrizzleContentAdapter.
 *
 * These tests prove that listPosts / listPages push structural filters and
 * pagination into SQL — they do NOT load the whole corpus into TypeScript.
 *
 * Mechanism: a thin wrapper around the bun:sqlite Database intercepts every
 * prepared statement and throws a "SQL pushdown assertion" error if a query
 * that selects body_markdown returns more rows than the per-page limit.
 * The OLD fetch-all-then-filter-in-TS code hits this limit; the SQL-pushdown
 * code returns only pageSize rows and passes cleanly.
 *
 * To run only this file:
 *   bun test test/lib/content/drizzle-adapter-sql-pushdown.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as schema from "@/lib/content/schema.sqlite";
import { DrizzleContentAdapter } from "@/lib/content/drizzle-adapter";
import { newId, toEpoch, nowEpoch } from "@/lib/content/db-values";

// ---------------------------------------------------------------------------
// DDL (mirrors drizzle-content-repository.contract.test.ts exactly)
// ---------------------------------------------------------------------------

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

CREATE INDEX IF NOT EXISTS idx_content_meta_content_id_meta_key
  ON content_meta (content_id, meta_key);
`;

// ---------------------------------------------------------------------------
// Row-limit database wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a bun:sqlite Database so that any prepared statement which:
 *   (a) selects body_markdown from the content table, AND
 *   (b) returns more than maxBodyRows rows
 * throws a descriptive error.
 *
 * The OLD fetch-all-then-filter code hits this limit (returns all N rows);
 * the SQL-pushdown code applies LIMIT in SQL and passes cleanly.
 *
 * Both .all() and .values() are intercepted because drizzle uses .values()
 * for field-mapped selects (the new explicit-column select path) and .all()
 * for schema-wide selects (the old select() path).
 */
function createRowLimitDb(
  rawDb: Database,
  maxBodyRows: number
): ReturnType<typeof drizzle> {
  const wrappedClient = {
    prepare(sql: string) {
      const stmt = rawDb.prepare(sql);

      // A query is a "full body fetch" if it selects body_markdown (full post
      // content) and is not a COUNT aggregate. The wikiResolver and terms
      // queries are excluded because they don't select body_markdown.
      const sqlLower = sql.toLowerCase();
      const isFullBodyFetch =
        sql.includes("body_markdown") && !sqlLower.includes("count(");

      return {
        all(...args: Parameters<typeof stmt.all>) {
          const rows = stmt.all(...args) as unknown[];
          if (isFullBodyFetch && rows.length > maxBodyRows) {
            throw new Error(
              `SQL pushdown assertion violated: a body_markdown query returned ` +
                `${rows.length} rows (limit: ${maxBodyRows}). ` +
                `This indicates the OLD fetch-all-then-filter-in-TS pattern. ` +
                `Apply SQL LIMIT so only the requested page is loaded.`
            );
          }
          return rows;
        },
        values(...args: Parameters<typeof stmt.values>) {
          const rows = stmt.values(...args) as unknown[];
          if (isFullBodyFetch && rows.length > maxBodyRows) {
            throw new Error(
              `SQL pushdown assertion violated: a body_markdown query returned ` +
                `${rows.length} rows (limit: ${maxBodyRows}). ` +
                `Apply SQL LIMIT to prevent corpus scan.`
            );
          }
          return rows;
        },
        run: (...args: Parameters<typeof stmt.run>) => stmt.run(...args),
        get: (...args: Parameters<typeof stmt.get>) => stmt.get(...args),
      };
    },
    exec: rawDb.exec.bind(rawDb),
    transaction: rawDb.transaction.bind(rawDb),
    close: rawDb.close.bind(rawDb),
  };

  // Cast to Database: the wrapped client satisfies drizzle's duck-typed
  // interface (exec + prepare), even though it is not a real Database instance.
  return drizzle(wrappedClient as unknown as Database, { schema });
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const SEED_BASE_EPOCH = toEpoch("2024-01-01");
const DAY_MS = 86400000;

interface SeedPostRow {
  slug: string;
  status?: "published" | "draft";
  authorLabel?: string;
  tagSlug?: string;
  catSlug?: string;
}

async function seedPostRows(
  db: ReturnType<typeof drizzle>,
  rows: SeedPostRow[]
): Promise<void> {
  const now = nowEpoch();
  const termIdMap = new Map<string, string>(); // "taxonomy:slug" → id

  async function getOrCreateTerm(taxonomy: string, slug: string): Promise<string> {
    const key = `${taxonomy}:${slug}`;
    const existing = termIdMap.get(key);
    if (existing !== undefined) return existing;
    const id = newId();
    await db.insert(schema.terms).values({
      id,
      taxonomy,
      slug,
      label: slug,
      parent_id: null,
      description_markdown: null,
      count: 0,
      created_at: now,
      updated_at: now,
    });
    termIdMap.set(key, id);
    return id;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const contentId = newId();
    await db.insert(schema.content).values({
      id: contentId,
      type: "post",
      slug: row.slug,
      title: `Post ${row.slug}`,
      status: row.status ?? "published",
      visibility: "public",
      password: null,
      body_markdown: `Body for ${row.slug}`,
      excerpt: null,
      cover_image: null,
      author_label: row.authorLabel ?? "DefaultAuthor",
      author_id: null,
      sticky: 0,
      comments_enabled: 0,
      parent_id: null,
      menu_order: 0,
      published_at: SEED_BASE_EPOCH - i * DAY_MS,
      created_at: now,
      updated_at: now,
    });

    if (row.tagSlug) {
      const termId = await getOrCreateTerm("tag", row.tagSlug);
      await db.insert(schema.term_relationships).values({
        content_id: contentId,
        term_id: termId,
      });
    }

    if (row.catSlug) {
      const termId = await getOrCreateTerm("category", row.catSlug);
      await db.insert(schema.term_relationships).values({
        content_id: contentId,
        term_id: termId,
      });
    }
  }
}

async function seedPageRows(
  db: ReturnType<typeof drizzle>,
  count: number,
  status: "published" | "draft" = "published"
): Promise<void> {
  const now = nowEpoch();
  for (let i = 0; i < count; i++) {
    await db.insert(schema.content).values({
      id: newId(),
      type: "page",
      slug: `page-${i}`,
      title: `Page ${i}`,
      status,
      visibility: "public",
      password: null,
      body_markdown: `Body for page ${i}`,
      excerpt: null,
      cover_image: null,
      author_label: null,
      author_id: null,
      sticky: 0,
      comments_enabled: 0,
      parent_id: null,
      menu_order: i,
      published_at: SEED_BASE_EPOCH - i * DAY_MS,
      created_at: now,
      updated_at: now,
    });
  }
}

function buildSiteYaml(): string {
  return [
    `title: "Pushdown Test Site"`,
    `description: "Pushdown tests"`,
    `baseUrl: "http://localhost:3000"`,
    `language: en`,
    `author:`,
    `  name: "Test Author"`,
    `reading:`,
    `  homepage: latest-posts`,
    `  posts_per_page: 10`,
    `comments:`,
    `  enabled: false`,
    `  moderation: manual`,
  ].join("\n") + "\n";
}

function buildTaxonomiesYaml(): string {
  return "tags: []\ncategories: []\n";
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("DrizzleContentAdapter — SQL pushdown proofs", () => {
  let rawDb: Database;
  let seedDb: ReturnType<typeof drizzle>;
  let configDir: string;
  let tmpBase: string;

  const PAGE_SIZE = 10;
  const CORPUS_SIZE = 200;
  // Row limit: allow up to 2× pageSize to account for any edge cases,
  // but the old fetch-all code would return CORPUS_SIZE (200) rows —
  // well above this limit — and should be caught.
  const MAX_BODY_ROWS = PAGE_SIZE * 2;

  beforeAll(async () => {
    rawDb = new Database(":memory:");
    rawDb.exec(DDL);
    seedDb = drizzle(rawDb, { schema });

    tmpBase = await fs.mkdtemp(
      path.join(os.tmpdir(), "tintero-pushdown-")
    );
    configDir = path.join(tmpBase, "config");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, "site.yaml"), buildSiteYaml(), "utf-8");
    await fs.writeFile(path.join(configDir, "taxonomies.yaml"), buildTaxonomiesYaml(), "utf-8");

    // Seed CORPUS_SIZE published posts (no special tags/categories by default)
    const postRows: SeedPostRow[] = [];
    for (let i = 0; i < CORPUS_SIZE; i++) {
      postRows.push({ slug: `post-bulk-${i}` });
    }
    await seedPostRows(seedDb, postRows);

    // Seed additional tagged posts: only 5 with "rare-tag"
    const taggedRows: SeedPostRow[] = [];
    for (let i = 0; i < 5; i++) {
      taggedRows.push({ slug: `post-tagged-${i}`, tagSlug: "rare-tag" });
    }
    await seedPostRows(seedDb, taggedRows);

    // Seed additional categorised posts: 5 under "special-cat", 3 under "special-cat/sub"
    const catRows: SeedPostRow[] = [];
    for (let i = 0; i < 5; i++) {
      catRows.push({ slug: `post-cat-root-${i}`, catSlug: "special-cat" });
    }
    for (let i = 0; i < 3; i++) {
      catRows.push({ slug: `post-cat-sub-${i}`, catSlug: "special-cat/sub" });
    }
    await seedPostRows(seedDb, catRows);

    // Seed additional posts by a specific author: 10 posts by "TargetAuthor"
    const authorRows: SeedPostRow[] = [];
    for (let i = 0; i < 10; i++) {
      authorRows.push({ slug: `post-author-${i}`, authorLabel: "TargetAuthor" });
    }
    await seedPostRows(seedDb, authorRows);

    // Seed 200 published pages (for listPages pushdown proof)
    await seedPageRows(seedDb, CORPUS_SIZE);
  });

  afterAll(async () => {
    rawDb.close();
    await fs.rm(tmpBase, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 1. listPosts — page query LIMIT proof
  // -------------------------------------------------------------------------

  test("listPosts page=1 with 200+ posts: body_markdown query returns ≤ pageSize rows (SQL LIMIT applied)", async () => {
    // The row-limit db throws if any body_markdown query returns more than
    // MAX_BODY_ROWS rows. The OLD fetch-all code returns 200+ rows and fails;
    // the SQL-pushdown code returns exactly pageSize rows and passes.
    const limitDb = createRowLimitDb(rawDb, MAX_BODY_ROWS);
    const adapter = new DrizzleContentAdapter(limitDb, configDir, schema);

    const result = await adapter.listPosts({
      pageSize: PAGE_SIZE,
      page: 1,
      includeDrafts: false,
    });

    // total = CORPUS_SIZE (200 bulk) + 5 tagged + 8 cat + 10 author = 223
    // The exact total is asserted separately; here we just care that no
    // corpus scan occurred (tested implicitly by the wrapper not throwing).
    expect(result.posts.length).toBe(PAGE_SIZE);
    expect(result.total).toBeGreaterThan(PAGE_SIZE); // many more posts than one page
    expect(result.totalPages).toBeGreaterThan(1);

    // Pagination is coherent: total / pageSize ≈ totalPages
    expect(result.totalPages).toBe(Math.ceil(result.total / PAGE_SIZE));
  });

  // -------------------------------------------------------------------------
  // 2. listPosts page=2 with OFFSET
  // -------------------------------------------------------------------------

  test("listPosts page=2: no overlap with page=1, both served without corpus scan", async () => {
    const limitDb = createRowLimitDb(rawDb, MAX_BODY_ROWS);
    const adapter = new DrizzleContentAdapter(limitDb, configDir, schema);

    const page1 = await adapter.listPosts({
      pageSize: PAGE_SIZE,
      page: 1,
      includeDrafts: false,
    });
    const page2 = await adapter.listPosts({
      pageSize: PAGE_SIZE,
      page: 2,
      includeDrafts: false,
    });

    const slugsPage1 = new Set(page1.posts.map((p) => p.slug));
    for (const post of page2.posts) {
      expect(slugsPage1.has(post.slug)).toBe(false);
    }
    // Both pages: consistent total
    expect(page1.total).toBe(page2.total);
  });

  // -------------------------------------------------------------------------
  // 3. Tag filter: SQL-side — total reflects SQL-filtered count
  // -------------------------------------------------------------------------

  test("listPosts tag filter: SQL COUNT reflects only tag-matching posts", async () => {
    // Seed seeded 5 posts with tag "rare-tag" above. The full corpus has many
    // more. The SQL EXISTS join must restrict the count to 5.
    const limitDb = createRowLimitDb(rawDb, MAX_BODY_ROWS);
    const adapter = new DrizzleContentAdapter(limitDb, configDir, schema);

    const result = await adapter.listPosts({
      tag: "rare-tag",
      includeDrafts: false,
      pageSize: 10,
    });

    expect(result.total).toBe(5);
    expect(result.posts.length).toBe(5);
    for (const post of result.posts) {
      const slugified = post.tags.map((t) =>
        t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      );
      expect(slugified).toContain("rare-tag");
    }
  });

  // -------------------------------------------------------------------------
  // 4. Category filter: prefix match in SQL
  // -------------------------------------------------------------------------

  test("listPosts category filter: SQL prefix match includes root and child slugs", async () => {
    // 5 posts under "special-cat" + 3 posts under "special-cat/sub" = 8 total.
    // The SQL filter uses (slug = ? OR slug LIKE ?/%) to capture both.
    const limitDb = createRowLimitDb(rawDb, MAX_BODY_ROWS);
    const adapter = new DrizzleContentAdapter(limitDb, configDir, schema);

    const result = await adapter.listPosts({
      category: "special-cat",
      includeDrafts: false,
      pageSize: 20,
    });

    expect(result.total).toBe(8); // 5 root + 3 child
    expect(result.posts.length).toBe(8);
  });

  test("listPosts category filter: child-only filter does not include root-only posts", async () => {
    const limitDb = createRowLimitDb(rawDb, MAX_BODY_ROWS);
    const adapter = new DrizzleContentAdapter(limitDb, configDir, schema);

    const result = await adapter.listPosts({
      category: "special-cat/sub",
      includeDrafts: false,
      pageSize: 20,
    });

    // Only 3 posts in the child category
    expect(result.total).toBe(3);
    expect(result.posts.length).toBe(3);
  });

  // -------------------------------------------------------------------------
  // 5. Author filter: TS-side (NOT SQL-pushed — by design)
  // -------------------------------------------------------------------------
  // Author filter is a documented TS-filter (like options.query). It uses the
  // projected post.author value (with siteAuthorName fallback for NULL) and
  // compares via slugifyAuthor() to match the FS oracle. SQL-pushing author
  // would miss NULL author_label rows and multi-word/slug divergences.
  // This test verifies correct results WITHOUT the row-limit wrapper (the TS
  // path legitimately loads all structurally-matching rows).

  test("listPosts author filter: returns only matching-author posts (TS filter, not SQL)", async () => {
    // 10 posts seeded with authorLabel="TargetAuthor".
    // Use a plain drizzle db (no row-limit wrapper) because the author TS-filter
    // path intentionally loads all structurally-matching rows before filtering.
    const adapter = new DrizzleContentAdapter(
      drizzle(rawDb, { schema }),
      configDir,
      schema
    );

    const result = await adapter.listPosts({
      author: "TargetAuthor",
      includeDrafts: false,
      pageSize: 20,
    });

    expect(result.total).toBe(10);
    expect(result.posts.length).toBe(10);
    for (const post of result.posts) {
      expect(post.author).toBe("TargetAuthor");
    }
  });

  // -------------------------------------------------------------------------
  // 6. listPages — page query LIMIT proof
  // -------------------------------------------------------------------------

  test("listPages page=1 with 200+ pages: body_markdown query returns ≤ pageSize rows (SQL LIMIT applied)", async () => {
    const limitDb = createRowLimitDb(rawDb, MAX_BODY_ROWS);
    const adapter = new DrizzleContentAdapter(limitDb, configDir, schema);

    const result = await adapter.listPages({
      pageSize: PAGE_SIZE,
      page: 1,
      includeDrafts: false,
    });

    expect(result.pages.length).toBe(PAGE_SIZE);
    expect(result.total).toBe(CORPUS_SIZE); // 200 published pages
    expect(result.totalPages).toBe(Math.ceil(CORPUS_SIZE / PAGE_SIZE));
  });

  // -------------------------------------------------------------------------
  // 7. adminStatus filter: SQL-driven buckets
  // -------------------------------------------------------------------------

  test("adminStatus 'published' filter via SQL: returns past-dated published posts only", async () => {
    // All 200+ posts have published_at < SEED_BASE_EPOCH (2024-01-01).
    // With now="2025-01-01" (after all seed dates), all published posts qualify.
    // With now="1970-01-01" (before all seed dates), zero published posts qualify.
    const limitDb = createRowLimitDb(rawDb, MAX_BODY_ROWS);
    const adapter = new DrizzleContentAdapter(limitDb, configDir, schema);

    const resultNone = await adapter.listPosts({
      adminStatus: "published",
      now: "1970-01-01",
      includeDrafts: true,
      pageSize: 10,
    });
    // No posts have published_at <= epoch("1970-01-01") = 0
    expect(resultNone.total).toBe(0);

    const resultAll = await adapter.listPosts({
      adminStatus: "published",
      now: "2030-01-01",
      includeDrafts: true,
      pageSize: 10,
    });
    // All published posts qualify when now is far in the future
    expect(resultAll.total).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Coverage-gap tests for specific pushdown branches
// ---------------------------------------------------------------------------

describe("DrizzleContentAdapter — pushdown branch coverage", () => {
  let rawDb: Database;
  let seedDb: ReturnType<typeof drizzle>;
  let configDir: string;
  let tmpBase: string;

  const AUTHOR_NAME = "CoverageAuthor";
  // 6 posts by AUTHOR_NAME so page 2 of pageSize:2 is well within bounds.
  const AUTHOR_POST_COUNT = 6;

  beforeAll(async () => {
    rawDb = new Database(":memory:");
    rawDb.exec(DDL);
    seedDb = drizzle(rawDb, { schema });

    tmpBase = await fs.mkdtemp(
      path.join(os.tmpdir(), "tintero-branch-coverage-")
    );
    configDir = path.join(tmpBase, "config");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, "site.yaml"), buildSiteYaml(), "utf-8");
    await fs.writeFile(path.join(configDir, "taxonomies.yaml"), buildTaxonomiesYaml(), "utf-8");

    // Seed AUTHOR_POST_COUNT posts by AUTHOR_NAME for 2a.
    const authorRows: SeedPostRow[] = [];
    for (let i = 0; i < AUTHOR_POST_COUNT; i++) {
      authorRows.push({ slug: `coverage-author-${i}`, authorLabel: AUTHOR_NAME });
    }
    await seedPostRows(seedDb, authorRows);

    // Seed a few unrelated published posts so adminStatus filter has a corpus.
    await seedPostRows(seedDb, [
      { slug: "coverage-other-1" },
      { slug: "coverage-other-2" },
    ]);
  });

  afterAll(async () => {
    rawDb.close();
    await fs.rm(tmpBase, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 2a. Author filter across a page boundary
  //
  // Proves filter-before-paginate contract: total must equal the author-matched
  // count (not the SQL pre-filter count), and page 2 must be the correct slice.
  //
  // Classic bug: SQL LIMIT/OFFSET applied before TS author filter → total would
  // reflect the SQL-limited slice count, not the full author-match count.
  // -------------------------------------------------------------------------

  test("2a: author filter with page=2 pageSize=2: total reflects full author match, posts is page slice", async () => {
    const adapter = new DrizzleContentAdapter(
      drizzle(rawDb, { schema }),
      configDir,
      schema
    );

    const result = await adapter.listPosts({
      author: AUTHOR_NAME,
      includeDrafts: false,
      pageSize: 2,
      page: 2,
    });

    // total must be the full author-matched count, not the SQL pre-filter count.
    expect(result.total).toBe(AUTHOR_POST_COUNT);
    // totalPages = ceil(6/2) = 3.
    expect(result.totalPages).toBe(Math.ceil(AUTHOR_POST_COUNT / 2));
    // Page 2 must contain exactly pageSize posts (not 0 or total).
    expect(result.posts).toHaveLength(2);
    // All returned posts must be by the target author.
    for (const post of result.posts) {
      expect(post.author).toBe(AUTHOR_NAME);
    }
  });

  // -------------------------------------------------------------------------
  // 2b. adminStatus "published" with now=""
  //
  // Exercises the sql`false` branch (drizzle-adapter.ts ~line 344) that the
  // existing tests never reach (they use now:"1970-01-01" which hits the lte path).
  //
  // now="" semantics: ISO string comparison "" < any "YYYY-MM-DD" → all dates
  // are "future" → no post qualifies as "Published". The sql`false` literal
  // must work on SQLite without throwing (PG correctness is covered by the PG
  // contract suite; this file is SQLite-only).
  // -------------------------------------------------------------------------

  test("2b: adminStatus 'published' with now='' returns zero posts and does not throw", async () => {
    const adapter = new DrizzleContentAdapter(
      drizzle(rawDb, { schema }),
      configDir,
      schema
    );

    const result = await adapter.listPosts({
      adminStatus: "published",
      now: "",
      includeDrafts: true,
      pageSize: 10,
    });

    expect(result.total).toBe(0);
    expect(result.posts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Author filter parity tests (contract-independent)
// ---------------------------------------------------------------------------
//
// These tests prove that the author filter matches the FS oracle behaviour
// for two cases that the contract suite (which only uses single-word ASCII
// names like "Alice") does not cover:
//
//   (a) Multi-word / slugified author names:
//       author_label "Alice Smith" stored in DB must match filter "alice-smith"
//       because slugifyAuthor("Alice Smith") === slugifyAuthor("alice-smith").
//       The old SQL LOWER(TRIM()) approach returns "alice smith" ≠ "alice-smith"
//       → false negative.
//
//   (b) NULL author_label posts:
//       The FS adapter projects null author to the site author name and includes
//       those posts when filtering by site author. The old SQL
//       LOWER(TRIM(NULL)) = ? returns NULL (not TRUE) → post excluded → false
//       negative vs FS oracle.
//
// Both tests are RED against the SQL-filter implementation and GREEN after
// the author filter is moved to TS (FIX 2).

describe("DrizzleContentAdapter — author filter parity", () => {
  let rawDb: Database;
  let seedDb: ReturnType<typeof drizzle>;
  let configDir: string;
  let tmpBase: string;

  // Site author name used in buildSiteYaml() above.
  const SITE_AUTHOR = "Test Author";

  beforeAll(async () => {
    rawDb = new Database(":memory:");
    rawDb.exec(DDL);
    seedDb = drizzle(rawDb, { schema });

    tmpBase = await fs.mkdtemp(
      path.join(os.tmpdir(), "tintero-author-parity-")
    );
    configDir = path.join(tmpBase, "config");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "site.yaml"),
      buildSiteYaml(), // site author = "Test Author"
      "utf-8"
    );
    await fs.writeFile(
      path.join(configDir, "taxonomies.yaml"),
      buildTaxonomiesYaml(),
      "utf-8"
    );

    const now = nowEpoch();
    const EPOCH = toEpoch("2024-06-01");

    // Post A: multi-word author name with a space (tests slug divergence)
    await seedDb.insert(schema.content).values({
      id: newId(),
      type: "post",
      slug: "post-alice-smith",
      title: "Alice Smith post",
      status: "published",
      visibility: "public",
      password: null,
      body_markdown: "body alice",
      excerpt: null,
      cover_image: null,
      author_label: "Alice Smith",
      author_id: null,
      sticky: 0,
      comments_enabled: 0,
      parent_id: null,
      menu_order: 0,
      published_at: EPOCH,
      created_at: now,
      updated_at: now,
    });

    // Post B: null author_label (tests NULL fallback to site author)
    await seedDb.insert(schema.content).values({
      id: newId(),
      type: "post",
      slug: "post-null-author",
      title: "Null author post",
      status: "published",
      visibility: "public",
      password: null,
      body_markdown: "body null-author",
      excerpt: null,
      cover_image: null,
      author_label: null,
      author_id: null,
      sticky: 0,
      comments_enabled: 0,
      parent_id: null,
      menu_order: 0,
      published_at: EPOCH - 1000,
      created_at: now,
      updated_at: now,
    });

    // Post C: unrelated author (control — must NOT appear in either test)
    await seedDb.insert(schema.content).values({
      id: newId(),
      type: "post",
      slug: "post-bob",
      title: "Bob post",
      status: "published",
      visibility: "public",
      password: null,
      body_markdown: "body bob",
      excerpt: null,
      cover_image: null,
      author_label: "Bob",
      author_id: null,
      sticky: 0,
      comments_enabled: 0,
      parent_id: null,
      menu_order: 0,
      published_at: EPOCH - 2000,
      created_at: now,
      updated_at: now,
    });
  });

  afterAll(async () => {
    rawDb.close();
    await fs.rm(tmpBase, { recursive: true, force: true });
  });

  test("(a) multi-word author: 'Alice Smith' in DB matches filter 'alice-smith' (slugify parity)", async () => {
    // FS oracle: slugifyAuthor("Alice Smith") = "alice-smith"
    //            slugifyAuthor("alice-smith")  = "alice-smith"
    //            → match ✓
    // Old SQL:   LOWER(TRIM("Alice Smith")) = "alice-smith"
    //            → "alice smith" ≠ "alice-smith" → no match (false negative)
    //
    // With TS author filter (FIX 2) the slugify comparison is applied and the
    // post is found.
    const adapter = new DrizzleContentAdapter(
      drizzle(rawDb, { schema }),
      configDir,
      schema
    );

    const result = await adapter.listPosts({
      author: "alice-smith",
      includeDrafts: false,
      pageSize: 10,
    });

    expect(result.total).toBe(1);
    expect(result.posts[0].slug).toBe("post-alice-smith");
    // The control post (Bob) must not appear
    expect(result.posts.every((p) => p.slug !== "post-bob")).toBe(true);
  });

  test("(b) null author_label: post falls back to site author and matches author filter", async () => {
    // FS oracle: post.author = author_label?.trim() || siteAuthorName = "Test Author"
    //            filter: slugifyAuthor("Test Author") = "test-author"
    //            → slugifyAuthor("Test Author") = "test-author" → match ✓
    // Old SQL:   LOWER(TRIM(NULL)) = "test author"
    //            → NULL comparison → FALSE (never matches NULL) → false negative
    //
    // With TS author filter (FIX 2) the projected author includes the fallback.
    const adapter = new DrizzleContentAdapter(
      drizzle(rawDb, { schema }),
      configDir,
      schema
    );

    const result = await adapter.listPosts({
      author: SITE_AUTHOR,
      includeDrafts: false,
      pageSize: 10,
    });

    expect(result.total).toBe(1);
    expect(result.posts[0].slug).toBe("post-null-author");
    // The control post (Bob) and Alice Smith must not appear
    expect(result.posts.every((p) => p.slug !== "post-bob")).toBe(true);
    expect(result.posts.every((p) => p.slug !== "post-alice-smith")).toBe(true);
  });
});
