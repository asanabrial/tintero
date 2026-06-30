// Repository module: wraps FilesystemContentAdapter with 'use cache' for Next.js caching.
// All functions exported from here are safe to call from RSC pages.
//
// Architecture:
// - Module-level standalone async functions hold the 'use cache' directive.
//   Each takes `fp` (area fingerprint) as the FIRST explicit argument — this makes
//   the fingerprint part of the cache key (per use-cache.md "Serializable arguments").
//   Passing fp as an explicit primitive (NOT closed over) avoids the build-hang trap.
// - The getRepository() facade is UNCACHED. Each method computes the area fingerprint
//   at request time then delegates to the appropriate module-level cached function.
// - Cache tags are preserved so admin updateTag() still busts entries same-request.

import * as path from "path";
import { cacheLife } from "next/cache";
import { cacheTag } from "next/cache";
import { FilesystemContentAdapter } from "./fs-adapter";
import { DrizzleContentAdapter } from "./drizzle-adapter";
import { ShadowContentAdapter } from "./shadow-adapter";
import { getContentDb, getContentSchema } from "./db-factory";
import { postsFingerprint, pagesFingerprint, siteConfigFingerprint, taxonomiesFingerprint } from "./fingerprint";
import type { ContentRepository, ListPostsOptions, ListPostsResult, ListPagesOptions, ListPagesResult, StatusCounts } from "./ports";
import type { LinkGraph, UnlinkedMention } from "./links";
import type { Category, Page, Post, SiteConfig, Tag } from "./types";

const CONTENT_ROOT = path.join(process.cwd(), "content");
/** Config directory — contains site.yaml and taxonomies.yaml (mirrors FS adapter path). */
const CONFIG_ROOT = path.join(process.cwd(), "config");

let _adapter: ContentRepository | null = null;

/**
 * Returns the singleton content adapter.
 *
 * Selects the adapter based on the CONTENT_STORE environment variable:
 *   - unset / "fs" / any other value → FilesystemContentAdapter (default, unchanged behavior)
 *   - "db"     → DrizzleContentAdapter (requires DATABASE_DIALECT + DATABASE_URL/FILE)
 *   - "shadow" → ShadowContentAdapter wrapping FilesystemContentAdapter (primary/oracle)
 *                and DrizzleContentAdapter (secondary). The filesystem result is ALWAYS
 *                returned; the DB read is shadowed for comparison only and divergences are
 *                logged to console.warn with the prefix "[content:shadow]". Requires the
 *                same DATABASE_DIALECT + DATABASE_URL/FILE as the "db" branch.
 *
 * The DB adapter and its transitive dependencies (db-factory.ts → the native DB driver) are loaded
 * lazily via require() only when CONTENT_STORE="db" or CONTENT_STORE="shadow" is set,
 * keeping the native DB driver out of the default module graph for the Next.js/Turbopack build.
 */
export function getAdapter(): ContentRepository {
  if (!_adapter) {
    if (process.env.CONTENT_STORE === "db") {
      // Native drivers stay out of the default graph via next.config
      // serverExternalPackages + db-factory's per-dialect lazy require().
      _adapter = new DrizzleContentAdapter(getContentDb(), CONFIG_ROOT, getContentSchema());
    } else if (process.env.CONTENT_STORE === "shadow") {
      const primary = new FilesystemContentAdapter(CONTENT_ROOT);
      const secondary = new DrizzleContentAdapter(getContentDb(), CONFIG_ROOT, getContentSchema());
      _adapter = new ShadowContentAdapter(primary, secondary);
    } else {
      _adapter = new FilesystemContentAdapter(CONTENT_ROOT);
    }
  }
  return _adapter;
}

/**
 * Reset the memoised adapter singleton.
 *
 * ONLY for use in tests — call this in beforeEach / afterEach to isolate
 * test cases that manipulate process.env.CONTENT_STORE.
 * Never call this in production code.
 */
export function __resetAdapterForTests(): void {
  _adapter = null;
}

// ---- Module-level cached inner functions (fp is FIRST arg → part of cache key) ----
// These are module-level standalone async functions, NOT object-method literals.
// 'use cache' on a standalone module-level fn is reliable (per CACHE-02).

async function cachedListPosts(
  _fp: string,
  options?: ListPostsOptions
): Promise<ListPostsResult> {
  "use cache";
  cacheLife("max");
  cacheTag("posts");
  return getAdapter().listPosts(options);
}

async function cachedGetPost(_fp: string, slug: string): Promise<Post | null> {
  "use cache";
  cacheLife("max");
  cacheTag("posts");
  cacheTag(`post:${slug}`);
  return getAdapter().getPost(slug);
}

async function cachedListPages(_fp: string, options?: ListPagesOptions): Promise<ListPagesResult> {
  "use cache";
  cacheLife("max");
  cacheTag("pages");
  return getAdapter().listPages(options);
}

async function cachedListPostStatusCounts(_fp: string, now: string): Promise<StatusCounts> {
  "use cache";
  cacheLife("max");
  cacheTag("posts");
  return getAdapter().listPostStatusCounts(now);
}

async function cachedGetPage(_fp: string, slug: string): Promise<Page | null> {
  "use cache";
  cacheLife("max");
  cacheTag("pages");
  cacheTag(`page:${slug}`);
  return getAdapter().getPage(slug);
}

async function cachedListTags(_fp: string): Promise<Tag[]> {
  "use cache";
  cacheLife("max");
  cacheTag("tags");
  return getAdapter().listTags();
}

async function cachedListCategories(_fp: string): Promise<Category[]> {
  "use cache";
  cacheLife("max");
  cacheTag("categories");
  return getAdapter().listCategories();
}

async function cachedGetSiteConfig(_fp: string): Promise<SiteConfig> {
  "use cache";
  cacheLife("max");
  cacheTag("site-config");
  return getAdapter().getSiteConfig();
}

async function cachedGetLinkGraph(_fp: string): Promise<LinkGraph> {
  "use cache";
  cacheLife("max");
  // The graph spans posts AND pages, so it is busted by either area's tag.
  cacheTag("posts");
  cacheTag("pages");
  cacheTag("graph");
  return getAdapter().getLinkGraph();
}

async function cachedGetUnlinkedMentions(
  _fp: string,
  id: string,
  publicOnly: boolean
): Promise<UnlinkedMention[]> {
  "use cache";
  cacheLife("max");
  cacheTag("posts");
  cacheTag("pages");
  cacheTag("graph");
  return getAdapter().getUnlinkedMentions(id, { publicOnly });
}

// ---- Static cached config (for shell components like RootLayout) ----
// The RootLayout is prerendered as the static PPR shell. It cannot call connection()
// (that would break PPR) and cannot have uncached I/O outside Suspense (build error).
// This export provides a 'use cache' -safe getSiteConfig for shell-level callers.
// Uses a stable constant key ("") so it is always a cache hit during prerender.
// NOTE: This does NOT reflect live site.yaml changes immediately — shell components
// only pick up changes when the cache expires or the server restarts. This is
// intentional: nav/language/author in the layout are considered stable config.

export async function getLayoutSiteConfig(): Promise<SiteConfig> {
  return cachedGetSiteConfig("");
}

// Shell-safe tag list — bypasses fingerprint computation so the static PPR shell
// can call this outside <Suspense> without triggering "uncached data" build errors.
// Uses "" as the fixed fingerprint key (same pattern as getLayoutSiteConfig).
// NOTE: Does NOT reflect live taxonomy changes immediately — picks up changes on
// cache expiry or server restart. Intentional for the static heading/description shell.
export async function getLayoutTags(): Promise<Tag[]> {
  return cachedListTags("");
}

// Shell-safe category list — same rationale as getLayoutTags above.
export async function getLayoutCategories(): Promise<Category[]> {
  return cachedListCategories("");
}

// ---- Uncached facade: compute area fingerprint, delegate to cached inner ----
// Area mapping (per design § 3):
//   postsFingerprint      → listPosts, getPost, listTags, listCategories
//   pagesFingerprint      → listPages, getPage
//   siteConfigFingerprint → getSiteConfig (at request-time, via connection() routes)
//
// Facade signatures match ContentRepository (ports.ts) exactly — callers unaffected.

/**
 * Returns a ContentRepository facade whose methods are individually cached.
 * The app layer depends on this interface only — never on FilesystemContentAdapter.
 */
export function getRepository(): ContentRepository {
  return {
    async listPosts(options?: ListPostsOptions): Promise<ListPostsResult> {
      return cachedListPosts(await postsFingerprint(), options);
    },

    async getPost(slug: string): Promise<Post | null> {
      return cachedGetPost(await postsFingerprint(), slug);
    },

    async listPages(options?: ListPagesOptions): Promise<ListPagesResult> {
      return cachedListPages(await pagesFingerprint(), options);
    },

    async listPostStatusCounts(now: string): Promise<StatusCounts> {
      return cachedListPostStatusCounts(await postsFingerprint(), now);
    },

    async getPage(slug: string, _options?: { includeDrafts?: boolean }): Promise<Page | null> {
      // options intentionally ignored — cached path never includes drafts (preview bypasses this)
      return cachedGetPage(await pagesFingerprint(), slug);
    },

    async listTags(): Promise<Tag[]> {
      const [postsFp, taxFp] = await Promise.all([postsFingerprint(), taxonomiesFingerprint()]);
      return cachedListTags(`${postsFp}:${taxFp}`);
    },

    async listCategories(): Promise<Category[]> {
      const [postsFp, taxFp] = await Promise.all([postsFingerprint(), taxonomiesFingerprint()]);
      return cachedListCategories(`${postsFp}:${taxFp}`);
    },

    async getSiteConfig(): Promise<SiteConfig> {
      return cachedGetSiteConfig(await siteConfigFingerprint());
    },

    async getLinkGraph(): Promise<LinkGraph> {
      const [postsFp, pagesFp] = await Promise.all([
        postsFingerprint(),
        pagesFingerprint(),
      ]);
      return cachedGetLinkGraph(`${postsFp}:${pagesFp}`);
    },

    async getUnlinkedMentions(
      id: string,
      options?: { publicOnly?: boolean }
    ): Promise<UnlinkedMention[]> {
      const [postsFp, pagesFp] = await Promise.all([
        postsFingerprint(),
        pagesFingerprint(),
      ]);
      return cachedGetUnlinkedMentions(
        `${postsFp}:${pagesFp}`,
        id,
        options?.publicOnly ?? false
      );
    },
  };
}
