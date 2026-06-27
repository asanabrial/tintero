/**
 * DrizzleContentAdapter wired into the shared ContentRepository contract suite.
 *
 * Creates a fresh bun:sqlite in-memory database, seeds it with normalized SeedData
 * (content rows + term rows + term_relationships), writes a temp config/ directory
 * with site.yaml + taxonomies.yaml, constructs a DrizzleContentAdapter pointing at
 * the in-memory DB and config dir, and tears it down in cleanup.
 *
 * To run only this file:
 *   bun test test/lib/content/drizzle-content-repository.contract.test.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "@/lib/content/schema.sqlite";
import { DrizzleContentAdapter } from "@/lib/content/drizzle-adapter";
import { newId, toEpoch, nowEpoch, toBool01 } from "@/lib/content/db-values";
import { slugifyTag } from "@/lib/content/tag";
import { slugifyCategory, joinSlug } from "@/lib/content/category";
import {
  runContentRepositoryContract,
  type Harness,
  type SeedData,
  type SeedTaxonomy,
} from "./content-repository-contract";

// ============================================================
// DDL — creates tables + indexes matching schema.sqlite.ts
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
  updated_at INTEGER NOT NULL
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
// YAML serialisation helpers (mirrors fs harness — independent copy)
// ============================================================

function buildSiteYaml(data: SeedData): string {
  const title = data.siteTitle ?? "Test Site";
  const description = data.siteDescription ?? "";
  const baseUrl = data.siteBaseUrl ?? "http://localhost:3000";
  const author = data.siteAuthor ?? "Test Author";
  return (
    [
      `title: "${title}"`,
      `description: "${description}"`,
      `baseUrl: "${baseUrl}"`,
      `language: en`,
      `author:`,
      `  name: "${author}"`,
      `reading:`,
      `  homepage: latest-posts`,
      `  posts_per_page: 10`,
      `comments:`,
      `  enabled: false`,
      `  moderation: manual`,
    ].join("\n") + "\n"
  );
}

function termToYaml(t: SeedTaxonomy): string {
  const lines = [`  - label: "${t.label}"`];
  if (t.description !== undefined) {
    lines.push(`    description: "${t.description.replace(/"/g, '\\"')}"`);
  }
  return lines.join("\n");
}

function buildTaxonomiesYaml(data: SeedData): string {
  const tags = data.taxonomyTags ?? [];
  const cats = data.taxonomyCategories ?? [];
  const tagsBlock =
    tags.length === 0
      ? "tags: []\n"
      : "tags:\n" + tags.map(termToYaml).join("\n") + "\n";
  const catsBlock =
    cats.length === 0
      ? "categories: []\n"
      : "categories:\n" + cats.map(termToYaml).join("\n") + "\n";
  return tagsBlock + catsBlock;
}

// ============================================================
// Drizzle harness factory
// ============================================================

async function makeDrizzleHarness(): Promise<Harness> {
  // In-memory SQLite database with Drizzle ORM
  const sqliteDb = new Database(":memory:");
  sqliteDb.exec(DDL);
  const db = drizzle(sqliteDb, { schema });

  // Temp directory for YAML config files
  const tmpBase = await fs.mkdtemp(
    path.join(os.tmpdir(), "tintero-drizzle-contract-")
  );
  const configDir = path.join(tmpBase, "config");
  await fs.mkdir(configDir, { recursive: true });

  const repo = new DrizzleContentAdapter(db, configDir, schema);

  return {
    repo,

    async seed(data: SeedData): Promise<void> {
      const now = nowEpoch();
      // Map taxonomy:slug → term id to avoid inserting duplicate terms
      const termIdMap = new Map<string, string>();

      async function getOrCreateTerm(
        taxonomy: string,
        slug: string,
        label: string
      ): Promise<string> {
        const key = `${taxonomy}:${slug}`;
        const existing = termIdMap.get(key);
        if (existing !== undefined) return existing;

        const id = newId();
        await db.insert(schema.terms).values({
          id,
          taxonomy,
          slug,
          label,
          parent_id: null,
          description_markdown: null,
          count: 0,
          created_at: now,
          updated_at: now,
        });
        termIdMap.set(key, id);
        return id;
      }

      // Seed posts
      for (const post of data.posts ?? []) {
        const contentId = newId();
        await db.insert(schema.content).values({
          id: contentId,
          type: "post",
          slug: post.slug,
          title: post.title,
          status: post.status ?? "published",
          visibility: post.visibility ?? "public",
          password: post.password ?? null,
          body_markdown: post.body ?? "",
          excerpt: post.excerpt ?? null,
          cover_image: post.coverImage ?? null,
          author_label: post.author ?? null,
          author_id: null,
          sticky: toBool01(post.sticky ?? false),
          comments_enabled: toBool01(post.comments ?? true),
          parent_id: null,
          menu_order: 0,
          published_at: toEpoch(post.date),
          created_at: now,
          updated_at: now,
        });

        // Tag terms + relationships
        for (const rawTag of post.tags ?? []) {
          const tagSlug = slugifyTag(rawTag);
          const termId = await getOrCreateTerm("tag", tagSlug, rawTag);
          await db.insert(schema.term_relationships).values({
            content_id: contentId,
            term_id: termId,
          });
        }

        // Category terms + relationships.
        // Store the slugified full path (e.g. "tech/javascript") as the term slug.
        // DrizzleContentAdapter.listCategories passes these slugs to buildCategoryIndex
        // as the "raw" strings, which correctly derives parent prefixes and counts.
        for (const rawCat of post.categories ?? []) {
          const catSlug = joinSlug(slugifyCategory(rawCat));
          if (catSlug === "") continue;
          const termId = await getOrCreateTerm("category", catSlug, rawCat);
          await db.insert(schema.term_relationships).values({
            content_id: contentId,
            term_id: termId,
          });
        }
      }

      // Seed pages
      for (const page of data.pages ?? []) {
        const contentId = newId();
        await db.insert(schema.content).values({
          id: contentId,
          type: "page",
          slug: page.slug,
          title: page.title,
          status: page.status ?? "published",
          visibility: "public",
          password: null,
          body_markdown: page.body ?? "",
          excerpt: page.excerpt ?? null,
          cover_image: null,
          author_label: null,
          author_id: null,
          sticky: 0,
          comments_enabled: 0,
          parent_id: page.parent ?? null,
          menu_order: page.menuOrder ?? 0,
          published_at: toEpoch(page.date),
          created_at: now,
          updated_at: now,
        });
      }

      // Write YAML config files for getSiteConfig / listTags / listCategories
      await fs.writeFile(
        path.join(configDir, "site.yaml"),
        buildSiteYaml(data),
        "utf-8"
      );
      await fs.writeFile(
        path.join(configDir, "taxonomies.yaml"),
        buildTaxonomiesYaml(data),
        "utf-8"
      );
    },

    async cleanup(): Promise<void> {
      sqliteDb.close();
      await fs.rm(tmpBase, { recursive: true, force: true });
    },
  };
}

// ============================================================
// Run contract
// ============================================================

runContentRepositoryContract("DrizzleContentAdapter", makeDrizzleHarness);
