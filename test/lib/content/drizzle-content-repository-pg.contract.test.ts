/**
 * DrizzleContentAdapter wired into the shared ContentRepository contract suite,
 * running against an in-memory PostgreSQL database (PGlite).
 *
 * Purpose: prove that the SQL pushdown code is cross-dialect AND that
 * schema.pg.ts is genuinely exercised — not dead code. This harness uses
 * PgTable objects (schema.pg.ts) with a PG drizzle driver, matching the
 * real production wiring for DATABASE_DIALECT=postgresql.
 *
 * Key differences from the bun:sqlite harness:
 *  - Imports schema.pg.ts (PgTable objects) — NOT schema.sqlite.ts
 *  - Timestamps (published_at, created_at, updated_at) are BIGINT in the DDL,
 *    because millisecond epoch values (~1.7e12) exceed PG INTEGER max (~2.1e9).
 *    schema.pg.ts currently defines these as integer() columns, which works for
 *    column-name SQL generation; a future fix to schema.pg.ts should use
 *    bigint() to keep the drizzle schema and actual PG DDL in sync.
 *  - boolean-context literals use 'false' not '0' (FIX 1 — PG requires boolean).
 *  - drizzle COUNT(*) returns a JS number from pglite (no string parse needed).
 *  - The `db: any` cast is removed — PgliteDatabase<typeof schemaPg> is
 *    structurally compatible with DrizzleDb = any at the adapter boundary.
 *
 * To run only this file:
 *   bun test test/lib/content/drizzle-content-repository-pg.contract.test.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
// Use the PG schema — this is what genuinely exercises schema.pg.ts.
// DrizzleDb = any accepts PgliteDatabase, and PgTable objects produce
// identical column-name SQL to SQLiteTable objects (by conformance test).
import * as schemaPg from "@/lib/content/schema.pg";
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
// DDL — Postgres-compatible schema matching schema.pg.ts
//
// Timestamp columns (published_at, created_at, updated_at) use BIGINT,
// matching schema.pg.ts which now declares them as bigint({ mode:"number" }).
// Millisecond epoch values (~1.75e12) exceed Postgres INT4 max (~2.1e9).
//
// This hand-written DDL must stay in sync with schema.pg.ts.
// The conformance test (schema-conformance.test.ts) guards descriptor↔schema
// drift between dialects; it does NOT validate this DDL — that requires a
// drizzle-kit push or migration comparison, deferred to the migration slice.
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
  published_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
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

CREATE INDEX IF NOT EXISTS idx_content_meta_content_id_meta_key
  ON content_meta (content_id, meta_key);
`;

// ============================================================
// YAML serialisation helpers (identical to bun:sqlite harness)
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
// PGlite harness factory
// ============================================================

async function makePgliteHarness(): Promise<Harness> {
  // In-memory Postgres database (PGlite — no file, no port)
  const pg = new PGlite();
  await pg.exec(DDL);

  // Build the drizzle instance with the PG schema.
  // PgliteDatabase<typeof schemaPg> is structurally compatible with DrizzleDb = any;
  // no explicit `any` cast needed here — DrizzleContentAdapter takes DrizzleDb = any.
  // COUNT(*) from PGlite returns a JS number directly (verified); the existing
  // Number() wrapper in the adapter handles both number and bigint string safely.
  const db = drizzle(pg, { schema: schemaPg });

  // Temp directory for YAML config files
  const tmpBase = await fs.mkdtemp(
    path.join(os.tmpdir(), "tintero-pglite-contract-")
  );
  const configDir = path.join(tmpBase, "config");
  await fs.mkdir(configDir, { recursive: true });

  // Pass schemaPg to the adapter — this is the crux of the fix: the adapter
  // now uses PgTable objects (not SQLiteTable) when running against Postgres.
  const repo = new DrizzleContentAdapter(db, configDir, schemaPg);

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
        await db.insert(schemaPg.terms).values({
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
        await db.insert(schemaPg.content).values({
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
          await db.insert(schemaPg.term_relationships).values({
            content_id: contentId,
            term_id: termId,
          });
        }

        // Category terms + relationships.
        for (const rawCat of post.categories ?? []) {
          const catSlug = joinSlug(slugifyCategory(rawCat));
          if (catSlug === "") continue;
          const termId = await getOrCreateTerm("category", catSlug, rawCat);
          await db.insert(schemaPg.term_relationships).values({
            content_id: contentId,
            term_id: termId,
          });
        }
      }

      // Seed pages
      for (const page of data.pages ?? []) {
        await db.insert(schemaPg.content).values({
          id: newId(),
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
      // PGlite in-memory databases do not need an explicit close; drop the
      // reference and let GC collect it. Remove the config temp dir.
      await fs.rm(tmpBase, { recursive: true, force: true });
    },
  };
}

// ============================================================
// Run contract
// ============================================================

runContentRepositoryContract("DrizzleContentAdapter (pglite/PG)", makePgliteHarness);
