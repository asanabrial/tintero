/**
 * DrizzleContentAdapter — implements ContentRepository using an injected drizzle instance.
 *
 * Uses SQLite schema objects for query building (Slice 1D targets bun:sqlite for tests;
 * the DrizzleDb = any convention keeps this driver-agnostic at the type boundary).
 *
 * SiteConfig and TaxonomyRegistry remain YAML-backed (delegated to loadSiteConfig and
 * loadTaxonomyRegistry, exactly as FilesystemContentAdapter does). Pass the path to the
 * config/ directory (the one that contains site.yaml and taxonomies.yaml) as configRoot.
 */

import * as path from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { content, terms, term_relationships } from "./schema.sqlite";
import { renderMarkdown } from "./markdown";
import { loadSiteConfig } from "./site-config";
import { slugifyTag, buildTagIndex } from "./tag";
import {
  slugifyCategory,
  joinSlug,
  matchesCategory,
  buildCategoryIndex,
} from "./category";
import {
  loadTaxonomyRegistry,
  mergeCategoryIndex,
  mergeTagIndex,
} from "./taxonomy-registry";
import { slugifyAuthor } from "./author";
import { splitMore } from "./more-tag";
import { applySearch } from "./search";
import type { SearchableEntry } from "./search";
import { matchesAdminStatus, computeStatusCounts } from "./schedule";
import {
  buildLinkGraph,
  buildWikiResolver,
  unlinkedMentions,
} from "./links";
import type {
  GraphInputNode,
  LinkGraph,
  UnlinkedMention,
  WikiResolver,
} from "./links";
import { fromEpoch, fromBool01 } from "./db-values";
import type {
  ContentRepository,
  ListPostsOptions,
  ListPostsResult,
  ListPagesOptions,
  ListPagesResult,
  StatusCounts,
} from "./ports";
import type { Category, Page, Post, SiteConfig, Tag } from "./types";

// We use the drizzle instance typed broadly to avoid driver-specific imports,
// mirroring the DrizzleCommentAdapter and factory.ts conventions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDb = any;

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Local utilities (mirrors helpers in FilesystemContentAdapter)
// ---------------------------------------------------------------------------

function epochToDateStr(ms: number): string {
  return fromEpoch(ms).toISOString().slice(0, 10);
}

/**
 * Generate a plain-text excerpt from raw markdown body (strip markdown,
 * take first 160 chars). Mirrors the same function in FilesystemContentAdapter.
 */
function autoExcerpt(body: string): string {
  const stripped = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 160);
}

/**
 * Determine whether drafts should be included.
 * When includeDrafts is explicitly set, honor it.
 * Otherwise fall back to environment-based logic (dev/test include drafts).
 * Mirrors FilesystemContentAdapter's shouldIncludeDrafts / shouldIncludePageDrafts.
 */
function shouldIncludeDrafts(options?: { includeDrafts?: boolean }): boolean {
  if (options?.includeDrafts !== undefined) return options.includeDrafts;
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}

// ---------------------------------------------------------------------------
// DrizzleContentAdapter
// ---------------------------------------------------------------------------

export class DrizzleContentAdapter implements ContentRepository {
  private readonly db: DrizzleDb;
  /** Path to the config/ directory (contains site.yaml + taxonomies.yaml). */
  private readonly configRoot: string;

  constructor(db: DrizzleDb, configRoot: string) {
    this.db = db;
    this.configRoot = configRoot;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Build a wikilink resolver from the full corpus (all posts + pages).
   * Passed into renderMarkdown so [[wikilinks]] produce real <a> links.
   * Mirrors FilesystemContentAdapter.getWikiResolver.
   */
  private async getWikiResolver(): Promise<WikiResolver> {
    const rows: Array<{ type: string; slug: string; title: string }> =
      await this.db
        .select({
          type: content.type,
          slug: content.slug,
          title: content.title,
        })
        .from(content);

    return buildWikiResolver(
      rows.map((r) => ({
        type: r.type as "post" | "page",
        slug: r.slug,
        title: r.title,
      }))
    );
  }

  /**
   * Fetch all term relationships for a set of content IDs, joined with the
   * terms table to get taxonomy, slug, and label.
   */
  private async fetchTermsForIds(
    ids: string[]
  ): Promise<
    Array<{ content_id: string; taxonomy: string; slug: string; label: string }>
  > {
    if (ids.length === 0) return [];
    return this.db
      .select({
        content_id: term_relationships.content_id,
        taxonomy: terms.taxonomy,
        slug: terms.slug,
        label: terms.label,
      })
      .from(term_relationships)
      .innerJoin(terms, eq(term_relationships.term_id, terms.id))
      .where(inArray(term_relationships.content_id, ids));
  }

  /**
   * Partition term rows into per-content-id tag (label) arrays and category
   * (slug) arrays.
   *
   * Tags: stored as terms.label so the original raw string is returned in
   *       Post.tags (matching FilesystemContentAdapter's frontmatter.tags).
   * Categories: stored as terms.slug (the slugified path), which is the same
   *       shape slugifyCategory → joinSlug produces from raw frontmatter values.
   */
  private buildTermMaps(
    termRows: Array<{
      content_id: string;
      taxonomy: string;
      slug: string;
      label: string;
    }>,
    ids: string[]
  ): {
    tagsByContentId: Map<string, string[]>;
    catsByContentId: Map<string, string[]>;
  } {
    const tagsByContentId = new Map<string, string[]>(ids.map((id) => [id, []]));
    const catsByContentId = new Map<string, string[]>(
      ids.map((id) => [id, []])
    );

    for (const row of termRows) {
      if (row.taxonomy === "tag") {
        tagsByContentId.get(row.content_id)?.push(row.label);
      } else if (row.taxonomy === "category") {
        catsByContentId.get(row.content_id)?.push(row.slug);
      }
    }

    return { tagsByContentId, catsByContentId };
  }

  /**
   * Scan all content rows (posts + pages) into GraphInputNode[] for the
   * link graph and unlinked-mentions methods.
   * ALL content is included (no draft/visibility filtering) — callers apply
   * publicOnly filtering themselves (mirrors FilesystemContentAdapter).
   */
  private async scanGraphInputs(): Promise<GraphInputNode[]> {
    const rows: Array<{
      type: string;
      slug: string;
      title: string;
      body_markdown: string;
      status: string;
      visibility: string;
    }> = await this.db
      .select({
        type: content.type,
        slug: content.slug,
        title: content.title,
        body_markdown: content.body_markdown,
        status: content.status,
        visibility: content.visibility,
      })
      .from(content);

    return rows.map((row) => ({
      type: row.type as "post" | "page",
      slug: row.slug,
      title: row.title,
      body: row.body_markdown,
      published: row.status === "published",
      public: (row.visibility ?? "public") === "public",
    }));
  }

  // ------------------------------------------------------------------
  // ContentRepository — read methods
  // ------------------------------------------------------------------

  async listPosts(options?: ListPostsOptions): Promise<ListPostsResult> {
    const includeDrafts = shouldIncludeDrafts(options);

    // Fetch all posts ordered by published_at DESC (epoch → date DESC order).
    const postRows: Array<{
      id: string;
      slug: string;
      title: string;
      status: string;
      visibility: string;
      password: string | null;
      body_markdown: string;
      excerpt: string | null;
      author_label: string | null;
      sticky: number;
      comments_enabled: number;
      published_at: number;
    }> = await this.db
      .select()
      .from(content)
      .where(eq(content.type, "post"))
      .orderBy(desc(content.published_at));

    const ids = postRows.map((r) => r.id);
    const termRows = await this.fetchTermsForIds(ids);
    const { tagsByContentId, catsByContentId } = this.buildTermMaps(
      termRows,
      ids
    );

    const wikiResolver = await this.getWikiResolver();
    const siteConfig = await this.getSiteConfig();
    const siteAuthorName = siteConfig.author.name?.trim() || "Unknown";

    const bodyBySlug = new Map<string, string>();
    let posts: Post[] = [];

    for (const row of postRows) {
      // Draft / private filtering (mirrors FilesystemContentAdapter)
      if (row.status === "draft" && !includeDrafts) continue;
      if (row.visibility === "private" && !includeDrafts) continue;

      const body = row.body_markdown;
      const { teaser, hasMore } = splitMore(body);
      const rawExcerpt =
        row.excerpt ??
        (hasMore ? autoExcerpt(teaser) : autoExcerpt(body));

      // Password-gating: public callers never see body/excerpt.
      const passwordGated =
        row.visibility === "password" && options?.includeDrafts !== true;
      const excerpt = passwordGated
        ? "This post is password protected."
        : rawExcerpt;

      const { html: rawHtml } = await renderMarkdown(body, { wikiResolver });
      const html = passwordGated ? "" : rawHtml;

      const tagLabels = tagsByContentId.get(row.id) ?? [];
      const catSlugs = catsByContentId.get(row.id) ?? [];

      const post: Post = {
        slug: row.slug,
        title: row.title,
        date: epochToDateStr(row.published_at),
        status: row.status as "published" | "draft",
        tags: tagLabels,
        categories: catSlugs,
        excerpt,
        html,
        comments: fromBool01(row.comments_enabled),
        sticky: fromBool01(row.sticky),
        author: row.author_label?.trim() || siteAuthorName,
        visibility: (row.visibility ?? "public") as
          | "public"
          | "private"
          | "password",
        ...(row.visibility === "password" &&
        row.password &&
        !passwordGated
          ? { password: row.password }
          : {}),
      };

      posts.push(post);
      bodyBySlug.set(row.slug, passwordGated ? "" : body);
    }

    // Tag filter
    if (options?.tag) {
      const filterSlug = slugifyTag(options.tag);
      posts = posts.filter((p) =>
        p.tags.some((t) => slugifyTag(t) === filterSlug)
      );
    }

    // Category filter (prefix/descendant match via matchesCategory)
    if (options?.category) {
      const filterSlug = joinSlug(slugifyCategory(options.category));
      posts = posts.filter((p) =>
        p.categories.some((c) => {
          const cs = joinSlug(slugifyCategory(c));
          return matchesCategory(cs, filterSlug);
        })
      );
    }

    // Author filter
    if (options?.author) {
      const filterSlug = slugifyAuthor(options.author);
      posts = posts.filter(
        (p) => slugifyAuthor(p.author) === filterSlug
      );
    }

    // adminStatus filter (derived: published/draft/scheduled).
    // Runs AFTER the includeDrafts gate. now defaults to "" exactly as FS does.
    if (options?.adminStatus !== undefined) {
      const adminStatus = options.adminStatus;
      const now = options.now ?? "";
      posts = posts.filter((p) => matchesAdminStatus(p, adminStatus, now));
    }

    // Query filter + two-tier title/body ranking (matches applySearch in search.ts).
    if (options?.query !== undefined) {
      const entries: SearchableEntry[] = posts.map((post) => ({
        post,
        body: bodyBySlug.get(post.slug) ?? "",
      }));
      posts = applySearch(entries, options.query);
    }

    // Pagination
    const pageSize = options?.pageSize ?? PAGE_SIZE;
    const total = posts.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize) || 1;
    const page = options?.page ?? 1;
    const start = (page - 1) * pageSize;
    const paginated = posts.slice(start, start + pageSize);

    return { posts: paginated, total, totalPages };
  }

  async getPost(
    slug: string,
    options?: ListPostsOptions
  ): Promise<Post | null> {
    const includeDrafts = shouldIncludeDrafts(options);

    const rows: Array<{
      id: string;
      slug: string;
      title: string;
      status: string;
      visibility: string;
      password: string | null;
      body_markdown: string;
      excerpt: string | null;
      author_label: string | null;
      sticky: number;
      comments_enabled: number;
      published_at: number;
    }> = await this.db
      .select()
      .from(content)
      .where(and(eq(content.type, "post"), eq(content.slug, slug)));

    if (rows.length === 0) return null;
    const row = rows[0];

    if (row.status === "draft" && !includeDrafts) return null;
    if (row.visibility === "private" && !includeDrafts) return null;

    const termRows = await this.fetchTermsForIds([row.id]);
    const { tagsByContentId, catsByContentId } = this.buildTermMaps(
      termRows,
      [row.id]
    );

    const wikiResolver = await this.getWikiResolver();
    const body = row.body_markdown;
    const { teaser, hasMore } = splitMore(body);
    const excerpt =
      row.excerpt ??
      (hasMore ? autoExcerpt(teaser) : autoExcerpt(body));
    const { html } = await renderMarkdown(body, { wikiResolver });

    const siteConfig = await this.getSiteConfig();
    const siteAuthorName = siteConfig.author.name?.trim() || "Unknown";

    return {
      slug: row.slug,
      title: row.title,
      date: epochToDateStr(row.published_at),
      status: row.status as "published" | "draft",
      tags: tagsByContentId.get(row.id) ?? [],
      categories: catsByContentId.get(row.id) ?? [],
      excerpt,
      html,
      comments: fromBool01(row.comments_enabled),
      sticky: fromBool01(row.sticky),
      author: row.author_label?.trim() || siteAuthorName,
      visibility: (row.visibility ?? "public") as
        | "public"
        | "private"
        | "password",
      ...(row.visibility === "password" && row.password
        ? { password: row.password }
        : {}),
    };
  }

  async listPages(options?: ListPagesOptions): Promise<ListPagesResult> {
    const includeDrafts = shouldIncludeDrafts(options);

    const pageRows: Array<{
      slug: string;
      title: string;
      status: string;
      body_markdown: string;
      excerpt: string | null;
      parent_id: string | null;
      menu_order: number;
      published_at: number;
    }> = await this.db
      .select()
      .from(content)
      .where(eq(content.type, "page"));

    const wikiResolver = await this.getWikiResolver();
    const bodyBySlug = new Map<string, string>();
    let pages: Page[] = [];

    for (const row of pageRows) {
      if (row.status === "draft" && !includeDrafts) continue;

      const body = row.body_markdown;
      const excerpt = row.excerpt ?? autoExcerpt(body);
      const { html } = await renderMarkdown(body, { wikiResolver });

      pages.push({
        slug: row.slug,
        title: row.title,
        date: epochToDateStr(row.published_at),
        status: row.status as "published" | "draft",
        excerpt,
        html,
        menuOrder: row.menu_order ?? 0,
        ...(row.parent_id ? { parent: row.parent_id } : {}),
      });
      bodyBySlug.set(row.slug, body);
    }

    // Sort by menuOrder ascending, then title ascending (mirrors FS adapter)
    pages.sort((a, b) => {
      const orderDiff = (a.menuOrder ?? 0) - (b.menuOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return a.title.localeCompare(b.title);
    });

    // Query filter (mirrors FilesystemContentAdapter.listPages)
    if (options?.query !== undefined) {
      const entries: SearchableEntry[] = pages.map((p) => ({
        post: {
          slug: p.slug,
          title: p.title,
          date: p.date,
          excerpt: p.excerpt,
          html: p.html,
          status: p.status,
          tags: [],
          categories: [],
          comments: false,
          sticky: false,
          author: "",
          visibility: "public" as const,
        },
        body: bodyBySlug.get(p.slug) ?? "",
      }));
      const ranked = applySearch(entries, options.query);
      pages = ranked.map((post) => {
        const original = pages.find((p) => p.slug === post.slug);
        return {
          slug: post.slug,
          title: post.title,
          date: post.date,
          status: post.status,
          excerpt: post.excerpt,
          html: post.html,
          menuOrder: original?.menuOrder ?? 0,
          ...(original?.parent ? { parent: original.parent } : {}),
          ...(original?.seo ? { seo: original.seo } : {}),
        };
      });
    }

    const pageSize = options?.pageSize ?? PAGE_SIZE;
    const total = pages.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize) || 1;
    const page = options?.page ?? 1;
    const start = (page - 1) * pageSize;
    return { pages: pages.slice(start, start + pageSize), total, totalPages };
  }

  async getPage(
    slug: string,
    options?: { includeDrafts?: boolean }
  ): Promise<Page | null> {
    const includeDrafts = shouldIncludeDrafts(options);

    const rows: Array<{
      slug: string;
      title: string;
      status: string;
      body_markdown: string;
      excerpt: string | null;
      parent_id: string | null;
      menu_order: number;
      published_at: number;
    }> = await this.db
      .select()
      .from(content)
      .where(and(eq(content.type, "page"), eq(content.slug, slug)));

    if (rows.length === 0) return null;
    const row = rows[0];

    if (row.status === "draft" && !includeDrafts) return null;

    const wikiResolver = await this.getWikiResolver();
    const body = row.body_markdown;
    const { html } = await renderMarkdown(body, { wikiResolver });
    const excerpt = row.excerpt ?? autoExcerpt(body);

    return {
      slug: row.slug,
      title: row.title,
      date: epochToDateStr(row.published_at),
      status: row.status as "published" | "draft",
      excerpt,
      html,
      menuOrder: row.menu_order ?? 0,
      ...(row.parent_id ? { parent: row.parent_id } : {}),
    };
  }

  async listPostStatusCounts(now: string): Promise<StatusCounts> {
    // Include ALL posts (no draft filter) — admin-facing counts, mirrors FS adapter.
    const rows: Array<{
      slug: string;
      title: string;
      status: string;
      published_at: number;
    }> = await this.db
      .select({
        slug: content.slug,
        title: content.title,
        status: content.status,
        published_at: content.published_at,
      })
      .from(content)
      .where(eq(content.type, "post"));

    // computeStatusCounts only needs status + date; build minimal Post-shaped objects.
    const posts: Post[] = rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      date: epochToDateStr(row.published_at),
      status: row.status as "published" | "draft",
      tags: [],
      categories: [],
      excerpt: "",
      html: "",
      comments: false,
      sticky: false,
      author: "",
      visibility: "public" as const,
    }));

    return computeStatusCounts(posts, now);
  }

  async listTags(): Promise<Tag[]> {
    // NODE_ENV fallback mirrors FilesystemContentAdapter.listTags (no options arg)
    const includeDrafts = shouldIncludeDrafts();

    const postRows: Array<{
      id: string;
      status: string;
      visibility: string;
    }> = await this.db
      .select({
        id: content.id,
        status: content.status,
        visibility: content.visibility,
      })
      .from(content)
      .where(eq(content.type, "post"));

    const filtered = postRows.filter((row) => {
      if (row.status === "draft" && !includeDrafts) return false;
      if (row.visibility === "private" && !includeDrafts) return false;
      return true;
    });

    const ids = filtered.map((r) => r.id);
    const tagTerms: Array<{
      content_id: string;
      label: string;
    }> =
      ids.length > 0
        ? await this.db
            .select({
              content_id: term_relationships.content_id,
              label: terms.label,
            })
            .from(term_relationships)
            .innerJoin(terms, eq(term_relationships.term_id, terms.id))
            .where(
              and(
                inArray(term_relationships.content_id, ids),
                eq(terms.taxonomy, "tag")
              )
            )
        : [];

    const tagsByContentId = new Map<string, string[]>(
      ids.map((id) => [id, []])
    );
    for (const rel of tagTerms) {
      tagsByContentId.get(rel.content_id)?.push(rel.label);
    }

    const rawTagsPerPost = filtered.map((r) => tagsByContentId.get(r.id) ?? []);

    const derived = buildTagIndex(rawTagsPerPost);
    const registry = await loadTaxonomyRegistry(
      path.join(this.configRoot, "taxonomies.yaml")
    );
    return mergeTagIndex(derived, registry.tags);
  }

  async listCategories(): Promise<Category[]> {
    // NODE_ENV fallback mirrors FilesystemContentAdapter.listCategories
    const includeDrafts = shouldIncludeDrafts();

    const postRows: Array<{
      id: string;
      status: string;
      visibility: string;
    }> = await this.db
      .select({
        id: content.id,
        status: content.status,
        visibility: content.visibility,
      })
      .from(content)
      .where(eq(content.type, "post"));

    const filtered = postRows.filter((row) => {
      if (row.status === "draft" && !includeDrafts) return false;
      if (row.visibility === "private" && !includeDrafts) return false;
      return true;
    });

    const ids = filtered.map((r) => r.id);
    const catTerms: Array<{
      content_id: string;
      slug: string;
    }> =
      ids.length > 0
        ? await this.db
            .select({
              content_id: term_relationships.content_id,
              slug: terms.slug,
            })
            .from(term_relationships)
            .innerJoin(terms, eq(term_relationships.term_id, terms.id))
            .where(
              and(
                inArray(term_relationships.content_id, ids),
                eq(terms.taxonomy, "category")
              )
            )
        : [];

    const catsByContentId = new Map<string, string[]>(
      ids.map((id) => [id, []])
    );
    for (const rel of catTerms) {
      catsByContentId.get(rel.content_id)?.push(rel.slug);
    }

    // Pass term slugs as "raw" category strings — slugifyCategory("tech/javascript")
    // correctly derives segments ["tech","javascript"], which makes buildCategoryIndex
    // perform prefix expansion identical to the FS adapter path.
    const rawCategoriesPerPost = filtered.map(
      (r) => catsByContentId.get(r.id) ?? []
    );

    const derived = buildCategoryIndex(rawCategoriesPerPost);
    const registry = await loadTaxonomyRegistry(
      path.join(this.configRoot, "taxonomies.yaml")
    );
    return mergeCategoryIndex(derived, registry.categories);
  }

  async getSiteConfig(): Promise<SiteConfig> {
    return loadSiteConfig(path.join(this.configRoot, "site.yaml"));
  }

  async getLinkGraph(): Promise<LinkGraph> {
    return buildLinkGraph(await this.scanGraphInputs());
  }

  async getUnlinkedMentions(
    id: string,
    options?: { publicOnly?: boolean }
  ): Promise<UnlinkedMention[]> {
    const inputs = await this.scanGraphInputs();
    const scoped = options?.publicOnly
      ? inputs.filter((n) => n.published && n.public)
      : inputs;
    return unlinkedMentions(id, scoped);
  }
}
