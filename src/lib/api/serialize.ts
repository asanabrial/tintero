// Pure serialization helpers for the content API.
// NO new Date(), NO Next.js/fs imports — deterministic and framework-agnostic.

import type { Post, Page } from "@/lib/content/types";
import type { PostFrontmatter, PageFrontmatter } from "@/lib/content/schema";
import type { Comment, PublicComment } from "@/lib/comments/types";
import type { Tag, Category } from "@/lib/content/types";
import type { PublicUser, Role } from "@/lib/auth/types";
import type { SiteConfig } from "@/lib/content/types";
import type { MediaAsset } from "@/lib/media/types";
import type { MediaMeta } from "@/lib/media/media-meta";

// ============================================================
// JSON shape types
// ============================================================

export interface PostJson {
  slug: string;
  title: string;
  date: string;
  status: "published" | "draft";
  tags: string[];
  categories: string[];
  excerpt: string;
  author: string;
  comments: boolean;
  html: string;
}

export interface PostJsonFull extends PostJson {
  raw?: string;
  frontmatter?: PostFrontmatter;
}

export interface PageJson {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  html: string;
}

export interface PageJsonFull extends PageJson {
  raw?: string;
  frontmatter?: PageFrontmatter;
}

export interface PostListJson {
  posts: PostJson[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageListJson {
  pages: PageJson[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================
// Frontmatter pickers — whitelist only, no unknown-key leakage
// ============================================================

// Known PostFrontmatter keys from schema.ts (PostFrontmatterSchema keys)
const POST_FM_KEYS = [
  "title",
  "date",
  "status",
  "tags",
  "categories",
  "excerpt",
  "slug",
  "comments",
  "author",
  "authorId",
  "coverImage",
  "visibility",
  "password",
  "sticky",
  "seo",
] as const;

// Known PageFrontmatter keys from schema.ts (PageFrontmatterSchema keys)
const PAGE_FM_KEYS = [
  "title",
  "date",
  "status",
  "excerpt",
  "slug",
  "parent",
  "menu_order",
  "seo",
] as const;

/**
 * Picks only the known PostFrontmatter keys from raw data.
 * Drops ALL unknown keys — no leakage.
 */
export function pickPostFrontmatter(
  data: Record<string, unknown>
): PostFrontmatter {
  const result: Record<string, unknown> = {};
  for (const key of POST_FM_KEYS) {
    if (key in data) {
      result[key] = data[key];
    }
  }
  return result as unknown as PostFrontmatter;
}

/**
 * Picks only the known PageFrontmatter keys from raw data.
 * Drops ALL unknown keys — no leakage.
 */
export function pickPageFrontmatter(
  data: Record<string, unknown>
): PageFrontmatter {
  const result: Record<string, unknown> = {};
  for (const key of PAGE_FM_KEYS) {
    if (key in data) {
      result[key] = data[key];
    }
  }
  return result as unknown as PageFrontmatter;
}

// ============================================================
// Serializers
// ============================================================

type RawResult = {
  frontmatter: Record<string, unknown>;
  rawData: Record<string, unknown>;
  body: string;
} | null;

/**
 * Maps a Post to the whitelisted PostJson shape.
 * NEVER spreads the post object — always explicit field picks.
 */
export function toPostJson(post: Post): PostJson {
  return {
    slug: post.slug,
    title: post.title,
    date: post.date,
    status: post.status,
    tags: post.tags,
    categories: post.categories,
    excerpt: post.excerpt,
    author: post.author,
    comments: post.comments,
    html: post.html,
  };
}

/**
 * Maps a Post to the PostJsonFull shape.
 * If raw is null, returns a PostJson-shaped object WITHOUT raw/frontmatter (ADR-3).
 * The raw parameter body is the markdown string; rawData provides typed frontmatter keys.
 */
export function toPostJsonFull(post: Post, raw: RawResult): PostJsonFull {
  const base = toPostJson(post);
  if (raw === null) {
    return base;
  }
  return {
    ...base,
    raw: raw.body,
    frontmatter: pickPostFrontmatter(raw.rawData),
  };
}

/**
 * Maps a Page to the whitelisted PageJson shape.
 */
export function toPageJson(page: Page): PageJson {
  return {
    slug: page.slug,
    title: page.title,
    date: page.date,
    excerpt: page.excerpt,
    html: page.html,
  };
}

/**
 * Maps a Page to the PageJsonFull shape.
 * If raw is null, returns a PageJson-shaped object WITHOUT raw/frontmatter (ADR-3).
 */
export function toPageJsonFull(page: Page, raw: RawResult): PageJsonFull {
  const base = toPageJson(page);
  if (raw === null) {
    return base;
  }
  return {
    ...base,
    raw: raw.body,
    frontmatter: pickPageFrontmatter(raw.rawData),
  };
}

/**
 * Wraps a list of posts with pagination metadata.
 */
export function toPostListJson(
  posts: Post[],
  meta: { total: number; page: number; pageSize: number }
): PostListJson {
  return {
    posts: posts.map(toPostJson),
    total: meta.total,
    page: meta.page,
    pageSize: meta.pageSize,
  };
}

/**
 * Wraps a list of pages with pagination metadata.
 */
export function toPageListJson(
  pages: Page[],
  meta: { total: number; page: number; pageSize: number }
): PageListJson {
  return {
    pages: pages.map(toPageJson),
    total: meta.total,
    page: meta.page,
    pageSize: meta.pageSize,
  };
}

// ============================================================
// Comments serializers
// ============================================================

export interface CommentJson {
  id: string;
  postSlug: string;
  authorName: string;
  authorUrl: string | null;
  body: string;
  status: "pending" | "approved" | "spam" | "trash";
  parentId: string | null;
  createdAt: string; // ISO 8601
}

export interface CommentListJson {
  comments: CommentJson[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Maps a Comment or PublicComment to the whitelisted CommentJson shape.
 * SECURITY: authorEmail is NEVER included — explicit object literal, no spread.
 */
export function toCommentJson(c: Comment | PublicComment): CommentJson {
  return {
    id: c.id,
    postSlug: c.postSlug,
    authorName: c.authorName,
    authorUrl: c.authorUrl,
    body: c.body,
    status: c.status,
    parentId: c.parentId,
    createdAt: c.createdAt.toISOString(),
  };
}

/**
 * Wraps a list of comments with pagination metadata.
 */
export function toCommentListJson(
  items: (Comment | PublicComment)[],
  meta: { total: number; page: number; pageSize: number }
): CommentListJson {
  return {
    comments: items.map(toCommentJson),
    total: meta.total,
    page: meta.page,
    pageSize: meta.pageSize,
  };
}

// ============================================================
// Tags serializers
// ============================================================

export interface TagJson {
  slug: string;
  label: string;
  count: number;
}

export interface TagListJson {
  tags: TagJson[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Maps a Tag to the whitelisted TagJson shape.
 */
export function toTagJson(t: Tag): TagJson {
  return { slug: t.slug, label: t.label, count: t.count };
}

/**
 * Wraps a list of tags with pagination metadata.
 */
export function toTagListJson(
  items: Tag[],
  meta: { total: number; page: number; pageSize: number }
): TagListJson {
  return {
    tags: items.map(toTagJson),
    total: meta.total,
    page: meta.page,
    pageSize: meta.pageSize,
  };
}

// ============================================================
// Categories serializers
// ============================================================

export interface CategoryJson {
  slug: string;
  label: string;
  count: number;
  depth: number;
  segments: string[];
}

export interface CategoryListJson {
  categories: CategoryJson[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Maps a Category to the whitelisted CategoryJson shape.
 */
export function toCategoryJson(c: Category): CategoryJson {
  return {
    slug: c.slug,
    label: c.label,
    count: c.count,
    depth: c.depth,
    segments: c.segments,
  };
}

/**
 * Wraps a list of categories with pagination metadata.
 */
export function toCategoryListJson(
  items: Category[],
  meta: { total: number; page: number; pageSize: number }
): CategoryListJson {
  return {
    categories: items.map(toCategoryJson),
    total: meta.total,
    page: meta.page,
    pageSize: meta.pageSize,
  };
}

// ============================================================
// Users serializers
// ============================================================

export interface UserJson {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface UserListJson {
  users: UserJson[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Maps a PublicUser to the whitelisted UserJson shape.
 * SECURITY: explicit object literal — NEVER spread, NEVER include passwordHash.
 * PublicUser has no passwordHash field, but the explicit literal enforces the contract.
 */
export function toUserJson(u: PublicUser): UserJson {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  };
}

/**
 * Wraps a list of PublicUsers with pagination metadata.
 */
export function toUserListJson(
  users: PublicUser[],
  meta: { total: number; page: number; pageSize: number }
): UserListJson {
  return {
    users: users.map(toUserJson),
    total: meta.total,
    page: meta.page,
    pageSize: meta.pageSize,
  };
}

// ============================================================
// Site config serializer
// ============================================================

export interface SiteConfigJson {
  title: string;
  description: string;
  baseUrl: string;
  language: string;
  author: { name: string; email?: string };
  nav: { label: string; href: string }[];
  social?: Record<string, string>;
  reading: {
    homepage: "hero-recent" | "latest-posts" | "static-page";
    static_page?: string;
    posts_per_page: number;
  };
  comments: { enabled: boolean; moderation: "auto" | "manual" };
}

/**
 * Maps a SiteConfig to the whitelisted SiteConfigJson shape.
 * SECURITY: explicit field whitelist — NEVER spread the config object.
 * Guards against future secret-bearing field additions.
 */
export function toSiteConfigJson(c: SiteConfig): SiteConfigJson {
  return {
    title: c.title,
    description: c.description,
    baseUrl: c.baseUrl,
    language: c.language,
    author: {
      name: c.author.name,
      ...(c.author.email !== undefined ? { email: c.author.email } : {}),
    },
    nav: c.nav.map((n) => ({ label: n.label, href: n.href })),
    ...(c.social !== undefined ? { social: c.social } : {}),
    reading: {
      homepage: c.reading.homepage,
      posts_per_page: c.reading.posts_per_page,
      ...(c.reading.static_page !== undefined
        ? { static_page: c.reading.static_page }
        : {}),
    },
    comments: {
      enabled: c.comments.enabled,
      moderation: c.comments.moderation,
    },
  };
}

// ============================================================
// Media serializer
// ============================================================

export interface MediaAssetJson {
  url: string;
  filename: string;
  size: number;
  alt?: string;
  caption?: string;
}

/**
 * Maps a MediaAsset + its sidecar MediaMeta to the whitelisted JSON shape.
 * Explicit object build (NO spread). Omits alt/caption when undefined.
 */
export function toMediaJson(asset: MediaAsset, meta: MediaMeta): MediaAssetJson {
  const result: MediaAssetJson = {
    url: asset.url,
    filename: asset.filename,
    size: asset.size,
  };
  if (meta.alt !== undefined) result.alt = meta.alt;
  if (meta.caption !== undefined) result.caption = meta.caption;
  return result;
}
