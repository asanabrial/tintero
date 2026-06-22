// Public surface of the content library.
// FilesystemContentAdapter is intentionally NOT re-exported here.

import * as path from "path";
import { FsContentWriter } from "./fs-writer";
import { FsPageWriter } from "./fs-page-writer";
import { getRevisionRepository } from "../revisions/factory";
import type { ContentWriter, PageWriter } from "./ports";

export { getRepository, getLayoutSiteConfig } from "./repository";
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

// Write-side factory — NOT cached, NOT wrapped in 'use cache'.
// Cache invalidation is the Server Action layer's responsibility (ADR-4).
// CRITICAL: No 'use cache' directive here or on getWriter().
export function getWriter(): ContentWriter {
  return new FsContentWriter(
    path.join(process.cwd(), "content", "posts"),
    () => getRevisionRepository()
  );
}

// Page write-side factory — NOT cached, NOT wrapped in 'use cache'.
// CRITICAL: No 'use cache' directive here or on getPageWriter().
export function getPageWriter(): PageWriter {
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
