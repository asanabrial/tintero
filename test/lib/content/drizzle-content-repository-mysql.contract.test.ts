/**
 * DrizzleContentAdapter wired into the shared ContentRepository READ contract,
 * running against a LIVE MySQL/MariaDB server (docker mysql:8.4 / mariadb:11).
 *
 * This is the mysql twin of drizzle-content-repository-pg.contract.test.ts. It
 * proves the cross-dialect read SQL (drizzle-adapter.ts) genuinely works against
 * a real MySQL server using schema.mysql.ts (mysqlTable objects + the mysql2
 * driver) — the exact production wiring for DATABASE_DIALECT=mysql.
 *
 * GATING: the whole file is skipped unless MYSQL_TEST_URL is set, so CI and
 * docker-less devs stay green. Run it with, e.g.:
 *   MYSQL_TEST_URL="mysql://root:tintero@127.0.0.1:3307/tintero" \
 *     bun test test/lib/content/drizzle-content-repository-mysql.contract.test.ts
 *
 * The tables must already exist (push via drizzle.content.mysql.config.ts). The
 * harness applies the case-sensitive collation override and clears all rows
 * before seeding (see make-test-mysql-db.ts).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { describe, test } from "bun:test";
import { eq } from "drizzle-orm";
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
import {
  MYSQL_TEST_URL,
  getMysqlTestDb,
  truncateAllContentTables,
  mysqlSchema as schema,
} from "./make-test-mysql-db";

// ============================================================
// YAML serialisation helpers (identical to the pg/sqlite harnesses)
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
// MySQL reader harness factory
// ============================================================

async function makeMysqlReaderHarness(): Promise<Harness> {
  const { db } = await getMysqlTestDb();
  await truncateAllContentTables(db);

  const tmpBase = await fs.mkdtemp(
    path.join(os.tmpdir(), "tintero-mysql-contract-")
  );
  const configDir = path.join(tmpBase, "config");
  await fs.mkdir(configDir, { recursive: true });

  const repo = new DrizzleContentAdapter(db, configDir, schema);

  return {
    repo,

    async seed(data: SeedData): Promise<void> {
      const now = nowEpoch();
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

      // SEO field keys in insertion order (mirrors backfill.ts SEO_FIELDS)
      const SEO_FIELDS = [
        "title",
        "metaDescription",
        "focusKeyphrase",
        "canonical",
        "noindex",
        "ogImage",
        "cornerstone",
      ] as const;

      async function insertSeoMeta(
        contentId: string,
        seo: Record<string, unknown>
      ): Promise<void> {
        for (const field of SEO_FIELDS) {
          const value = seo[field];
          if (value === undefined) continue;
          const metaValue =
            typeof value === "boolean"
              ? value
                ? "true"
                : "false"
              : String(value);
          await db.insert(schema.content_meta).values({
            id: newId(),
            content_id: contentId,
            meta_key: `seo.${field}`,
            meta_value: metaValue,
          });
        }
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

        for (const rawTag of post.tags ?? []) {
          const tagSlug = slugifyTag(rawTag);
          const termId = await getOrCreateTerm("tag", tagSlug, rawTag);
          await db.insert(schema.term_relationships).values({
            content_id: contentId,
            term_id: termId,
          });
        }

        for (const rawCat of post.categories ?? []) {
          const catSlug = joinSlug(slugifyCategory(rawCat));
          if (catSlug === "") continue;
          const termId = await getOrCreateTerm("category", catSlug, rawCat);
          await db.insert(schema.term_relationships).values({
            content_id: contentId,
            term_id: termId,
          });
        }

        if (post.seo !== undefined) {
          await insertSeoMeta(contentId, post.seo as Record<string, unknown>);
        }
      }

      // Seed pages — two-pass parent resolution (mirrors backfill.ts).
      const pageIdBySlug = new Map<string, string>();

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
          parent_id: null,
          menu_order: page.menuOrder ?? 0,
          published_at: toEpoch(page.date),
          created_at: now,
          updated_at: now,
        });

        pageIdBySlug.set(page.slug, contentId);

        if (page.seo !== undefined) {
          await insertSeoMeta(contentId, page.seo as Record<string, unknown>);
        }
      }

      for (const page of data.pages ?? []) {
        if (!page.parent) continue;
        const parentId = pageIdBySlug.get(page.parent);
        if (!parentId) continue;
        const childId = pageIdBySlug.get(page.slug);
        if (!childId) continue;
        await db
          .update(schema.content)
          .set({ parent_id: parentId })
          .where(eq(schema.content.id, childId));
      }

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
      // The shared mysql pool lives for the whole process (closed at exit);
      // only the per-harness config temp dir needs removing here.
      await fs.rm(tmpBase, { recursive: true, force: true });
    },
  };
}

// ============================================================
// Run contract (gated on MYSQL_TEST_URL)
// ============================================================

if (MYSQL_TEST_URL) {
  runContentRepositoryContract(
    "DrizzleContentAdapter (live MySQL)",
    makeMysqlReaderHarness
  );
} else {
  describe.skip(
    "DrizzleContentAdapter (live MySQL) — skipped: MYSQL_TEST_URL unset",
    () => {
      test("requires MYSQL_TEST_URL", () => {});
    }
  );
}
