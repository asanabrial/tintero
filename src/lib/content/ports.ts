// ContentRepository port — the single interface the app layer depends on.
// Adapters implement this. The app layer NEVER imports FilesystemContentAdapter directly.

import type { Category, Page, Post, PostSeo, SiteConfig, Tag } from "./types";
import type { LinkGraph, UnlinkedMention } from "./links";
import type { RevisionContext } from "../revisions/types";

// ============================================================
// ContentWriter port — write-side mutations for posts.
// Kept separate from ContentRepository (read-side) per ADR-2.
// ============================================================

export interface CreatePostInput {
  title: string;
  slug?: string;
  date: string;
  status: "published" | "draft";
  excerpt?: string;
  coverImage?: string;
  tags: string[];
  categories: string[];
  comments: boolean;
  sticky?: boolean;
  body: string;
  /** Display author/byline. Written to frontmatter; omitted when empty. */
  author?: string;
  /** UUID of the creating user. Written to frontmatter; absent on pre-RBAC posts. */
  authorId?: string;
  visibility?: "public" | "private" | "password";
  password?: string;
  /** Per-content SEO overrides (Yoast-style). Omitted/empty fields are not written. */
  seo?: PostSeo;
}

// UpdatePostInput is a full replacement of all post fields (same shape as CreatePostInput).
export type UpdatePostInput = CreatePostInput;

export type WriteResult =
  | { ok: true; slug: string }
  | { ok: false; error: WriteError };

export type WriteError =
  | { kind: "slug_collision"; slug: string }
  | { kind: "invalid_frontmatter"; issues: string }
  | { kind: "post_not_found"; slug: string }
  | { kind: "page_not_found"; slug: string }
  | { kind: "invalid_slug"; slug: string };

export interface TrashedItemInfo {
  slug: string;
  title: string;
  date: string;
}

export interface ContentWriter {
  createPost(input: CreatePostInput, rev?: RevisionContext): Promise<WriteResult>;
  updatePost(currentSlug: string, input: UpdatePostInput, rev?: RevisionContext): Promise<WriteResult>;
  deletePost(slug: string): Promise<WriteResult>;
  readRaw(slug: string): Promise<{ frontmatter: Record<string, unknown>; rawData: Record<string, unknown>; body: string } | null>;
  setPostStatus(slug: string, status: "published" | "draft"): Promise<WriteResult>;
  trashPost(slug: string): Promise<WriteResult>;
  listTrashedPosts(): Promise<TrashedItemInfo[]>;
  restorePost(slug: string): Promise<WriteResult>;
  permanentlyDeletePost(slug: string): Promise<WriteResult>;
}

// ============================================================
// PageWriter port — write-side mutations for pages.
// ============================================================

export interface CreatePageInput {
  title: string;
  slug?: string;
  date: string;
  status?: "published" | "draft";
  excerpt?: string;
  body: string;
  parent?: string;
  menuOrder?: number;
  /** Per-content SEO overrides (Yoast-style). Omitted/empty fields are not written. */
  seo?: PostSeo;
}

// UpdatePageInput is a full replacement of all page fields (same shape as CreatePageInput).
export type UpdatePageInput = CreatePageInput;

export interface PageWriter {
  createPage(input: CreatePageInput, rev?: RevisionContext): Promise<WriteResult>;
  updatePage(currentSlug: string, input: UpdatePageInput, rev?: RevisionContext): Promise<WriteResult>;
  deletePage(slug: string): Promise<WriteResult>;
  readRawPage(slug: string): Promise<{ frontmatter: Record<string, unknown>; rawData: Record<string, unknown>; body: string } | null>;
  setPageStatus(slug: string, status: "published" | "draft"): Promise<WriteResult>;
  trashPage(slug: string): Promise<WriteResult>;
  listTrashedPages(): Promise<TrashedItemInfo[]>;
  restorePage(slug: string): Promise<WriteResult>;
  permanentlyDeletePage(slug: string): Promise<WriteResult>;
}

export type AdminStatus = "published" | "draft" | "scheduled";

export interface StatusCounts {
  all: number;
  published: number;
  draft: number;
  scheduled: number;
}

export interface ListPostsOptions {
  page?: number;
  tag?: string;
  category?: string;
  includeDrafts?: boolean;
  pageSize?: number;
  query?: string;
  author?: string;
  adminStatus?: AdminStatus;
  now?: string;
}

export interface ListPostsResult {
  posts: Post[];
  total: number;
  totalPages: number;
}

export interface ListPagesOptions {
  page?: number;
  pageSize?: number;
  query?: string;
  includeDrafts?: boolean;
}

export interface ListPagesResult {
  pages: Page[];
  total: number;
  totalPages: number;
}

// ============================================================
// RawBodyReader port — provides access to the raw (pre-render) markdown body.
// Implemented by FilesystemContentAdapter so backfill can store body_markdown
// without going through the HTML rendering pipeline.
// Kept minimal: only the raw body string is needed; frontmatter is already
// available through ContentRepository.listPosts / listPages.
// ============================================================

export interface RawBodyReader {
  /**
   * Read the raw (unrendered) markdown body for a post by slug.
   * Returns null when the slug is not found.
   */
  readRawPost(slug: string): Promise<{ body: string } | null>;

  /**
   * Read the raw (unrendered) markdown body for a page by slug.
   * Returns null when the slug is not found.
   */
  readRawPage(slug: string): Promise<{ body: string } | null>;
}

export interface ContentRepository {
  listPosts(options?: ListPostsOptions): Promise<ListPostsResult>;
  getPost(slug: string, options?: ListPostsOptions): Promise<Post | null>;
  listPages(options?: ListPagesOptions): Promise<ListPagesResult>;
  listPostStatusCounts(now: string): Promise<StatusCounts>;
  getPage(slug: string, options?: { includeDrafts?: boolean }): Promise<Page | null>;
  listTags(): Promise<Tag[]>;
  listCategories(): Promise<Category[]>;
  getSiteConfig(): Promise<SiteConfig>;
  /**
   * Build the full content link graph (posts + pages) from explicit links —
   * wikilinks and internal markdown links. Returns ALL content with published/
   * public flags set; callers use publicGraph() (links.ts) to derive the
   * reader-facing subgraph. See src/lib/content/links.ts.
   */
  getLinkGraph(): Promise<LinkGraph>;
  /**
   * Notes that name `id`'s title in prose without linking to it — Obsidian's
   * "Unlinked mentions". When `publicOnly` is set, only published+public sources
   * are scanned so drafts/private/password content never surfaces.
   */
  getUnlinkedMentions(
    id: string,
    options?: { publicOnly?: boolean }
  ): Promise<UnlinkedMention[]>;
}
