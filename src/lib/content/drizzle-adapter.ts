/**
 * DrizzleContentAdapter — implements ContentRepository using an injected drizzle instance.
 *
 * Schema-agnostic: the caller injects the dialect-appropriate table objects
 * (schema.sqlite or schema.pg) alongside the drizzle instance. Both table sets
 * have identical column names, so all generated SQL is dialect-portable.
 *
 * SiteConfig and TaxonomyRegistry remain YAML-backed (delegated to loadSiteConfig and
 * loadTaxonomyRegistry, exactly as FilesystemContentAdapter does). Pass the path to the
 * config/ directory (the one that contains site.yaml and taxonomies.yaml) as configRoot.
 */

import * as path from "node:path";
import { and, asc, count, desc, eq, gt, inArray, like, lte, ne, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { renderMarkdown } from "./markdown";
import { loadSiteConfig } from "./site-config";
import { slugifyTag, buildTagIndex } from "./tag";
import {
  slugifyCategory,
  joinSlug,
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
import { computeStatusCounts } from "./schedule";
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
import { fromEpoch, fromBool01, toEpoch } from "./db-values";
import type {
  ContentRepository,
  ListPostsOptions,
  ListPostsResult,
  ListPagesOptions,
  ListPagesResult,
  StatusCounts,
} from "./ports";
import type { Category, Page, Post, PostSeo, SiteConfig, Tag } from "./types";

// We use the drizzle instance typed broadly to avoid driver-specific imports,
// mirroring the DrizzleCommentAdapter and factory.ts conventions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDb = any;

/**
 * Loosely-typed schema bundle injected by the caller.
 * Both the sqlite-core (schema.sqlite.ts) and pg-core (schema.pg.ts) variants
 * satisfy this type — they export identically-named table objects whose column
 * names are kept identical by the conformance test in schema-conformance.test.ts.
 * Using `any` here (same as DrizzleDb above) avoids dialect-specific imports at
 * the adapter boundary; the concrete table objects come from the call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleContentSchema = Record<string, any>;

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
  /**
   * Dialect-appropriate schema tables (schema.sqlite or schema.pg).
   * Injected at construction so the adapter is not coupled to any one dialect.
   */
  private readonly schema: DrizzleContentSchema;

  constructor(db: DrizzleDb, configRoot: string, schema: DrizzleContentSchema) {
    this.db = db;
    this.configRoot = configRoot;
    this.schema = schema;
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
    const { content } = this.schema;
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
    const { terms, term_relationships } = this.schema;
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
   * Fetch SEO metadata for a set of content IDs from the content_meta table.
   *
   * Mirrors fetchTermsForIds: SELECT content_id, meta_key, meta_value WHERE
   * content_id IN ids AND meta_key LIKE 'seo.%'. Reassembles per content_id
   * into a PostSeo object by stripping the "seo." prefix. Boolean fields
   * (noindex, cornerstone) are parsed from "true"/"false" text into real JS
   * booleans. Returns only content_ids that have ≥1 seo field set.
   */
  private async fetchSeoForIds(ids: string[]): Promise<Map<string, PostSeo>> {
    const { content_meta } = this.schema;
    if (ids.length === 0) return new Map();

    const rows: Array<{
      content_id: string;
      meta_key: string;
      meta_value: string | null;
    }> = await this.db
      .select({
        content_id: content_meta.content_id,
        meta_key: content_meta.meta_key,
        meta_value: content_meta.meta_value,
      })
      .from(content_meta)
      .where(
        and(
          inArray(content_meta.content_id, ids),
          like(content_meta.meta_key, "seo.%")
        )
      );

    const seoMap = new Map<string, PostSeo>();
    const BOOLEAN_SEO_FIELDS = new Set(["noindex", "cornerstone"]);

    for (const row of rows) {
      if (row.meta_value === null) continue;
      const field = row.meta_key.slice(4); // strip "seo." prefix

      if (!seoMap.has(row.content_id)) {
        seoMap.set(row.content_id, {});
      }
      const seo = seoMap.get(row.content_id)!;

      if (BOOLEAN_SEO_FIELDS.has(field)) {
        (seo as Record<string, unknown>)[field] = row.meta_value === "true";
      } else {
        (seo as Record<string, unknown>)[field] = row.meta_value;
      }
    }

    return seoMap;
  }

  /**
   * Partition term rows into per-content-id tag (label) arrays and category
   * (slug) arrays.
   *
   * Tags: stored as terms.label so the original raw string is returned in
   *       Post.tags (matching FilesystemContentAdapter's frontmatter.tags).
   * Categories: stored as terms.label so the original human-readable label is
   *       returned in Post.categories (matching FilesystemContentAdapter's
   *       frontmatter.categories). buildCategoryIndex derives the slug by
   *       applying slugifyCategory → joinSlug to the label, matching the FS path.
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
        // Push the original label (not slug) so Post.categories matches the
        // FS adapter's frontmatter.categories array (e.g. "Tech", not "tech").
        catsByContentId.get(row.content_id)?.push(row.label);
      }
    }

    return { tagsByContentId, catsByContentId };
  }

  /**
   * Resolve a set of content UUIDs to their page slugs.
   *
   * Used to convert parent_id UUID values in page rows into the slug string
   * that FilesystemContentAdapter exposes as Page.parent (the slug is the
   * stable user-facing identifier; the UUID is an internal DB detail).
   *
   * @param ids — Set of content UUIDs to look up (may be empty).
   * @returns Map from UUID to slug for each matching content row.
   */
  private async resolveIdsToSlugs(ids: Set<string>): Promise<Map<string, string>> {
    if (ids.size === 0) return new Map();
    const { content } = this.schema;
    const rows: Array<{ id: string; slug: string }> = await this.db
      .select({ id: content.id, slug: content.slug })
      .from(content)
      .where(inArray(content.id, [...ids]));
    return new Map(rows.map((r) => [r.id, r.slug]));
  }

  /**
   * Scan all content rows (posts + pages) into GraphInputNode[] for the
   * link graph and unlinked-mentions methods.
   * ALL content is included (no draft/visibility filtering) — callers apply
   * publicOnly filtering themselves (mirrors FilesystemContentAdapter).
   */
  private async scanGraphInputs(): Promise<GraphInputNode[]> {
    const { content } = this.schema;
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
    const { content } = this.schema;
    const includeDrafts = shouldIncludeDrafts(options);
    const pageSize = options?.pageSize ?? PAGE_SIZE;
    const page = options?.page ?? 1;
    const offset = (page - 1) * pageSize;

    // -----------------------------------------------------------------------
    // Build SQL WHERE conditions (structural filters pushed into the DB)
    // -----------------------------------------------------------------------
    const conditions: SQL[] = [eq(content.type, "post")];

    // includeDrafts gate: when false, exclude drafts and private posts in SQL.
    // This mirrors the two TS guards in the old code:
    //   if (row.status === "draft" && !includeDrafts) continue;
    //   if (row.visibility === "private" && !includeDrafts) continue;
    if (!includeDrafts) {
      conditions.push(eq(content.status, "published"));
      conditions.push(ne(content.visibility, "private"));
    }

    // Tag filter: SQL EXISTS correlated subquery through term_relationships.
    // Produces the same match as: slugifyTag(tag) in post.tags (after slugify).
    if (options?.tag) {
      const tagSlug = slugifyTag(options.tag);
      conditions.push(sql`EXISTS (
        SELECT 1 FROM term_relationships tr
        INNER JOIN terms t ON tr.term_id = t.id
        WHERE tr.content_id = ${content.id}
          AND t.taxonomy = 'tag'
          AND t.slug = ${tagSlug}
      )`);
    }

    // Category filter: prefix match (slug = filterSlug OR slug LIKE filterSlug/%)
    // Reproduces matchesCategory(postPath, filterSlug) exactly:
    //   postPath === filterSlug  → exact match (slug = ?)
    //   postPath.startsWith(filterSlug + "/")  → LIKE ?/%
    // Works on both SQLite and PG (LIKE is standard SQL).
    if (options?.category) {
      const filterSlug = joinSlug(slugifyCategory(options.category));
      const prefixPattern = filterSlug + "/%";
      conditions.push(sql`EXISTS (
        SELECT 1 FROM term_relationships tr
        INNER JOIN terms t ON tr.term_id = t.id
        WHERE tr.content_id = ${content.id}
          AND t.taxonomy = 'category'
          AND (t.slug = ${filterSlug} OR t.slug LIKE ${prefixPattern})
      )`);
    }

    // Author filter intentionally NOT pushed into SQL.
    //
    // The FS oracle uses: slugifyAuthor(post.author) === slugifyAuthor(options.author)
    // where post.author is the PROJECTED value (author_label?.trim() || siteAuthorName).
    // SQL cannot replicate this safely because:
    //   (a) slugifyAuthor collapses spaces/hyphens/accents to "-", so "Alice Smith" stored
    //       in author_label must match filter "alice-smith" — but LOWER(TRIM()) returns
    //       "alice smith" ≠ "alice-smith" (false negative).
    //   (b) NULL author_label rows are excluded by SQL comparisons (NULL ≠ anything),
    //       but the FS adapter projects them under the site author name and INCLUDES
    //       them when filtering by site author (false negative).
    //
    // When options.author is set we fall through to the TS-filter path below (same as
    // options.query). A future optimisation can add a precomputed author_slug column and
    // push that into SQL, but correctness requires TS projection here.

    // adminStatus filter: translate the TS schedule.ts semantics into SQL.
    // Runs after the includeDrafts gate (combined in SQL via AND).
    // now="" semantics: ISO string comparison "" < any YYYY-MM-DD → all dates
    // are future → all published posts are "Scheduled", none are "Published".
    if (options?.adminStatus !== undefined) {
      const adminStatus = options.adminStatus;
      const now = options.now ?? "";

      if (adminStatus === "draft") {
        // Draft posts only (regardless of date).
        conditions.push(eq(content.status, "draft"));
      } else if (adminStatus === "published") {
        // Published posts with published_at ≤ epoch(now) (date <= now → "Published").
        conditions.push(eq(content.status, "published"));
        if (now === "") {
          // now="" → all dates are future → no post qualifies as "Published".
          // Use 'false' (not integer 0) — PostgreSQL requires a boolean literal
          // in a boolean context; SQLite 3.23+ accepts both. 'false' is portable.
          conditions.push(sql`false`);
        } else {
          conditions.push(lte(content.published_at, toEpoch(now)));
        }
      } else if (adminStatus === "scheduled") {
        // Published posts with published_at > epoch(now) (date > now → "Scheduled").
        conditions.push(eq(content.status, "published"));
        if (now !== "") {
          // now="" → all published are "Scheduled" → no additional date constraint.
          conditions.push(gt(content.published_at, toEpoch(now)));
        }
      }
    }

    const whereClause = and(...conditions);

    // -----------------------------------------------------------------------
    // TS-filter path — used when options.query or options.author is set
    // -----------------------------------------------------------------------
    // Both author and full-text search are kept in TypeScript to match the FS
    // oracle exactly:
    //
    // - query: TS full-text search via applySearch (deferred ContentSearch slice)
    // - author: TS slugify comparison using the projected author value
    //   (author_label?.trim() || siteAuthorName). SQL cannot replicate this
    //   because (a) slugifyAuthor collapses spaces/hyphens and (b) NULL
    //   author_label must fall back to the site author — both invisible to SQL.
    //
    // The structural SQL filters (type, status, tag, category, adminStatus) still
    // narrow the candidate set before the TS pass.
    if (options?.query !== undefined || options?.author !== undefined) {
      const allRows = await this.db
        .select({
          id: content.id,
          slug: content.slug,
          title: content.title,
          status: content.status,
          visibility: content.visibility,
          password: content.password,
          body_markdown: content.body_markdown,
          excerpt: content.excerpt,
          cover_image: content.cover_image,
          author_label: content.author_label,
          sticky: content.sticky,
          comments_enabled: content.comments_enabled,
          published_at: content.published_at,
        })
        .from(content)
        .where(whereClause)
        .orderBy(desc(content.published_at), asc(content.id));

      const ids = allRows.map((r: { id: string }) => r.id);
      const termRows = await this.fetchTermsForIds(ids);
      const { tagsByContentId, catsByContentId } = this.buildTermMaps(
        termRows,
        ids
      );
      const seoMap = await this.fetchSeoForIds(ids);
      const wikiResolver = await this.getWikiResolver();
      const siteConfig = await this.getSiteConfig();
      const siteAuthorName = siteConfig.author.name?.trim() || "Unknown";
      const bodyBySlug = new Map<string, string>();
      let posts: Post[] = [];

      for (const row of allRows) {
        const body = row.body_markdown;
        const { teaser, hasMore } = splitMore(body);
        const rawExcerpt =
          row.excerpt ?? (hasMore ? autoExcerpt(teaser) : autoExcerpt(body));
        const passwordGated =
          row.visibility === "password" && options?.includeDrafts !== true;
        const excerpt = passwordGated
          ? "This post is password protected."
          : rawExcerpt;
        const { html: rawHtml } = await renderMarkdown(body, { wikiResolver });
        const html = passwordGated ? "" : rawHtml;
        const tagLabels = tagsByContentId.get(row.id) ?? [];
        const catSlugs = catsByContentId.get(row.id) ?? [];
        const seo = seoMap.get(row.id);

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
          ...(row.cover_image ? { coverImage: row.cover_image } : {}),
          ...(seo ? { seo } : {}),
          visibility: (row.visibility ?? "public") as
            | "public"
            | "private"
            | "password",
          ...(row.visibility === "password" && row.password && !passwordGated
            ? { password: row.password }
            : {}),
        };

        posts.push(post);
        bodyBySlug.set(row.slug, passwordGated ? "" : body);
      }

      // TS author filter: compare slugified projected author names exactly as FS
      // oracle does — handles NULL fallback and multi-word/slugified names.
      if (options.author !== undefined) {
        const filterSlug = slugifyAuthor(options.author);
        posts = posts.filter(
          (p) => slugifyAuthor(p.author) === filterSlug
        );
      }

      // TS full-text search (two-tier title/body ranking via applySearch)
      if (options.query !== undefined) {
        const entries: SearchableEntry[] = posts.map((post) => ({
          post,
          body: bodyBySlug.get(post.slug) ?? "",
        }));
        posts = applySearch(entries, options.query);
      }

      const total = posts.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize) || 1;
      const start = (page - 1) * pageSize;
      return { posts: posts.slice(start, start + pageSize), total, totalPages };
    }

    // -----------------------------------------------------------------------
    // No query: full SQL pushdown — COUNT + LIMIT/OFFSET
    // -----------------------------------------------------------------------

    // COUNT(*) with the same WHERE — efficient single-pass count in the DB.
    const [countRow] = await this.db
      .select({ total: count() })
      .from(content)
      .where(whereClause);

    const total = Number(countRow?.total ?? 0);
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize) || 1;

    // Page query: only the requested page's rows, ordered by published_at DESC.
    // Secondary sort by id ASC intentionally stabilises pagination where
    // published_at values tie — the FS adapter relied on OS traversal order,
    // which is non-deterministic. This is a deliberate improvement over FS.
    const postRows = await this.db
      .select({
        id: content.id,
        slug: content.slug,
        title: content.title,
        status: content.status,
        visibility: content.visibility,
        password: content.password,
        body_markdown: content.body_markdown,
        excerpt: content.excerpt,
        cover_image: content.cover_image,
        author_label: content.author_label,
        sticky: content.sticky,
        comments_enabled: content.comments_enabled,
        published_at: content.published_at,
      })
      .from(content)
      .where(whereClause)
      .orderBy(desc(content.published_at), asc(content.id))
      .limit(pageSize)
      .offset(offset);

    // Fetch terms only for the page's rows (not the whole corpus).
    const ids = postRows.map((r: { id: string }) => r.id);
    const termRows = await this.fetchTermsForIds(ids);
    const { tagsByContentId, catsByContentId } = this.buildTermMaps(
      termRows,
      ids
    );
    const seoMap = await this.fetchSeoForIds(ids);

    const wikiResolver = await this.getWikiResolver();
    const siteConfig = await this.getSiteConfig();
    const siteAuthorName = siteConfig.author.name?.trim() || "Unknown";

    const posts: Post[] = [];

    for (const row of postRows) {
      const body = row.body_markdown;
      const { teaser, hasMore } = splitMore(body);
      const rawExcerpt =
        row.excerpt ?? (hasMore ? autoExcerpt(teaser) : autoExcerpt(body));
      const passwordGated =
        row.visibility === "password" && options?.includeDrafts !== true;
      const excerpt = passwordGated
        ? "This post is password protected."
        : rawExcerpt;
      const { html: rawHtml } = await renderMarkdown(body, { wikiResolver });
      const html = passwordGated ? "" : rawHtml;
      const tagLabels = tagsByContentId.get(row.id) ?? [];
      const catSlugs = catsByContentId.get(row.id) ?? [];
      const seo = seoMap.get(row.id);

      posts.push({
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
        ...(row.cover_image ? { coverImage: row.cover_image } : {}),
        ...(seo ? { seo } : {}),
        visibility: (row.visibility ?? "public") as
          | "public"
          | "private"
          | "password",
        ...(row.visibility === "password" && row.password && !passwordGated
          ? { password: row.password }
          : {}),
      });
    }

    return { posts, total, totalPages };
  }

  async getPost(
    slug: string,
    options?: ListPostsOptions
  ): Promise<Post | null> {
    const { content } = this.schema;
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
      cover_image: string | null;
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
    const seoMap = await this.fetchSeoForIds([row.id]);

    const wikiResolver = await this.getWikiResolver();
    const body = row.body_markdown;
    const { teaser, hasMore } = splitMore(body);
    const excerpt =
      row.excerpt ??
      (hasMore ? autoExcerpt(teaser) : autoExcerpt(body));
    const { html } = await renderMarkdown(body, { wikiResolver });

    const siteConfig = await this.getSiteConfig();
    const siteAuthorName = siteConfig.author.name?.trim() || "Unknown";
    const seo = seoMap.get(row.id);

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
      ...(row.cover_image ? { coverImage: row.cover_image } : {}),
      ...(seo ? { seo } : {}),
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
    const { content } = this.schema;
    const includeDrafts = shouldIncludeDrafts(options);
    const pageSize = options?.pageSize ?? PAGE_SIZE;
    const page = options?.page ?? 1;
    const offset = (page - 1) * pageSize;

    // Build SQL WHERE conditions
    const conditions: SQL[] = [eq(content.type, "page")];
    if (!includeDrafts) {
      conditions.push(eq(content.status, "published"));
    }
    const whereClause = and(...conditions);

    // Pages are sorted by menuOrder ASC, then title ASC (mirrors FS adapter).
    // SQL ORDER BY menu_order ASC, title ASC is equivalent for ASCII titles.
    const orderBy = [asc(content.menu_order), asc(content.title)] as const;

    // -----------------------------------------------------------------------
    // Query / full-text case — structural SQL filter applied, TS search kept
    // -----------------------------------------------------------------------
    if (options?.query !== undefined) {
      const allRows = await this.db
        .select({
          id: content.id,
          slug: content.slug,
          title: content.title,
          status: content.status,
          body_markdown: content.body_markdown,
          excerpt: content.excerpt,
          parent_id: content.parent_id,
          menu_order: content.menu_order,
          published_at: content.published_at,
        })
        .from(content)
        .where(whereClause)
        .orderBy(...orderBy);

      const pageIds = allRows.map((r: { id: string }) => r.id);
      const querySeoMap = await this.fetchSeoForIds(pageIds);
      // Build a slug → seo map for use in the ranked-pages mapping step.
      const slugToSeo = new Map<string, PostSeo>();
      for (const r of allRows) {
        const seo = querySeoMap.get(r.id);
        if (seo) slugToSeo.set(r.slug, seo);
      }

      // Resolve parent_id UUIDs to page slugs so Page.parent matches the
      // FS adapter (which stores the parent slug, not the DB row UUID).
      const queryParentIds = new Set<string>();
      for (const r of allRows) {
        if (r.parent_id) queryParentIds.add(String(r.parent_id));
      }
      const queryParentSlugMap = await this.resolveIdsToSlugs(queryParentIds);

      const wikiResolver = await this.getWikiResolver();
      const bodyBySlug = new Map<string, string>();
      const allPages: Page[] = [];

      for (const row of allRows) {
        const body = row.body_markdown;
        const excerpt = row.excerpt ?? autoExcerpt(body);
        const { html } = await renderMarkdown(body, { wikiResolver });
        const parentSlug = row.parent_id ? queryParentSlugMap.get(row.parent_id) : undefined;
        allPages.push({
          slug: row.slug,
          title: row.title,
          date: epochToDateStr(row.published_at),
          status: row.status as "published" | "draft",
          excerpt,
          html,
          menuOrder: row.menu_order ?? 0,
          ...(parentSlug ? { parent: parentSlug } : {}),
        });
        bodyBySlug.set(row.slug, body);
      }

      // TS full-text search (same applySearch path as FilesystemContentAdapter)
      const entries: SearchableEntry[] = allPages.map((p) => ({
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
      const rankedPages = ranked.map((post) => {
        const original = allPages.find((p) => p.slug === post.slug);
        const seo = slugToSeo.get(post.slug);
        return {
          slug: post.slug,
          title: post.title,
          date: post.date,
          status: post.status,
          excerpt: post.excerpt,
          html: post.html,
          menuOrder: original?.menuOrder ?? 0,
          ...(original?.parent ? { parent: original.parent } : {}),
          ...(seo ? { seo } : {}),
        };
      });

      const total = rankedPages.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize) || 1;
      const start = (page - 1) * pageSize;
      return { pages: rankedPages.slice(start, start + pageSize), total, totalPages };
    }

    // -----------------------------------------------------------------------
    // No query: full SQL pushdown — COUNT + LIMIT/OFFSET
    // -----------------------------------------------------------------------

    const [countRow] = await this.db
      .select({ total: count() })
      .from(content)
      .where(whereClause);

    const total = Number(countRow?.total ?? 0);
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize) || 1;

    const pageRows = await this.db
      .select({
        id: content.id,
        slug: content.slug,
        title: content.title,
        status: content.status,
        body_markdown: content.body_markdown,
        excerpt: content.excerpt,
        parent_id: content.parent_id,
        menu_order: content.menu_order,
        published_at: content.published_at,
      })
      .from(content)
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset(offset);

    const pageRowIds = pageRows.map((r: { id: string }) => r.id);
    const pushdownSeoMap = await this.fetchSeoForIds(pageRowIds);

    // Resolve parent_id UUIDs to page slugs.
    const parentIds = new Set<string>();
    for (const r of pageRows) {
      if (r.parent_id) parentIds.add(String(r.parent_id));
    }
    const parentSlugMap = await this.resolveIdsToSlugs(parentIds);

    const wikiResolver = await this.getWikiResolver();
    const pages: Page[] = [];

    for (const row of pageRows) {
      const body = row.body_markdown;
      const excerpt = row.excerpt ?? autoExcerpt(body);
      const { html } = await renderMarkdown(body, { wikiResolver });
      const seo = pushdownSeoMap.get(row.id);
      const parentSlug = row.parent_id ? parentSlugMap.get(row.parent_id) : undefined;
      pages.push({
        slug: row.slug,
        title: row.title,
        date: epochToDateStr(row.published_at),
        status: row.status as "published" | "draft",
        excerpt,
        html,
        menuOrder: row.menu_order ?? 0,
        ...(parentSlug ? { parent: parentSlug } : {}),
        ...(seo ? { seo } : {}),
      });
    }

    return { pages, total, totalPages };
  }

  async getPage(
    slug: string,
    options?: { includeDrafts?: boolean }
  ): Promise<Page | null> {
    const { content } = this.schema;
    const includeDrafts = shouldIncludeDrafts(options);

    const rows: Array<{
      id: string;
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

    const getPageSeoMap = await this.fetchSeoForIds([row.id]);
    const seo = getPageSeoMap.get(row.id);

    // Resolve parent_id UUID → parent page slug.
    const getPageParentSlugMap = await this.resolveIdsToSlugs(
      row.parent_id ? new Set([row.parent_id]) : new Set()
    );
    const parentSlug = row.parent_id ? getPageParentSlugMap.get(row.parent_id) : undefined;

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
      ...(parentSlug ? { parent: parentSlug } : {}),
      ...(seo ? { seo } : {}),
    };
  }

  async listPostStatusCounts(now: string): Promise<StatusCounts> {
    const { content } = this.schema;
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
    const { content, terms, term_relationships } = this.schema;
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
    const { content, terms, term_relationships } = this.schema;
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
                eq(terms.taxonomy, "category")
              )
            )
        : [];

    const catsByContentId = new Map<string, string[]>(
      ids.map((id) => [id, []])
    );
    for (const rel of catTerms) {
      // Push the original label (e.g. "Tech", not "tech") so buildCategoryIndex
      // derives the human-readable Category.label, matching the FS adapter path.
      catsByContentId.get(rel.content_id)?.push(rel.label);
    }

    // Pass original category labels as "raw" category strings.
    // slugifyCategory("Tech/JavaScript") correctly derives segments
    // ["tech","javascript"], making buildCategoryIndex produce the same
    // prefix expansion as the FS adapter.
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
