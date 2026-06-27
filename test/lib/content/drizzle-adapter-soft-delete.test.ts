/**
 * Soft-delete exclusion tests for DrizzleContentAdapter.
 *
 * TDD RED phase: these tests assert that adapter read methods exclude rows where
 * deleted_at IS NOT NULL. They FAIL before the deleted_at column and isNull()
 * filter are added to the schema and adapter (the filter simply doesn't exist yet).
 *
 * Run on BOTH bun:sqlite and PGlite to prove cross-dialect correctness.
 *
 * Seeding strategy:
 *   - Rows are inserted via drizzle using the schema objects (which do not have
 *     deleted_at yet at the RED stage, so deleted_at is NULL by default in the DB).
 *   - "Trashed" rows are marked via a raw SQL UPDATE after drizzle insert.
 *   - This isolates the RED failure to "adapter doesn't filter deleted_at IS NULL"
 *     rather than schema issues, giving a clean TDD signal.
 *
 * To run only this file:
 *   bun test test/lib/content/drizzle-adapter-soft-delete.test.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/pglite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as schemaSqlite from "@/lib/content/schema.sqlite";
import * as schemaPg from "@/lib/content/schema.pg";
import { DrizzleContentAdapter } from "@/lib/content/drizzle-adapter";
import { newId, toEpoch, nowEpoch } from "@/lib/content/db-values";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRASHED_AT = 1704067200000; // 2024-01-01T00:00:00.000Z — a deterministic epoch
const LIVE_POST_SLUG = "live-post";
const TRASHED_POST_SLUG = "trashed-post";
const LIVE_PAGE_SLUG = "live-page";
const TRASHED_PAGE_SLUG = "trashed-page";
const TAG_UNIQUE_TO_TRASHED = "only-trashed";
const CAT_UNIQUE_TO_TRASHED = "Trashed Category";

// ---------------------------------------------------------------------------
// SQLite DDL — includes deleted_at from the start (this is the final state)
// ---------------------------------------------------------------------------

const SQLITE_DDL = `
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

// ---------------------------------------------------------------------------
// PGlite DDL — deleted_at as BIGINT (epoch-ms values exceed INT4 max)
// ---------------------------------------------------------------------------

const PG_DDL = `
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
  published_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT
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
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
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

// ---------------------------------------------------------------------------
// Config helpers (minimal site.yaml + taxonomies.yaml for the adapter)
// ---------------------------------------------------------------------------

function buildSiteYaml(): string {
  return [
    `title: "Soft Delete Test Site"`,
    `description: "Soft delete tests"`,
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

async function makeConfigDir(): Promise<string> {
  const tmpBase = await fs.mkdtemp(
    path.join(os.tmpdir(), "tintero-soft-delete-")
  );
  const configDir = path.join(tmpBase, "config");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, "site.yaml"), buildSiteYaml(), "utf-8");
  await fs.writeFile(
    path.join(configDir, "taxonomies.yaml"),
    buildTaxonomiesYaml(),
    "utf-8"
  );
  return configDir;
}

// ---------------------------------------------------------------------------
// Harness types
// ---------------------------------------------------------------------------

interface SoftDeleteHarness {
  repo: DrizzleContentAdapter;
  /** Mark a content row as trashed via raw SQL. */
  trash(id: string): Promise<void>;
  /** Insert a term and a relationship from content_id to that term. */
  linkTerm(contentId: string, taxonomy: string, slug: string, label: string): Promise<void>;
  cleanup(): Promise<void>;
}

// ---------------------------------------------------------------------------
// SQLite harness factory
// ---------------------------------------------------------------------------

async function makeSqliteHarness(): Promise<SoftDeleteHarness & {
  insertPost(opts: {
    id: string;
    slug: string;
    status?: "published" | "draft";
    body?: string;
  }): Promise<void>;
  insertPage(opts: { id: string; slug: string; status?: "published" | "draft" }): Promise<void>;
}> {
  const configDir = await makeConfigDir();
  const sqliteDb = new Database(":memory:");
  sqliteDb.exec(SQLITE_DDL);
  const db = drizzle(sqliteDb, { schema: schemaSqlite });
  const repo = new DrizzleContentAdapter(db, configDir, schemaSqlite);
  const now = nowEpoch();

  async function insertPost(opts: {
    id: string;
    slug: string;
    status?: "published" | "draft";
    body?: string;
  }) {
    await db.insert(schemaSqlite.content).values({
      id: opts.id,
      type: "post",
      slug: opts.slug,
      title: `Post ${opts.slug}`,
      status: opts.status ?? "published",
      visibility: "public",
      password: null,
      body_markdown: opts.body ?? `Body for ${opts.slug}`,
      excerpt: null,
      cover_image: null,
      author_label: "Test Author",
      author_id: null,
      sticky: 0,
      comments_enabled: 0,
      parent_id: null,
      menu_order: 0,
      published_at: toEpoch("2024-06-01"),
      created_at: now,
      updated_at: now,
    });
  }

  async function insertPage(opts: {
    id: string;
    slug: string;
    status?: "published" | "draft";
  }) {
    await db.insert(schemaSqlite.content).values({
      id: opts.id,
      type: "page",
      slug: opts.slug,
      title: `Page ${opts.slug}`,
      status: opts.status ?? "published",
      visibility: "public",
      password: null,
      body_markdown: `Body for page ${opts.slug}`,
      excerpt: null,
      cover_image: null,
      author_label: null,
      author_id: null,
      sticky: 0,
      comments_enabled: 0,
      parent_id: null,
      menu_order: 0,
      published_at: toEpoch("2024-06-01"),
      created_at: now,
      updated_at: now,
    });
  }

  async function trash(id: string) {
    sqliteDb.run(
      `UPDATE content SET deleted_at = ${TRASHED_AT} WHERE id = '${id}'`
    );
  }

  async function linkTerm(
    contentId: string,
    taxonomy: string,
    slug: string,
    label: string
  ) {
    const termId = newId();
    await db.insert(schemaSqlite.terms).values({
      id: termId,
      taxonomy,
      slug,
      label,
      parent_id: null,
      description_markdown: null,
      count: 1,
      created_at: now,
      updated_at: now,
    });
    await db
      .insert(schemaSqlite.term_relationships)
      .values({ content_id: contentId, term_id: termId });
  }

  async function cleanup() {
    sqliteDb.close();
    await fs.rm(path.dirname(configDir), { recursive: true, force: true });
  }

  return { repo, trash, insertPost, insertPage, linkTerm, cleanup };
}

// ---------------------------------------------------------------------------
// PGlite harness factory
// ---------------------------------------------------------------------------

async function makePgliteHarness(): Promise<SoftDeleteHarness & {
  insertPost(opts: {
    id: string;
    slug: string;
    status?: "published" | "draft";
    body?: string;
  }): Promise<void>;
  insertPage(opts: { id: string; slug: string; status?: "published" | "draft" }): Promise<void>;
}> {
  const configDir = await makeConfigDir();
  const pg = new PGlite();
  await pg.exec(PG_DDL);
  const db = drizzlePg(pg, { schema: schemaPg });
  const repo = new DrizzleContentAdapter(db, configDir, schemaPg);
  const now = nowEpoch();

  async function insertPost(opts: {
    id: string;
    slug: string;
    status?: "published" | "draft";
    body?: string;
  }) {
    await db.insert(schemaPg.content).values({
      id: opts.id,
      type: "post",
      slug: opts.slug,
      title: `Post ${opts.slug}`,
      status: opts.status ?? "published",
      visibility: "public",
      password: null,
      body_markdown: opts.body ?? `Body for ${opts.slug}`,
      excerpt: null,
      cover_image: null,
      author_label: "Test Author",
      author_id: null,
      sticky: 0,
      comments_enabled: 0,
      parent_id: null,
      menu_order: 0,
      published_at: toEpoch("2024-06-01"),
      created_at: now,
      updated_at: now,
    });
  }

  async function insertPage(opts: {
    id: string;
    slug: string;
    status?: "published" | "draft";
  }) {
    await db.insert(schemaPg.content).values({
      id: opts.id,
      type: "page",
      slug: opts.slug,
      title: `Page ${opts.slug}`,
      status: opts.status ?? "published",
      visibility: "public",
      password: null,
      body_markdown: `Body for page ${opts.slug}`,
      excerpt: null,
      cover_image: null,
      author_label: null,
      author_id: null,
      sticky: 0,
      comments_enabled: 0,
      parent_id: null,
      menu_order: 0,
      published_at: toEpoch("2024-06-01"),
      created_at: now,
      updated_at: now,
    });
  }

  async function trash(id: string) {
    await pg.exec(
      `UPDATE content SET deleted_at = ${TRASHED_AT} WHERE id = '${id}'`
    );
  }

  async function linkTerm(
    contentId: string,
    taxonomy: string,
    slug: string,
    label: string
  ) {
    const termId = newId();
    await db.insert(schemaPg.terms).values({
      id: termId,
      taxonomy,
      slug,
      label,
      parent_id: null,
      description_markdown: null,
      count: 1,
      created_at: now,
      updated_at: now,
    });
    await db
      .insert(schemaPg.term_relationships)
      .values({ content_id: contentId, term_id: termId });
  }

  async function cleanup() {
    // PGlite in-memory — no explicit close needed; remove config dir
    await fs.rm(path.dirname(configDir), { recursive: true, force: true });
  }

  return { repo, trash, insertPost, insertPage, linkTerm, cleanup };
}

// ---------------------------------------------------------------------------
// Shared test suite — parameterized over dialect harness
// ---------------------------------------------------------------------------

type HarnessFactory = () => Promise<
  SoftDeleteHarness & {
    insertPost(opts: {
      id: string;
      slug: string;
      status?: "published" | "draft";
      body?: string;
    }): Promise<void>;
    insertPage(opts: { id: string; slug: string; status?: "published" | "draft" }): Promise<void>;
  }
>;

const dialects: Array<{ name: string; factory: HarnessFactory }> = [
  { name: "bun:sqlite", factory: makeSqliteHarness },
  { name: "pglite", factory: makePgliteHarness },
];

for (const { name, factory } of dialects) {
  describe(`soft-delete exclusion [${name}]`, () => {
    let h: Awaited<ReturnType<HarnessFactory>>;
    let livePostId: string;
    let trashedPostId: string;
    let livePageId: string;
    let trashedPageId: string;

    beforeEach(async () => {
      h = await factory();

      livePostId = newId();
      trashedPostId = newId();
      livePageId = newId();
      trashedPageId = newId();

      // Seed: one live post and one trashed post
      await h.insertPost({ id: livePostId, slug: LIVE_POST_SLUG, status: "published" });
      await h.insertPost({ id: trashedPostId, slug: TRASHED_POST_SLUG, status: "published" });
      await h.trash(trashedPostId);

      // Seed: one live page and one trashed page
      await h.insertPage({ id: livePageId, slug: LIVE_PAGE_SLUG, status: "published" });
      await h.insertPage({ id: trashedPageId, slug: TRASHED_PAGE_SLUG, status: "published" });
      await h.trash(trashedPageId);

      // Give the trashed post a unique tag (only-trashed) and category (Trashed Category)
      // If adapter doesn't exclude the trashed post, these will appear in listTags/listCategories
      await h.linkTerm(trashedPostId, "tag", "only-trashed", TAG_UNIQUE_TO_TRASHED);
      await h.linkTerm(trashedPostId, "category", "trashed-category", CAT_UNIQUE_TO_TRASHED);

      // Give the live post a different tag so listTags always returns at least one result
      await h.linkTerm(livePostId, "tag", "live-tag", "Live Tag");
      await h.linkTerm(livePostId, "category", "live-category", "Live Category");
    });

    afterEach(async () => {
      await h.cleanup();
    });

    // -----------------------------------------------------------------------
    // listPosts — both includeDrafts variants
    // -----------------------------------------------------------------------

    test("listPosts(includeDrafts=true) excludes trashed post", async () => {
      const { posts } = await h.repo.listPosts({ includeDrafts: true });
      const slugs = posts.map((p) => p.slug);
      expect(slugs).toContain(LIVE_POST_SLUG);
      expect(slugs).not.toContain(TRASHED_POST_SLUG);
    });

    test("listPosts(includeDrafts=false) excludes trashed post", async () => {
      const { posts } = await h.repo.listPosts({ includeDrafts: false });
      const slugs = posts.map((p) => p.slug);
      expect(slugs).toContain(LIVE_POST_SLUG);
      expect(slugs).not.toContain(TRASHED_POST_SLUG);
    });

    test("listPosts total count reflects only live posts", async () => {
      const { total } = await h.repo.listPosts({ includeDrafts: true });
      // Only 1 live post; trashed post must not be counted
      expect(total).toBe(1);
    });

    // -----------------------------------------------------------------------
    // getPost
    // -----------------------------------------------------------------------

    test("getPost returns null for a trashed post", async () => {
      const result = await h.repo.getPost(TRASHED_POST_SLUG, { includeDrafts: true });
      expect(result).toBeNull();
    });

    test("getPost returns the live post normally", async () => {
      const result = await h.repo.getPost(LIVE_POST_SLUG, { includeDrafts: true });
      expect(result).not.toBeNull();
      expect(result!.slug).toBe(LIVE_POST_SLUG);
    });

    // -----------------------------------------------------------------------
    // listPostStatusCounts
    // -----------------------------------------------------------------------

    test("listPostStatusCounts does not count the trashed post", async () => {
      const counts = await h.repo.listPostStatusCounts("2024-12-31");
      // live-post is published + date 2024-06-01 ≤ 2024-12-31 → "published"
      // trashed-post must NOT appear in any count category
      const total = counts.published + counts.draft + counts.scheduled;
      expect(total).toBe(1);
    });

    // -----------------------------------------------------------------------
    // listTags — trashed post's unique tag must not appear
    // -----------------------------------------------------------------------

    test("listTags excludes tags from trashed posts", async () => {
      const tags = await h.repo.listTags();
      const tagSlugs = tags.map((t) => t.slug);
      // "only-trashed" is only on the trashed post; must not appear
      expect(tagSlugs).not.toContain("only-trashed");
      // "live-tag" is on the live post; must appear
      expect(tagSlugs).toContain("live-tag");
    });

    // -----------------------------------------------------------------------
    // listCategories — trashed post's unique category must not appear
    // -----------------------------------------------------------------------

    test("listCategories excludes categories from trashed posts", async () => {
      const cats = await h.repo.listCategories();
      const catSlugs = cats.map((c) => c.slug);
      // "trashed-category" is only on the trashed post; must not appear
      expect(catSlugs).not.toContain("trashed-category");
      // "live-category" is on the live post; must appear
      expect(catSlugs).toContain("live-category");
    });

    // -----------------------------------------------------------------------
    // getLinkGraph — trashed post must not be a graph node
    // -----------------------------------------------------------------------

    test("getLinkGraph does not include the trashed post as a node", async () => {
      const graph = await h.repo.getLinkGraph();
      const nodeSlugs = graph.nodes.map((n) => n.slug);
      expect(nodeSlugs).not.toContain(TRASHED_POST_SLUG);
      expect(nodeSlugs).toContain(LIVE_POST_SLUG);
    });

    // -----------------------------------------------------------------------
    // getUnlinkedMentions — trashed post must not appear as a source or target
    // -----------------------------------------------------------------------

    test("getUnlinkedMentions does not include the trashed post", async () => {
      // Ask for unlinked mentions of the live post; trashed post must not be
      // considered as a source of mentions.
      const mentions = await h.repo.getUnlinkedMentions(LIVE_POST_SLUG);
      const mentionSlugs = mentions.map((m) => m.slug);
      expect(mentionSlugs).not.toContain(TRASHED_POST_SLUG);
    });

    // -----------------------------------------------------------------------
    // listPages — trashed page must be excluded
    // -----------------------------------------------------------------------

    test("listPages(includeDrafts=true) excludes trashed page", async () => {
      const { pages } = await h.repo.listPages({ includeDrafts: true });
      const slugs = pages.map((p) => p.slug);
      expect(slugs).toContain(LIVE_PAGE_SLUG);
      expect(slugs).not.toContain(TRASHED_PAGE_SLUG);
    });

    test("listPages(includeDrafts=false) excludes trashed page", async () => {
      const { pages } = await h.repo.listPages({ includeDrafts: false });
      const slugs = pages.map((p) => p.slug);
      expect(slugs).toContain(LIVE_PAGE_SLUG);
      expect(slugs).not.toContain(TRASHED_PAGE_SLUG);
    });

    test("listPages total count reflects only live pages", async () => {
      const { total } = await h.repo.listPages({ includeDrafts: true });
      expect(total).toBe(1);
    });

    // -----------------------------------------------------------------------
    // getPage
    // -----------------------------------------------------------------------

    test("getPage returns null for a trashed page", async () => {
      const result = await h.repo.getPage(TRASHED_PAGE_SLUG, { includeDrafts: true });
      expect(result).toBeNull();
    });

    test("getPage returns the live page normally", async () => {
      const result = await h.repo.getPage(LIVE_PAGE_SLUG, { includeDrafts: true });
      expect(result).not.toBeNull();
      expect(result!.slug).toBe(LIVE_PAGE_SLUG);
    });
  });
}
