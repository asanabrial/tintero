// Public surface of the content library.
// FilesystemContentAdapter is intentionally NOT re-exported here.

import * as path from "path";
import { FsContentWriter } from "./fs-writer";
import { FsPageWriter } from "./fs-page-writer";
import { getRevisionRepository } from "../revisions/factory";
import type { ContentWriter, PageWriter } from "./ports";

export { getRepository, getLayoutSiteConfig, getLayoutTags, getLayoutCategories } from "./repository";
export type { ContentRepository, ListPostsOptions, ListPostsResult, ListPagesOptions, ListPagesResult, AdminStatus, StatusCounts } from "./ports";
export type { ArchivePeriod, Category, CommentsConfig, Page, Paginated, Post, ReadingConfig, SiteConfig, Tag, NavItem, WritingConfig } from "./types";
export {
  MONTH_NAMES,
  parseArchiveDate,
  parseYearParam,
  parseMonthParam,
  filterPostsByYear,
  filterPostsByYearMonth,
  buildArchiveIndex,
  formatPeriodLabel,
} from "./archive";

export { relatedPosts, prevNextPosts, scorePost } from "./related";

export { hideFuturePosts, isFuturePost, derivePostDisplayStatus, matchesAdminStatus, computeStatusCounts, clampPage } from "./schedule";

export { slugifyAuthor, filterPostsByAuthor, buildAuthorIndex } from "./author";
export type { AuthorEntry } from "./author";

/**
 * Returns a write-side adapter for posts.
 *
 * Selects the adapter based on the CONTENT_STORE environment variable:
 *   - unset / "fs" / any other value → FsContentWriter (default, unchanged behavior)
 *   - "db"     → DrizzleContentWriter (requires DATABASE_DIALECT + DATABASE_URL/FILE)
 *
 * The DB writer and its transitive dependencies (db-factory.ts → bun:sqlite) are loaded
 * lazily via require() only when CONTENT_STORE="db" is set, keeping bun:sqlite out of
 * the default module graph for the Next.js/Turbopack build.
 *
 * NOTE: DB-writer revision capture is a known follow-up concern. The revisions callback
 * is passed for signature parity; DrizzleContentWriter.captureRevision is best-effort
 * and swallows errors when the revisions DB is unavailable. Revision snapshotting for
 * DB-backed posts is not yet guaranteed end-to-end.
 *
 * Write-side factory — NOT cached, NOT wrapped in 'use cache'.
 * Cache invalidation is the Server Action layer's responsibility (ADR-4).
 * CRITICAL: No 'use cache' directive here or on getWriter().
 */
export function getWriter(): ContentWriter {
  if (process.env.CONTENT_STORE === "db") {
    // Lazy-load to keep bun:sqlite out of the default fs bundle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DrizzleContentWriter } = require("./drizzle-content-writer") as typeof import("./drizzle-content-writer");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getContentDb, getContentSchema } = require("./db-factory") as typeof import("./db-factory");
    return new DrizzleContentWriter(getContentDb(), getContentSchema(), () => getRevisionRepository());
  }
  return new FsContentWriter(
    path.join(process.cwd(), "content", "posts"),
    () => getRevisionRepository()
  );
}

/**
 * Returns a write-side adapter for pages.
 *
 * Selects the adapter based on the CONTENT_STORE environment variable:
 *   - unset / "fs" / any other value → FsPageWriter (default, unchanged behavior)
 *   - "db"     → DrizzlePageWriter (requires DATABASE_DIALECT + DATABASE_URL/FILE)
 *
 * The DB writer and its transitive dependencies (db-factory.ts → bun:sqlite) are loaded
 * lazily via require() only when CONTENT_STORE="db" is set, keeping bun:sqlite out of
 * the default module graph for the Next.js/Turbopack build.
 *
 * NOTE: DB-writer revision capture is a known follow-up concern. The revisions callback
 * is passed for signature parity; DrizzlePageWriter.captureRevision is best-effort
 * and swallows errors when the revisions DB is unavailable. Revision snapshotting for
 * DB-backed pages is not yet guaranteed end-to-end.
 *
 * Page write-side factory — NOT cached, NOT wrapped in 'use cache'.
 * CRITICAL: No 'use cache' directive here or on getPageWriter().
 */
export function getPageWriter(): PageWriter {
  if (process.env.CONTENT_STORE === "db") {
    // Lazy-load to keep bun:sqlite out of the default fs bundle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DrizzlePageWriter } = require("./drizzle-page-writer") as typeof import("./drizzle-page-writer");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getContentDb, getContentSchema } = require("./db-factory") as typeof import("./db-factory");
    return new DrizzlePageWriter(getContentDb(), getContentSchema(), () => getRevisionRepository());
  }
  return new FsPageWriter(
    path.join(process.cwd(), "content", "pages"),
    () => getRevisionRepository()
  );
}

// Re-export ContentWriter types for use in admin pages and actions
export type { ContentWriter, WriteResult, WriteError, CreatePostInput, UpdatePostInput } from "./ports";

// Taxonomy pure transforms — no filesystem or framework imports
export {
  renameInArray,
  mergeInArray,
  removeFromArray,
  findAffectedPosts,
} from "./taxonomy-ops";

// Taxonomy orchestration core — shared by all 6 taxonomy server actions
export { applyTaxonomyOp } from "./taxonomy-apply";
export type { TaxonomyReport, TaxonomyOp } from "./taxonomy-apply";

// Re-export PageWriter types
export type { PageWriter, CreatePageInput, UpdatePageInput } from "./ports";
