/**
 * Backfill test suite — validates runBackfill against both SQLite (bun:sqlite) and
 * PostgreSQL (PGlite) in-memory databases.
 *
 * TDD: tests were written BEFORE backfill.ts existed (RED), then the implementation
 * was written to make them pass (GREEN).
 *
 * To run only this file:
 *   bun test test/lib/content/backfill.test.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Database } from "bun:sqlite";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/pglite";
import * as sqliteSchema from "@/lib/content/schema.sqlite";
import * as pgSchema from "@/lib/content/schema.pg";
import { FilesystemContentAdapter } from "@/lib/content/fs-adapter";
import { runBackfill, type BackfillSource } from "@/lib/content/backfill";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// DDL — SQLite in-memory (matches schema.sqlite.ts + new unique index on content_meta)
// ---------------------------------------------------------------------------
const DDL_SQLITE = `
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
// DDL — PGlite (matches schema.pg.ts + new unique index on content_meta)
// ---------------------------------------------------------------------------
const DDL_PG = `
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
// Corpus creation — writes .md files + config YAML
// ---------------------------------------------------------------------------

const SITE_YAML = `
title: "Test Blog"
description: "A test blog"
baseUrl: "http://localhost:3000"
language: en
author:
  name: "Site Author"
reading:
  homepage: latest-posts
  posts_per_page: 10
comments:
  enabled: false
  moderation: manual
`.trim();

const TAXONOMIES_YAML = `
tags: []
categories: []
`.trim();

/**
 * Creates the test corpus on disk under rootDir.
 *
 * Structure:
 *   rootDir/posts/*.md       — 4 posts (3 published + 1 draft, 1 with SEO)
 *   rootDir/pages/*.md       — 2 pages (parent + child)
 *   <parent of rootDir>/config/site.yaml
 *   <parent of rootDir>/config/taxonomies.yaml
 */
async function createCorpus(tmpBase: string, rootDir: string): Promise<void> {
  const postsDir = path.join(rootDir, "posts");
  const pagesDir = path.join(rootDir, "pages");
  const configDir = path.join(tmpBase, "config");

  await Promise.all([
    fs.mkdir(postsDir, { recursive: true }),
    fs.mkdir(pagesDir, { recursive: true }),
    fs.mkdir(configDir, { recursive: true }),
  ]);

  // Post 1: published, tags + categories + author + coverImage + SEO
  await fs.writeFile(
    path.join(postsDir, "hello-world.md"),
    `---
title: "Hello World"
date: "2024-01-15"
status: published
tags:
  - JavaScript
  - Tutorial
categories:
  - Tech
author: "Alice"
coverImage: "/uploads/cover.jpg"
comments: true
sticky: true
seo:
  title: "Hello World | Blog"
  metaDescription: "My first post about JavaScript"
  noindex: false
  cornerstone: true
---

This is the **raw** body of the hello world post.

More content here.
`.trim()
  );

  // Post 2: published, overlapping tag with post 1
  await fs.writeFile(
    path.join(postsDir, "second-post.md"),
    `---
title: "Second Post"
date: "2024-02-20"
status: published
tags:
  - JavaScript
  - CSS
categories:
  - Tech
  - Design
author: "Bob"
comments: false
---

Body of the second post.
`.trim()
  );

  // Post 3: published, different taxonomy
  await fs.writeFile(
    path.join(postsDir, "third-post.md"),
    `---
title: "Third Post"
date: "2024-03-10"
status: published
tags:
  - CSS
categories:
  - Design
comments: true
---

Third post body content.
`.trim()
  );

  // Post 4: draft
  await fs.writeFile(
    path.join(postsDir, "draft-post.md"),
    `---
title: "Draft Post"
date: "2024-04-01"
status: draft
tags: []
categories:
  - Uncategorized
comments: false
---

This post is a draft.
`.trim()
  );

  // Page 1: parent page (no parent)
  await fs.writeFile(
    path.join(pagesDir, "about.md"),
    `---
title: "About"
date: "2024-01-01"
status: published
menu_order: 1
---

About page content.
`.trim()
  );

  // Page 2: child page (parent = "about")
  await fs.writeFile(
    path.join(pagesDir, "team.md"),
    `---
title: "Team"
date: "2024-01-02"
status: published
parent: about
menu_order: 2
---

Team page content.
`.trim()
  );

  // Config files
  await fs.writeFile(path.join(configDir, "site.yaml"), SITE_YAML);
  await fs.writeFile(path.join(configDir, "taxonomies.yaml"), TAXONOMIES_YAML);
}

// ---------------------------------------------------------------------------
// Shared test suite factory — runs against any dialect
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDrizzleDb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySchema = any;

function runBackfillTestSuite(
  dialectName: string,
  makeDb: () => Promise<{ db: AnyDrizzleDb; schema: AnySchema }>
) {
  describe(`runBackfill (${dialectName})`, () => {
    let tmpBase: string;
    let rootDir: string;
    let source: FilesystemContentAdapter;
    let db: AnyDrizzleDb;
    let schema: AnySchema;

    beforeEach(async () => {
      tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-backfill-"));
      rootDir = path.join(tmpBase, "content");
      await createCorpus(tmpBase, rootDir);
      source = new FilesystemContentAdapter(rootDir);

      const result = await makeDb();
      db = result.db;
      schema = result.schema;
    });

    afterEach(async () => {
      await fs.rm(tmpBase, { recursive: true, force: true });
    });

    // -----------------------------------------------------------------------
    // Test 1: backfill populates the DB to match the FS oracle
    // -----------------------------------------------------------------------
    test("populates the DB from the FS oracle", async () => {
      const report = await runBackfill({ source, db, schema });

      // Report counts
      expect(report.posts).toBe(4); // 3 published + 1 draft
      expect(report.pages).toBe(2);
      // Terms: JavaScript, Tutorial, CSS, Tech, Design, Uncategorized — 6 unique
      // But let's check what's actually in the corpus:
      // Post1: JavaScript, Tutorial → tag; Tech → category
      // Post2: JavaScript, CSS → tag; Tech, Design → category
      // Post3: CSS → tag; Design → category
      // Post4: (no tags); Uncategorized → category
      // Total unique terms: tag:javascript, tag:tutorial, tag:css + cat:tech, cat:design, cat:uncategorized = 6
      expect(report.terms).toBe(6);
      // Relationships:
      // Post1: 2 tags + 1 cat = 3
      // Post2: 2 tags + 2 cat = 4
      // Post3: 1 tag + 1 cat = 2
      // Post4: 0 tags + 1 cat = 1
      // Total: 10
      expect(report.relationships).toBe(10);
      // SEO: Post1 has seo.title, seo.metaDescription, seo.noindex, seo.cornerstone = 4 fields
      expect(report.meta).toBe(4);

      // Verify DB content count
      const contentRows = await db.select().from(schema.content);
      expect(contentRows.length).toBe(6); // 4 posts + 2 pages

      // Verify a specific post's columns
      const [helloRow] = await db
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.type, "post"), eq(schema.content.slug, "hello-world")));

      expect(helloRow).toBeDefined();
      expect(helloRow.title).toBe("Hello World");
      expect(helloRow.status).toBe("published");
      expect(helloRow.cover_image).toBe("/uploads/cover.jpg");
      expect(helloRow.author_label).toBe("Alice");
      expect(helloRow.sticky).toBe(1);
      expect(helloRow.comments_enabled).toBe(1);
      // body_markdown must be the raw markdown (NOT rendered HTML)
      expect(helloRow.body_markdown).toContain("This is the **raw** body");
      expect(helloRow.body_markdown).not.toContain("<p>"); // must NOT be rendered HTML
      expect(helloRow.cover_image).toBe("/uploads/cover.jpg");

      // Verify published_at is set correctly (epoch ms for 2024-01-15)
      const expectedPublishedAt = new Date("2024-01-15").getTime();
      expect(Number(helloRow.published_at)).toBe(expectedPublishedAt);

      // Verify terms count
      const termRows = await db.select().from(schema.terms);
      expect(termRows.length).toBe(6);

      // Verify a specific term
      const [jsTerm] = await db
        .select()
        .from(schema.terms)
        .where(and(eq(schema.terms.taxonomy, "tag"), eq(schema.terms.slug, "javascript")));
      expect(jsTerm).toBeDefined();
      expect(jsTerm.label).toBe("JavaScript");
      // JavaScript appears in post1 and post2 → count = 2
      expect(Number(jsTerm.count)).toBe(2);

      // Verify CSS tag count = 2 (post2 + post3)
      const [cssTerm] = await db
        .select()
        .from(schema.terms)
        .where(and(eq(schema.terms.taxonomy, "tag"), eq(schema.terms.slug, "css")));
      expect(Number(cssTerm.count)).toBe(2);

      // Verify term_relationships count
      const relRows = await db.select().from(schema.term_relationships);
      expect(relRows.length).toBe(10);

      // Verify page parent_id: child "team" should have parent_id = about's id
      const [aboutRow] = await db
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.type, "page"), eq(schema.content.slug, "about")));
      const [teamRow] = await db
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.type, "page"), eq(schema.content.slug, "team")));

      expect(aboutRow).toBeDefined();
      expect(teamRow).toBeDefined();
      expect(teamRow.parent_id).toBe(aboutRow.id);

      // Verify SEO meta rows for hello-world
      const metaRows = await db
        .select()
        .from(schema.content_meta)
        .where(eq(schema.content_meta.content_id, helloRow.id));

      expect(metaRows.length).toBe(4);

      const metaByKey = new Map(metaRows.map((r: { meta_key: string; meta_value: string | null }) => [r.meta_key, r.meta_value]));
      expect(metaByKey.get("seo.title")).toBe("Hello World | Blog");
      expect(metaByKey.get("seo.metaDescription")).toBe("My first post about JavaScript");
      expect(metaByKey.get("seo.noindex")).toBe("false");
      expect(metaByKey.get("seo.cornerstone")).toBe("true");
    });

    // -----------------------------------------------------------------------
    // Test 2: idempotency — second run produces no duplicates
    // -----------------------------------------------------------------------
    test("idempotency: second run produces no duplicates", async () => {
      // First run
      await runBackfill({ source, db, schema });

      // Capture state after first run
      const [helloRowFirst] = await db
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.type, "post"), eq(schema.content.slug, "hello-world")));

      const createdAtFirst = helloRowFirst.created_at;
      const idFirst = helloRowFirst.id;

      // Brief wait so updated_at can differ
      await new Promise((r) => setTimeout(r, 5));

      // Second run
      const report2 = await runBackfill({ source, db, schema });

      // Report counts should be identical
      expect(report2.posts).toBe(4);
      expect(report2.pages).toBe(2);
      expect(report2.terms).toBe(6);
      expect(report2.relationships).toBe(10);
      expect(report2.meta).toBe(4);

      // Row counts must not have doubled
      const contentRows = await db.select().from(schema.content);
      expect(contentRows.length).toBe(6);

      const termRows = await db.select().from(schema.terms);
      expect(termRows.length).toBe(6);

      const relRows = await db.select().from(schema.term_relationships);
      expect(relRows.length).toBe(10);

      const metaRows = await db.select().from(schema.content_meta);
      expect(metaRows.length).toBe(4);

      // created_at preserved, id preserved
      const [helloRowSecond] = await db
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.type, "post"), eq(schema.content.slug, "hello-world")));

      expect(helloRowSecond.id).toBe(idFirst);
      expect(Number(helloRowSecond.created_at)).toBe(Number(createdAtFirst));
      // updated_at should be >= first run's updated_at (may be equal if fast enough)
      expect(Number(helloRowSecond.updated_at)).toBeGreaterThanOrEqual(Number(helloRowFirst.updated_at));

      // FIX 2 guard: parent_id must still be a UUID (not null) after the second run.
      // This catches any idempotency regression in the two-pass parent resolution.
      const [aboutRowSecond] = await db
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.type, "page"), eq(schema.content.slug, "about")));
      const [teamRowSecond] = await db
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.type, "page"), eq(schema.content.slug, "team")));
      expect(teamRowSecond.parent_id).toBe(aboutRowSecond.id);
    });

    // -----------------------------------------------------------------------
    // Test 3: dryRun — correct counts but DB stays empty
    // -----------------------------------------------------------------------
    test("dryRun: report counts correct but DB stays empty", async () => {
      const report = await runBackfill({ source, db, schema, dryRun: true });

      expect(report.posts).toBe(4);
      expect(report.pages).toBe(2);
      expect(report.terms).toBe(6);
      expect(report.relationships).toBe(10);
      expect(report.meta).toBe(4);

      // DB must be completely empty
      const contentRows = await db.select().from(schema.content);
      expect(contentRows.length).toBe(0);

      const termRows = await db.select().from(schema.terms);
      expect(termRows.length).toBe(0);

      const relRows = await db.select().from(schema.term_relationships);
      expect(relRows.length).toBe(0);

      const metaRows = await db.select().from(schema.content_meta);
      expect(metaRows.length).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Test 4: page with non-existent parent slug → parent_id stays null
    // -----------------------------------------------------------------------
    test("page with non-existent parent slug stays null, no throw", async () => {
      // Add a page with a bogus parent slug
      const pagesDir = path.join(rootDir, "pages");
      await fs.writeFile(
        path.join(pagesDir, "orphan.md"),
        `---
title: "Orphan Page"
date: "2024-01-03"
status: published
parent: does-not-exist
menu_order: 99
---

Orphan page content.
`.trim()
      );

      // Should not throw
      const report = await runBackfill({ source, db, schema });
      expect(report.pages).toBe(3); // about + team + orphan

      const [orphanRow] = await db
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.type, "page"), eq(schema.content.slug, "orphan")));

      expect(orphanRow).toBeDefined();
      expect(orphanRow.parent_id).toBeNull();
    });

    // -----------------------------------------------------------------------
    // Test 5: SEO no cross-attribution when post and page share the same slug
    // FIX 1 (CRITICAL) — regression guard for content_meta mis-attribution.
    // -----------------------------------------------------------------------
    test("SEO: no cross-attribution when post and page share the same slug", async () => {
      // Add a post with slug "about" (same as the existing page "about").
      // The content table is unique on (type, slug), so both are valid rows with
      // distinct content_ids. The bug under test wrote the page's SEO against the
      // post's content_id because it resolved ids via postIdBySlug first.
      const postsDir = path.join(rootDir, "posts");
      await fs.writeFile(
        path.join(postsDir, "about.md"),
        `---
title: "About (Post)"
date: "2024-01-10"
status: published
tags: []
categories: []
seo:
  title: "Post About"
  metaDescription: "Post about description"
---

This is the about post.
`.trim()
      );

      // Rewrite pages/about.md with its own distinct SEO.
      const pagesDir = path.join(rootDir, "pages");
      await fs.writeFile(
        path.join(pagesDir, "about.md"),
        `---
title: "About"
date: "2024-01-01"
status: published
menu_order: 1
seo:
  title: "Page About"
  metaDescription: "Page about description"
---

About page content.
`.trim()
      );

      await runBackfill({ source, db, schema });

      // Resolve content rows by (type, slug)
      const [postAbout] = await db
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.type, "post"), eq(schema.content.slug, "about")));
      const [pageAbout] = await db
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.type, "page"), eq(schema.content.slug, "about")));

      expect(postAbout).toBeDefined();
      expect(pageAbout).toBeDefined();
      expect(postAbout.id).not.toBe(pageAbout.id); // sanity: distinct DB rows

      // Post's content_meta must carry the POST's SEO values, not the page's.
      const postMetaRows = await db
        .select()
        .from(schema.content_meta)
        .where(eq(schema.content_meta.content_id, postAbout.id));
      const postMetaByKey = new Map(
        postMetaRows.map((r: { meta_key: string; meta_value: string | null }) => [r.meta_key, r.meta_value])
      );
      expect(postMetaByKey.get("seo.title")).toBe("Post About");

      // Page's content_meta must carry the PAGE's SEO values, not the post's.
      const pageMetaRows = await db
        .select()
        .from(schema.content_meta)
        .where(eq(schema.content_meta.content_id, pageAbout.id));
      const pageMetaByKey = new Map(
        pageMetaRows.map((r: { meta_key: string; meta_value: string | null }) => [r.meta_key, r.meta_value])
      );
      expect(pageMetaByKey.get("seo.title")).toBe("Page About");
    });

    // -----------------------------------------------------------------------
    // Test 6: empty raw body fallback — null readRawPost → body_markdown = ""
    // FIX 3 hardening: confirms the nullish fallback path writes "" not HTML.
    // -----------------------------------------------------------------------
    test("empty raw body fallback: null readRawPost produces body_markdown=''", async () => {
      const stubSource = {
        async listPosts() {
          return {
            posts: [
              {
                slug: "null-body-post",
                title: "Null Body Post",
                date: "2024-01-01",
                status: "published" as const,
                tags: [],
                categories: [],
                excerpt: "",
                html: "<p>body</p>", // rendered HTML present, but must NOT be stored
                comments: false,
                sticky: false,
                author: "",
                visibility: "public" as const,
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
          return null; // deliberately return null — simulates missing/unreadable file
        },
        async readRawPage(_slug: string) {
          return null;
        },
      } as unknown as BackfillSource;

      await runBackfill({ source: stubSource, db, schema });

      const [row] = await db
        .select()
        .from(schema.content)
        .where(and(eq(schema.content.type, "post"), eq(schema.content.slug, "null-body-post")));

      expect(row).toBeDefined();
      expect(row.body_markdown).toBe("");
      expect(row.body_markdown).not.toContain("<p>"); // must NOT be rendered HTML
    });

    // -----------------------------------------------------------------------
    // Test 7: duplicate tag deduplication in report.relationships
    // FIX 4: a post with duplicate tags must count 1 relationship, not 2.
    // -----------------------------------------------------------------------
    test("duplicate tag: report.relationships matches actual term_relationships rows", async () => {
      const stubSource = {
        async listPosts() {
          return {
            posts: [
              {
                slug: "dup-tag-post",
                title: "Dup Tag Post",
                date: "2024-01-01",
                status: "published" as const,
                tags: ["js", "js"], // duplicate raw tag
                categories: [],
                excerpt: "",
                html: "<p>body</p>",
                comments: false,
                sticky: false,
                author: "",
                visibility: "public" as const,
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
          return { body: "post body" };
        },
        async readRawPage(_slug: string) {
          return null;
        },
      } as unknown as BackfillSource;

      const report = await runBackfill({ source: stubSource, db, schema });

      // With duplicate tags ["js", "js"], only 1 term_relationships row is written
      // (composite PK + onConflictDoNothing). The report must reflect the deduped count.
      const relRows = await db.select().from(schema.term_relationships);
      expect(report.relationships).toBe(relRows.length);
      expect(report.relationships).toBe(1); // 1 unique (tag, slug) pair, not 2
    });
  });
}

// ---------------------------------------------------------------------------
// Register test suites for both dialects
// ---------------------------------------------------------------------------

runBackfillTestSuite("bun:sqlite", async () => {
  const sqliteDb = new Database(":memory:");
  sqliteDb.exec(DDL_SQLITE);
  const db = drizzleSqlite(sqliteDb, { schema: sqliteSchema });
  return { db, schema: sqliteSchema };
});

runBackfillTestSuite("pglite", async () => {
  const pg = new PGlite();
  await pg.exec(DDL_PG);
  const db = drizzlePg(pg, { schema: pgSchema });
  return { db, schema: pgSchema };
});
