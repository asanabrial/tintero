/**
 * FilesystemContentAdapter wired into the shared ContentRepository contract suite.
 *
 * Creates a fresh temp dir, seeds it with normalized SeedData (posts as .md files +
 * config/site.yaml + config/taxonomies.yaml), constructs a FilesystemContentAdapter
 * pointing at it, and tears it down in cleanup.
 *
 * To run only this file: bun test test/lib/content/fs-content-repository.contract.test.ts
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { FilesystemContentAdapter } from "@/lib/content/fs-adapter";
import {
  runContentRepositoryContract,
  type Harness,
  type SeedData,
  type SeedPost,
  type SeedPage,
  type SeedTaxonomy,
} from "./content-repository-contract";

// ============================================================
// YAML helpers
// ============================================================

/**
 * Serialize a plain record into YAML frontmatter lines.
 * Handles strings (quoted), booleans, numbers, and string arrays (flow notation).
 */
function buildFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      // Escape inner double-quotes so the YAML remains valid.
      lines.push(`${k}: "${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    } else if (typeof v === "boolean" || typeof v === "number") {
      lines.push(`${k}: ${v}`);
    } else if (Array.isArray(v)) {
      const items = v.map((x) => `"${String(x)}"`).join(", ");
      lines.push(`${k}: [${items}]`);
    }
  }
  return lines.join("\n");
}

function postToMarkdown(post: SeedPost): string {
  const fm: Record<string, unknown> = {
    title: post.title,
    date: post.date,
    status: post.status ?? "published",
    tags: post.tags ?? [],
    categories: post.categories ?? [],
    comments: post.comments ?? true,
  };
  if (post.sticky !== undefined) fm.sticky = post.sticky;
  if (post.author !== undefined) fm.author = post.author;
  if (post.excerpt !== undefined) fm.excerpt = post.excerpt;
  if (post.visibility !== undefined) fm.visibility = post.visibility;
  if (post.password !== undefined) fm.password = post.password;
  if (post.coverImage !== undefined) fm.coverImage = post.coverImage;

  return `---\n${buildFrontmatter(fm)}\n---\n\n${post.body ?? ""}\n`;
}

function pageToMarkdown(page: SeedPage): string {
  const fm: Record<string, unknown> = {
    title: page.title,
    date: page.date,
  };
  if (page.status !== undefined) fm.status = page.status;
  if (page.menuOrder !== undefined) fm.menu_order = page.menuOrder;
  if (page.parent !== undefined) fm.parent = page.parent;
  if (page.excerpt !== undefined) fm.excerpt = page.excerpt;

  return `---\n${buildFrontmatter(fm)}\n---\n\n${page.body ?? ""}\n`;
}

function buildSiteYaml(data: SeedData): string {
  const title = data.siteTitle ?? "Test Site";
  const description = data.siteDescription ?? "";
  const baseUrl = data.siteBaseUrl ?? "http://localhost:3000";
  const author = data.siteAuthor ?? "Test Author";
  return [
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
  ].join("\n") + "\n";
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
// FS harness factory
// ============================================================

/**
 * Create a fresh FS harness backed by a temp directory.
 *
 * Directory layout (mirrors FilesystemContentAdapter expectations):
 *   <tmpBase>/
 *     content/           ← rootDir passed to the adapter
 *       posts/           ← SeedPost files written here as <slug>.md
 *       pages/           ← SeedPage files written here as <slug>.md
 *     config/
 *       site.yaml        ← read by getSiteConfig()
 *       taxonomies.yaml  ← read by listTags() / listCategories()
 */
async function makeFsHarness(): Promise<Harness> {
  const tmpBase = await fs.mkdtemp(
    path.join(os.tmpdir(), "tintero-contract-")
  );
  const rootDir = path.join(tmpBase, "content");
  const postsDir = path.join(rootDir, "posts");
  const pagesDir = path.join(rootDir, "pages");
  const configDir = path.join(tmpBase, "config");

  await fs.mkdir(postsDir, { recursive: true });
  await fs.mkdir(pagesDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });

  const repo = new FilesystemContentAdapter(rootDir);

  return {
    repo,

    async seed(data: SeedData): Promise<void> {
      for (const post of data.posts ?? []) {
        const content = postToMarkdown(post);
        await fs.writeFile(
          path.join(postsDir, `${post.slug}.md`),
          content,
          "utf-8"
        );
      }

      for (const page of data.pages ?? []) {
        const content = pageToMarkdown(page);
        await fs.writeFile(
          path.join(pagesDir, `${page.slug}.md`),
          content,
          "utf-8"
        );
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
      await fs.rm(tmpBase, { recursive: true, force: true });
    },
  };
}

// ============================================================
// Run contract
// ============================================================

runContentRepositoryContract("FilesystemContentAdapter", makeFsHarness);
