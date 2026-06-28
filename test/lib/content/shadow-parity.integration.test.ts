/**
 * Shadow parity integration test — Phase 3 exit criterion.
 *
 * Seeds a temp FS corpus, runs runBackfill to populate an isolated libSQL DB,
 * then calls ALL 10 ContentRepository methods through ShadowContentAdapter and
 * asserts that the captured divergence list is EMPTY.
 *
 * Order-kind notices (kind:"order") are allowed — the DB intentionally applies
 * a deterministic id tiebreak that may differ from filesystem order on equal
 * published_at dates.
 *
 * If any real divergence (kind:"divergence") surfaces, it is a genuine parity
 * bug. The test reports the exact entries rather than silently weakening.
 *
 * To run only this file:
 *   bun test test/lib/content/shadow-parity.integration.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as schema from "@/lib/content/schema.sqlite";
import { FilesystemContentAdapter } from "@/lib/content/fs-adapter";
import { DrizzleContentAdapter } from "@/lib/content/drizzle-adapter";
import { runBackfill } from "@/lib/content/backfill";
import { ShadowContentAdapter } from "@/lib/content/shadow-adapter";
import type { ShadowDivergence } from "@/lib/content/shadow-adapter";
import { makeTestContentDb } from "./make-test-content-db";

// ============================================================
// DDL (matches schema.sqlite.ts — mirrors contract test)
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
  ON content (type, slug) WHERE deleted_at IS NULL;

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
// FS corpus helpers (mirrors fs-content-repository.contract.test.ts)
// ============================================================

function buildFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      lines.push(`${k}: "${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    } else if (typeof v === "boolean" || typeof v === "number") {
      lines.push(`${k}: ${v}`);
    } else if (Array.isArray(v)) {
      const items = v.map((x) => `"${String(x)}"`).join(", ");
      lines.push(`${k}: [${items}]`);
    } else if (typeof v === "object") {
      const nested = v as Record<string, unknown>;
      const nestedLines: string[] = [];
      for (const [nk, nv] of Object.entries(nested)) {
        if (nv === undefined || nv === null) continue;
        if (typeof nv === "string") {
          nestedLines.push(`  ${nk}: "${nv.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
        } else if (typeof nv === "boolean" || typeof nv === "number") {
          nestedLines.push(`  ${nk}: ${nv}`);
        }
      }
      if (nestedLines.length > 0) {
        lines.push(`${k}:`);
        lines.push(...nestedLines);
      }
    }
  }
  return lines.join("\n");
}

// ============================================================
// Seed corpus definition
// ============================================================

/**
 * A richer corpus than the minimal contract suite:
 *   - 4 published posts: alpha, beta, gamma, delta
 *     - alpha: tags=[TypeScript, Rust], categories=[Tech], author, coverImage, SEO
 *     - beta: tags=[TypeScript], categories=[Tech], sticky
 *     - gamma: tags=[Rust], categories=[Science] — body contains a prose mention of "Alpha Post"
 *     - delta: tags=[TypeScript], categories=[Tech, Science], author (for author filter tests)
 *   - 1 draft post: draft-post — unique tag/category to avoid count interference
 *   - 1 parent page: docs (with SEO)
 *   - 1 child page: docs/getting-started (parent=docs)
 */
const POSTS = [
  {
    slug: "alpha-post",
    title: "Alpha Post",
    date: "2024-01-03",
    status: "published" as const,
    tags: ["TypeScript", "Rust"],
    categories: ["Tech"],
    author: "Alice",
    comments: false,
    sticky: false,
    coverImage: "/uploads/alpha.jpg",
    body: "Alpha body. [[Beta Post]]",
    excerpt: "Alpha excerpt",
    seo: {
      title: "Alpha SEO Title",
      metaDescription: "Alpha meta description",
      noindex: false,
    },
  },
  {
    slug: "beta-post",
    title: "Beta Post",
    date: "2024-01-02",
    status: "published" as const,
    tags: ["TypeScript"],
    categories: ["Tech"],
    author: "",
    comments: true,
    sticky: true,
    body: "Beta body content.",
    excerpt: "Beta excerpt",
  },
  {
    slug: "gamma-post",
    title: "Gamma Post",
    date: "2024-01-01",
    status: "published" as const,
    tags: ["Rust"],
    categories: ["Science"],
    author: "Bob",
    comments: false,
    sticky: false,
    body: "Gamma body. Mentions Alpha Post without linking it.",
    excerpt: "Gamma excerpt",
  },
  {
    slug: "delta-post",
    title: "Delta Post",
    date: "2024-01-04",
    status: "published" as const,
    tags: ["TypeScript"],
    categories: ["Tech", "Science"],
    author: "Alice",
    comments: false,
    sticky: false,
    body: "Delta body.",
    excerpt: "Delta excerpt",
  },
  {
    slug: "draft-post",
    title: "Draft Post",
    date: "2024-01-05",
    status: "draft" as const,
    tags: ["DraftOnly"],
    categories: ["DraftCat"],
    author: "",
    comments: false,
    sticky: false,
    body: "Draft body.",
    excerpt: "Draft excerpt",
  },
];

const PAGES = [
  {
    slug: "docs",
    title: "Documentation",
    date: "2024-01-01",
    status: "published" as const,
    body: "Docs landing page.",
    excerpt: "All docs",
    menuOrder: 1,
    seo: {
      title: "Docs SEO Title",
      metaDescription: "Docs meta",
    },
  },
  {
    slug: "docs-getting-started",
    title: "Getting Started",
    date: "2024-01-01",
    status: "published" as const,
    body: "Getting started content.",
    excerpt: "Get started",
    parent: "docs",
    menuOrder: 2,
  },
];

const SITE_YAML = `
title: "Parity Test Site"
description: "Integration parity test"
baseUrl: "http://localhost:3001"
language: en
author:
  name: "Parity Author"
reading:
  homepage: latest-posts
  posts_per_page: 10
comments:
  enabled: false
  moderation: manual
`.trimStart();

const TAXONOMIES_YAML = `
tags:
  - label: "TypeScript"
    description: "Microsoft's typed superset of JavaScript"
  - label: "Rust"
    description: "Systems programming language"
  - label: "DraftOnly"
categories:
  - label: "Tech"
    description: "Technology articles"
  - label: "Science"
  - label: "DraftCat"
`.trimStart();

// ============================================================
// Test setup / teardown
// ============================================================

let tmpBase: string;
let contentDir: string;
let configDir: string;
let postsDir: string;
let pagesDir: string;
let fsAdapter: FilesystemContentAdapter;
let drizzleAdapter: DrizzleContentAdapter;
let shadow: ShadowContentAdapter;
let captured: ShadowDivergence[];
let closeDb: () => void;

beforeAll(async () => {
  // 1. Create temp directory structure
  tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), "tintero-shadow-parity-"));
  contentDir = path.join(tmpBase, "content");
  configDir = path.join(tmpBase, "config");
  postsDir = path.join(contentDir, "posts");
  pagesDir = path.join(contentDir, "pages");
  await fs.mkdir(postsDir, { recursive: true });
  await fs.mkdir(pagesDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });

  // 2. Write YAML config files
  await fs.writeFile(path.join(configDir, "site.yaml"), SITE_YAML, "utf-8");
  await fs.writeFile(path.join(configDir, "taxonomies.yaml"), TAXONOMIES_YAML, "utf-8");

  // 3. Write post markdown files
  for (const post of POSTS) {
    const fm: Record<string, unknown> = {
      title: post.title,
      date: post.date,
      status: post.status,
      tags: post.tags,
      categories: post.categories,
      comments: post.comments,
      sticky: post.sticky,
    };
    if (post.author) fm.author = post.author;
    if ("coverImage" in post && post.coverImage) fm.coverImage = post.coverImage;
    if ("excerpt" in post) fm.excerpt = post.excerpt;
    if ("seo" in post && post.seo) fm.seo = post.seo;
    const content = `---\n${buildFrontmatter(fm)}\n---\n\n${post.body}\n`;
    await fs.writeFile(path.join(postsDir, `${post.slug}.md`), content, "utf-8");
  }

  // 4. Write page markdown files
  for (const page of PAGES) {
    const fm: Record<string, unknown> = {
      title: page.title,
      date: page.date,
    };
    if (page.status !== "published") fm.status = page.status;
    if (page.menuOrder) fm.menu_order = page.menuOrder;
    if ("parent" in page && page.parent) fm.parent = page.parent;
    if (page.excerpt) fm.excerpt = page.excerpt;
    if ("seo" in page && page.seo) fm.seo = page.seo;
    const content = `---\n${buildFrontmatter(fm)}\n---\n\n${page.body}\n`;
    await fs.writeFile(path.join(pagesDir, `${page.slug}.md`), content, "utf-8");
  }

  // 5. Create FS adapter (primary)
  fsAdapter = new FilesystemContentAdapter(contentDir);

  // 6. Create isolated libSQL DB + Drizzle adapter (secondary)
  const { db, cleanup } = await makeTestContentDb(DDL);
  closeDb = cleanup;
  drizzleAdapter = new DrizzleContentAdapter(db, configDir, schema);

  // 7. Run backfill to populate DB from FS
  const report = await runBackfill({ source: fsAdapter, db, schema });
  // Sanity check: backfill processed expected counts
  if (report.posts !== POSTS.length) {
    throw new Error(`Backfill processed ${report.posts} posts, expected ${POSTS.length}`);
  }
  if (report.pages !== PAGES.length) {
    throw new Error(`Backfill processed ${report.pages} pages, expected ${PAGES.length}`);
  }

  // 8. Create shadow adapter with capturing log
  captured = [];
  shadow = new ShadowContentAdapter(fsAdapter, drizzleAdapter, {
    log: (entry) => captured.push(entry),
  });
});

afterAll(async () => {
  closeDb?.();
  await fs.rm(tmpBase, { recursive: true, force: true });
});

// ============================================================
// Helper: assert no divergences in captured entries
// ============================================================

function assertNoDivergences(label: string): void {
  const divergences = captured.filter((e) => e.kind === "divergence");
  if (divergences.length > 0) {
    const formatted = divergences.map((d) => JSON.stringify(d)).join("\n  ");
    throw new Error(
      `[${label}] Parity divergence(s) detected — real bug, not a test weakness:\n  ${formatted}`
    );
  }
}

// ============================================================
// Phase 3 exit criterion: all 10 methods, zero divergences
// ============================================================

describe("Shadow parity — FS oracle vs DB after backfill", () => {
  test("listPosts (default — published only)", async () => {
    captured = [];
    await shadow.listPosts();
    assertNoDivergences("listPosts default");
  });

  test("listPosts with tag filter: TypeScript", async () => {
    captured = [];
    await shadow.listPosts({ tag: "typescript" });
    assertNoDivergences("listPosts tag=typescript");
  });

  test("listPosts with pagination (page 1, pageSize 2)", async () => {
    captured = [];
    await shadow.listPosts({ page: 1, pageSize: 2 });
    assertNoDivergences("listPosts page=1 pageSize=2");
  });

  test("listPosts with pagination (page 2, pageSize 2)", async () => {
    captured = [];
    await shadow.listPosts({ page: 2, pageSize: 2 });
    assertNoDivergences("listPosts page=2 pageSize=2");
  });

  test("listPosts includeDrafts=true", async () => {
    captured = [];
    await shadow.listPosts({ includeDrafts: true, pageSize: Number.MAX_SAFE_INTEGER });
    assertNoDivergences("listPosts includeDrafts");
  });

  test("getPost for known published slug: alpha-post", async () => {
    captured = [];
    await shadow.getPost("alpha-post");
    assertNoDivergences("getPost alpha-post");
  });

  test("getPost for known published slug: beta-post", async () => {
    captured = [];
    await shadow.getPost("beta-post");
    assertNoDivergences("getPost beta-post");
  });

  test("getPost for draft slug: draft-post (includeDrafts=true)", async () => {
    captured = [];
    await shadow.getPost("draft-post", { includeDrafts: true });
    assertNoDivergences("getPost draft-post");
  });

  test("getPost returns null for missing slug", async () => {
    captured = [];
    const result = await shadow.getPost("does-not-exist");
    expect(result).toBeNull();
    assertNoDivergences("getPost missing");
  });

  test("listPages (published only)", async () => {
    captured = [];
    await shadow.listPages();
    assertNoDivergences("listPages default");
  });

  test("listPages includeDrafts=true", async () => {
    captured = [];
    await shadow.listPages({ includeDrafts: true });
    assertNoDivergences("listPages includeDrafts");
  });

  test("getPage for known slug: docs", async () => {
    captured = [];
    await shadow.getPage("docs");
    assertNoDivergences("getPage docs");
  });

  test("getPage for child slug: docs-getting-started", async () => {
    captured = [];
    await shadow.getPage("docs-getting-started");
    assertNoDivergences("getPage docs-getting-started");
  });

  test("getPage returns null for missing slug", async () => {
    captured = [];
    const result = await shadow.getPage("does-not-exist");
    expect(result).toBeNull();
    assertNoDivergences("getPage missing");
  });

  test("listPostStatusCounts", async () => {
    captured = [];
    // Use a past date so all non-draft published posts are counted as published
    await shadow.listPostStatusCounts("2025-01-01T00:00:00.000Z");
    assertNoDivergences("listPostStatusCounts");
  });

  test("listTags", async () => {
    captured = [];
    await shadow.listTags();
    assertNoDivergences("listTags");
  });

  test("listCategories", async () => {
    captured = [];
    await shadow.listCategories();
    assertNoDivergences("listCategories");
  });

  test("getSiteConfig", async () => {
    captured = [];
    await shadow.getSiteConfig();
    assertNoDivergences("getSiteConfig");
  });

  test("getLinkGraph", async () => {
    captured = [];
    await shadow.getLinkGraph();
    assertNoDivergences("getLinkGraph");
  });

  test("getUnlinkedMentions for alpha-post id", async () => {
    captured = [];
    // "Alpha Post" is mentioned in prose by gamma-post — unlinked mention
    await shadow.getUnlinkedMentions("post:alpha-post", { publicOnly: true });
    assertNoDivergences("getUnlinkedMentions alpha-post");
  });

  test("getUnlinkedMentions for a slug with no mentions", async () => {
    captured = [];
    await shadow.getUnlinkedMentions("post:delta-post", { publicOnly: true });
    assertNoDivergences("getUnlinkedMentions delta-post (no mentions)");
  });

  test("overall: order-kind notices are the ONLY non-divergence entries", async () => {
    // Run the full suite again with a single shared capture list to get a holistic view
    const all: ShadowDivergence[] = [];
    const fullShadow = new ShadowContentAdapter(fsAdapter, drizzleAdapter, { log: (e) => all.push(e) });

    await fullShadow.listPosts();
    await fullShadow.listPosts({ tag: "typescript" });
    await fullShadow.listPosts({ page: 1, pageSize: 2 });
    await fullShadow.listPosts({ page: 2, pageSize: 2 });
    await fullShadow.listPosts({ includeDrafts: true, pageSize: Number.MAX_SAFE_INTEGER });
    await fullShadow.getPost("alpha-post");
    await fullShadow.getPost("beta-post");
    await fullShadow.getPost("draft-post", { includeDrafts: true });
    await fullShadow.getPost("does-not-exist");
    await fullShadow.listPages();
    await fullShadow.listPages({ includeDrafts: true });
    await fullShadow.getPage("docs");
    await fullShadow.getPage("docs-getting-started");
    await fullShadow.getPage("does-not-exist");
    await fullShadow.listPostStatusCounts("2025-01-01T00:00:00.000Z");
    await fullShadow.listTags();
    await fullShadow.listCategories();
    await fullShadow.getSiteConfig();
    await fullShadow.getLinkGraph();
    await fullShadow.getUnlinkedMentions("post:alpha-post", { publicOnly: true });
    await fullShadow.getUnlinkedMentions("post:delta-post", { publicOnly: true });

    const realDivergences = all.filter((e) => e.kind === "divergence");
    if (realDivergences.length > 0) {
      const formatted = realDivergences.map((d) => JSON.stringify(d)).join("\n  ");
      throw new Error(
        `PARITY FAILURE — DB adapter diverges from FS oracle:\n  ${formatted}\n\nThis is a real bug. Fix the adapter, not the test.`
      );
    }

    // Order entries are acceptable
    const orderEntries = all.filter((e) => e.kind === "order");
    // All remaining entries should be order-kind only
    expect(all.every((e) => e.kind !== "divergence" && e.kind !== "error")).toBe(true);
    if (orderEntries.length > 0) {
      console.info(`[parity] ${orderEntries.length} order-kind notice(s) — expected, not a bug.`);
    }
  });
});
