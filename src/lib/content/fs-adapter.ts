import * as fs from "fs/promises";
import * as path from "path";
import matter from "gray-matter";
import { renderMarkdown } from "./markdown";
import { parsePostFrontmatter, parsePageFrontmatter } from "./schema";
import { loadSiteConfig } from "./site-config";
import { deriveSlug } from "./slug";
import { buildTagIndex, slugifyTag } from "./tag";
import { buildCategoryIndex, slugifyCategory, joinSlug, matchesCategory } from "./category";
import { loadTaxonomyRegistry, mergeCategoryIndex, mergeTagIndex } from "./taxonomy-registry";
import { slugifyAuthor } from "./author";
import { splitMore } from "./more-tag";
import { applySearch } from "./search";
import type { SearchableEntry } from "./search";
import { matchesAdminStatus, computeStatusCounts } from "./schedule";
import { buildLinkGraph, buildWikiResolver, unlinkedMentions } from "./links";
import type { GraphInputNode, LinkGraph, UnlinkedMention, WikiResolver } from "./links";
import type { ContentRepository, ListPostsOptions, ListPostsResult, ListPagesOptions, ListPagesResult, StatusCounts } from "./ports";
import type { Category, Page, Post, SiteConfig, Tag } from "./types";

const PAGE_SIZE = 10;

/**
 * Recursively collect all .md files under a directory, skipping .obsidian/ and
 * non-markdown files. Returns paths relative to the root dir.
 */
async function collectMarkdownFiles(
  dir: string,
  rootDir: string
): Promise<string[]> {
  let entries: import("fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];

  for (const entry of entries) {
    // Skip .obsidian and other hidden dot-directories
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      const children = await collectMarkdownFiles(fullPath, rootDir);
      results.push(...children);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(relPath);
    }
    // Non-markdown files are silently skipped
  }

  return results;
}

/**
 * Generate an excerpt from body text (strip markdown, take first 160 chars).
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
 * Parse a single markdown file relative to postsDir.
 * Returns null if frontmatter is invalid.
 */
async function parseMarkdownFile(
  relPath: string,
  baseDir: string
): Promise<{ slug: string; frontmatter: NonNullable<ReturnType<typeof parsePostFrontmatter>>; body: string } | null> {
  const fullPath = path.join(baseDir, relPath);
  let raw: string;
  try {
    raw = await fs.readFile(fullPath, "utf-8");
  } catch {
    return null;
  }

  const { data, content: body } = matter(raw);
  const frontmatter = parsePostFrontmatter(data, relPath);
  if (!frontmatter) return null;

  const slug = deriveSlug(relPath, frontmatter.slug);
  return { slug, frontmatter, body };
}

/**
 * Parse a single markdown file relative to pagesDir using the page schema.
 * Returns null if frontmatter is invalid.
 */
async function parseMarkdownPageFile(
  relPath: string,
  baseDir: string
): Promise<{ slug: string; frontmatter: NonNullable<ReturnType<typeof parsePageFrontmatter>>; body: string } | null> {
  const fullPath = path.join(baseDir, relPath);
  let raw: string;
  try {
    raw = await fs.readFile(fullPath, "utf-8");
  } catch {
    return null;
  }

  const { data, content: body } = matter(raw);
  const frontmatter = parsePageFrontmatter(data, relPath);
  if (!frontmatter) return null;

  const slug = deriveSlug(relPath, frontmatter.slug);
  return { slug, frontmatter, body };
}

/**
 * Determine whether drafts should be included based on environment and options.
 * When includeDrafts is explicitly set, honor it.
 * Otherwise fall back to environment-based logic (dev/test include drafts).
 */
function shouldIncludeDrafts(options?: ListPostsOptions): boolean {
  if (options?.includeDrafts !== undefined) return options.includeDrafts;
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}

/**
 * Determine whether draft pages should be included.
 * When includeDrafts is explicitly set, honor it.
 * Otherwise fall back to environment-based logic (dev/test include drafts).
 */
function shouldIncludePageDrafts(options?: { includeDrafts?: boolean }): boolean {
  if (options?.includeDrafts !== undefined) return options.includeDrafts;
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}

export class FilesystemContentAdapter implements ContentRepository {
  private readonly rootDir: string;
  private readonly postsDir: string;
  private readonly pagesDir: string;
  private _siteAuthorName: string | null = null;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.postsDir = path.join(rootDir, "posts");
    this.pagesDir = path.join(rootDir, "pages");
  }

  private async getSiteAuthorName(): Promise<string> {
    if (this._siteAuthorName === null) {
      const cfg = await this.getSiteConfig();
      this._siteAuthorName = cfg.author.name?.trim() || "Unknown";
    }
    return this._siteAuthorName;
  }

  async listPosts(options?: ListPostsOptions): Promise<ListPostsResult> {
    const includeDrafts = shouldIncludeDrafts(options);
    const relPaths = await collectMarkdownFiles(this.postsDir, this.postsDir);

    const parsed = await Promise.all(
      relPaths.map((rel) => parseMarkdownFile(rel, this.postsDir))
    );

    let posts: Post[] = [];
    // ADR-5: keep a sibling Map<slug, body> populated in the parse loop so the
    // non-search path stays byte-identical. The Map is only consulted when
    // options.query is set.
    const bodyBySlug = new Map<string, string>();

    const siteAuthorName = await this.getSiteAuthorName();
    const wikiResolver = await this.getWikiResolver();

    for (const item of parsed) {
      if (!item) continue;
      const { slug, frontmatter, body } = item;

      // Draft filtering
      if (frontmatter.status === "draft" && !includeDrafts) continue;
      // Private posts excluded from public listings
      if (frontmatter.visibility === "private" && !includeDrafts) continue;

      const { teaser, hasMore } = splitMore(body);
      const rawExcerpt =
        frontmatter.excerpt ?? (hasMore ? autoExcerpt(teaser) : autoExcerpt(body));

      const { html: rawHtml } = await renderMarkdown(body, { wikiResolver });

      // Password posts stay in listings (title visible) but their content is
      // gated: in any PUBLIC listing path the body HTML is withheld and the
      // excerpt is replaced, so the list/search APIs and the Atom feed (which
      // serialize post.html) never disclose protected content. The single-post
      // page/API supply the body through getPost, gated at the consumer.
      // Keyed on the EXPLICIT admin option (includeDrafts === true), NOT the
      // env-driven draft flag — dev convenience must never disable this security
      // boundary, so password bodies are gated in every environment for public callers.
      const passwordGated =
        frontmatter.visibility === "password" && options?.includeDrafts !== true;
      const excerpt = passwordGated ? "This post is password protected." : rawExcerpt;
      const html = passwordGated ? "" : rawHtml;

      const post: Post = {
        slug,
        title: frontmatter.title,
        date: frontmatter.date,
        status: frontmatter.status,
        tags: frontmatter.tags,
        categories: frontmatter.categories,
        excerpt,
        html,
        comments: frontmatter.comments,
        sticky: frontmatter.sticky ?? false,
        author: frontmatter.author?.trim() || siteAuthorName,
        ...(frontmatter.coverImage ? { coverImage: frontmatter.coverImage } : {}),
        ...(frontmatter.seo ? { seo: frontmatter.seo } : {}),
        visibility: frontmatter.visibility ?? "public",
        // password is projected ONLY in the explicit admin path (never gated);
        // public callers never receive it.
        ...(frontmatter.visibility === "password" && frontmatter.password && !passwordGated
          ? { password: frontmatter.password }
          : {}),
      };
      posts.push(post);
      // Populate body map for search. For password-gated posts in public paths,
      // index an empty body so protected content cannot be matched by a public
      // body search (the public title still matches).
      bodyBySlug.set(slug, passwordGated ? "" : body);
    }

    // Sort descending by date
    posts.sort((a, b) => b.date.localeCompare(a.date));

    // Tag filter
    if (options?.tag) {
      const filterSlug = slugifyTag(options.tag);
      posts = posts.filter((p) =>
        p.tags.some((t) => slugifyTag(t) === filterSlug)
      );
    }

    // Category filter
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
      posts = posts.filter((p) => slugifyAuthor(p.author) === filterSlug);
    }

    // Admin status filter (derived: published/draft/scheduled). Pre-pagination so
    // total/totalPages reflect the filtered set. now defaults to "" (=> nothing
    // is "scheduled", everything published) only as a guard; admin always passes now.
    if (options?.adminStatus) {
      const now = options.now ?? "";
      posts = posts.filter((p) => matchesAdminStatus(p, options.adminStatus, now));
    }

    // Query filter + two-tier ranking (runs after date sort + tag/category filters,
    // before pagination — REQ-PL-01). When query is absent, this block is skipped
    // entirely and the pipeline is unchanged (REQ-PL-03).
    if (options?.query !== undefined) {
      const entries: SearchableEntry[] = posts.map((post) => ({
        post,
        body: bodyBySlug.get(post.slug) ?? "",
      }));
      posts = applySearch(entries, options.query);
    }

    // Pagination slice operates on the post-search result set.
    // When query is set, the route passes pageSize: 9999 so all matches are
    // returned in v1 (pagination of search results is deferred to v2).
    // This comment documents the v1 contract: callers are responsible for passing
    // a large pageSize when they do not want results truncated.
    const pageSize = options?.pageSize ?? PAGE_SIZE;
    const total = posts.length;
    // Return 0 totalPages when there are no posts (empty search result)
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize) || 1;
    const page = options?.page ?? 1;
    const start = (page - 1) * pageSize;
    const paginated = posts.slice(start, start + pageSize);

    return { posts: paginated, total, totalPages };
  }

  async getPost(slug: string, options?: ListPostsOptions): Promise<Post | null> {
    const includeDrafts = shouldIncludeDrafts(options);
    // Search all .md files for one matching the slug
    const relPaths = await collectMarkdownFiles(this.postsDir, this.postsDir);

    for (const rel of relPaths) {
      const item = await parseMarkdownFile(rel, this.postsDir);
      if (!item) continue;
      const derivedSlug = item.slug;
      if (derivedSlug !== slug) continue;

      const { frontmatter, body } = item;

      // Mirror listPosts draft filtering semantics
      if (frontmatter.status === "draft" && !includeDrafts) return null;
      // Private posts excluded from public single-post fetch
      if (frontmatter.visibility === "private" && !includeDrafts) return null;

      const { teaser: postTeaser, hasMore: postHasMore } = splitMore(body);
      const excerpt = frontmatter.excerpt ?? (postHasMore ? autoExcerpt(postTeaser) : autoExcerpt(body));
      const wikiResolver = await this.getWikiResolver();
      const { html } = await renderMarkdown(body, { wikiResolver });
      const siteAuthorName = await this.getSiteAuthorName();

      return {
        slug,
        title: frontmatter.title,
        date: frontmatter.date,
        status: frontmatter.status,
        tags: frontmatter.tags,
        categories: frontmatter.categories,
        excerpt,
        html,
        comments: frontmatter.comments,
        sticky: frontmatter.sticky ?? false,
        author: frontmatter.author?.trim() || siteAuthorName,
        ...(frontmatter.coverImage ? { coverImage: frontmatter.coverImage } : {}),
        ...(frontmatter.seo ? { seo: frontmatter.seo } : {}),
        visibility: frontmatter.visibility ?? "public",
        ...(frontmatter.visibility === "password" && frontmatter.password ? { password: frontmatter.password } : {}),
      };
    }

    return null;
  }

  async listPages(options?: ListPagesOptions): Promise<ListPagesResult> {
    const includeDrafts = shouldIncludePageDrafts(options);
    const relPaths = await collectMarkdownFiles(this.pagesDir, this.pagesDir);
    let all: Page[] = [];
    // Populated in the parse loop; consulted only when options.query is set.
    const bodyBySlug = new Map<string, string>();
    const wikiResolver = await this.getWikiResolver();

    for (const rel of relPaths) {
      const item = await parseMarkdownPageFile(rel, this.pagesDir);
      if (!item) continue;

      const { slug, frontmatter, body } = item;

      // Draft filtering
      if (frontmatter.status === "draft" && !includeDrafts) continue;

      const excerpt = frontmatter.excerpt ?? autoExcerpt(body);
      const { html } = await renderMarkdown(body, { wikiResolver });

      all.push({
        slug,
        title: frontmatter.title,
        date: frontmatter.date,
        status: frontmatter.status,
        excerpt,
        html,
        ...(frontmatter.parent ? { parent: frontmatter.parent } : {}),
        ...(frontmatter.seo ? { seo: frontmatter.seo } : {}),
        menuOrder: frontmatter.menu_order ?? 0,
      });
      bodyBySlug.set(slug, body);
    }

    // Sort by menuOrder ascending, then title ascending (replaces date-descending sort)
    all.sort((a, b) => {
      const orderDiff = (a.menuOrder ?? 0) - (b.menuOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return a.title.localeCompare(b.title);
    });

    // Query filter (mirror listPosts). Page has no tags/categories, so each Page
    // is mapped to a Post-shaped SearchableEntry with synthetic empty taxonomy.
    // applySearch (search.ts) stays UNTOUCHED; match degrades to title + excerpt + body.
    // Skipped entirely when query is undefined => non-search path is byte-identical.
    if (options?.query !== undefined) {
      const entries: SearchableEntry[] = all.map((p) => ({
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
      // Re-project ranked Post[] back to Page[] (preserve tier ordering).
      all = ranked.map((post) => {
        const original = all.find((p) => p.slug === post.slug);
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
    const total = all.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize) || 1;
    const page = options?.page ?? 1;
    const start = (page - 1) * pageSize;
    return { pages: all.slice(start, start + pageSize), total, totalPages };
  }

  async getPage(slug: string, options?: { includeDrafts?: boolean }): Promise<Page | null> {
    const { pages } = await this.listPages({ pageSize: Number.MAX_SAFE_INTEGER, includeDrafts: options?.includeDrafts });
    return pages.find((p) => p.slug === slug) ?? null;
  }

  async listPostStatusCounts(now: string): Promise<StatusCounts> {
    const relPaths = await collectMarkdownFiles(this.postsDir, this.postsDir);
    const parsed = await Promise.all(
      relPaths.map((rel) => parseMarkdownFile(rel, this.postsDir))
    );
    const siteAuthorName = await this.getSiteAuthorName();
    const posts: Post[] = [];
    for (const item of parsed) {
      if (!item) continue;
      const { slug, frontmatter, body } = item;
      // Counts ALWAYS include drafts (admin view) — no draft skipping here
      const { teaser: countTeaser, hasMore: countHasMore } = splitMore(body);
      const excerpt = frontmatter.excerpt ?? (countHasMore ? autoExcerpt(countTeaser) : autoExcerpt(body));
      posts.push({
        slug,
        title: frontmatter.title,
        date: frontmatter.date,
        status: frontmatter.status,
        tags: frontmatter.tags,
        categories: frontmatter.categories,
        excerpt,
        html: "",    // html irrelevant to counts — skip renderMarkdown for performance
        comments: frontmatter.comments,
        sticky: frontmatter.sticky ?? false,
        author: frontmatter.author?.trim() || siteAuthorName,
        visibility: frontmatter.visibility ?? "public",
      });
    }
    return computeStatusCounts(posts, now);
  }

  async listTags(): Promise<Tag[]> {
    // Scan all posts directly to build the full tag index (bypasses pagination)
    const relPaths = await collectMarkdownFiles(this.postsDir, this.postsDir);
    const rawTagsPerPost: string[][] = [];

    for (const rel of relPaths) {
      const item = await parseMarkdownFile(rel, this.postsDir);
      if (!item) continue;
      if (item.frontmatter.status === "draft" && !shouldIncludeDrafts()) continue;
      if (item.frontmatter.visibility === "private" && !shouldIncludeDrafts()) continue;
      rawTagsPerPost.push(item.frontmatter.tags);
    }

    const derived = buildTagIndex(rawTagsPerPost);
    const taxonomyYamlPath = path.join(path.dirname(this.rootDir), "config", "taxonomies.yaml");
    const registry = await loadTaxonomyRegistry(taxonomyYamlPath);
    return mergeTagIndex(derived, registry.tags);
  }

  async listCategories(): Promise<Category[]> {
    // Scan all posts directly to build the full category index (bypasses pagination)
    const relPaths = await collectMarkdownFiles(this.postsDir, this.postsDir);
    const rawCategoriesPerPost: string[][] = [];

    for (const rel of relPaths) {
      const item = await parseMarkdownFile(rel, this.postsDir);
      if (!item) continue;
      if (item.frontmatter.status === "draft" && !shouldIncludeDrafts()) continue;
      if (item.frontmatter.visibility === "private" && !shouldIncludeDrafts()) continue;
      rawCategoriesPerPost.push(item.frontmatter.categories);
    }

    const derived = buildCategoryIndex(rawCategoriesPerPost);
    const taxonomyYamlPath = path.join(path.dirname(this.rootDir), "config", "taxonomies.yaml");
    const registry = await loadTaxonomyRegistry(taxonomyYamlPath);
    return mergeCategoryIndex(derived, registry.categories);
  }

  async getSiteConfig(): Promise<SiteConfig> {
    const configPath = path.join(
      path.dirname(this.rootDir),
      "config",
      "site.yaml"
    );
    return loadSiteConfig(configPath);
  }

  /**
   * Build a wikilink resolver from the whole corpus (posts + pages titles/slugs).
   * Passed into renderMarkdown so [[wikilinks]] resolve to real URLs. Only
   * frontmatter is needed, but we reuse the existing parsers for consistency.
   */
  private async getWikiResolver(): Promise<WikiResolver> {
    const [postRel, pageRel] = await Promise.all([
      collectMarkdownFiles(this.postsDir, this.postsDir),
      collectMarkdownFiles(this.pagesDir, this.pagesDir),
    ]);
    const entries: { type: "post" | "page"; slug: string; title: string }[] = [];

    const posts = await Promise.all(
      postRel.map((rel) => parseMarkdownFile(rel, this.postsDir))
    );
    for (const it of posts) {
      if (it) entries.push({ type: "post", slug: it.slug, title: it.frontmatter.title });
    }

    const pages = await Promise.all(
      pageRel.map((rel) => parseMarkdownPageFile(rel, this.pagesDir))
    );
    for (const it of pages) {
      if (it) entries.push({ type: "page", slug: it.slug, title: it.frontmatter.title });
    }

    return buildWikiResolver(entries);
  }

  /**
   * Scan posts AND pages with their raw bodies into GraphInputNode[]. ALL content
   * is included (drafts/private/password) with published/public flags set — callers
   * derive the reader-facing subset themselves (publicGraph / publicOnly filters).
   */
  private async scanGraphInputs(): Promise<GraphInputNode[]> {
    const [postRel, pageRel] = await Promise.all([
      collectMarkdownFiles(this.postsDir, this.postsDir),
      collectMarkdownFiles(this.pagesDir, this.pagesDir),
    ]);

    const inputs: GraphInputNode[] = [];

    const parsedPosts = await Promise.all(
      postRel.map((rel) => parseMarkdownFile(rel, this.postsDir))
    );
    for (const item of parsedPosts) {
      if (!item) continue;
      const fm = item.frontmatter;
      inputs.push({
        type: "post",
        slug: item.slug,
        title: fm.title,
        body: item.body,
        published: fm.status === "published",
        // Only fully-public posts appear in the reader-facing graph; private and
        // password posts are excluded so their links never leak.
        public: (fm.visibility ?? "public") === "public",
      });
    }

    const parsedPages = await Promise.all(
      pageRel.map((rel) => parseMarkdownPageFile(rel, this.pagesDir))
    );
    for (const item of parsedPages) {
      if (!item) continue;
      const fm = item.frontmatter;
      inputs.push({
        type: "page",
        slug: item.slug,
        title: fm.title,
        body: item.body,
        published: fm.status === "published",
        public: true, // pages have no visibility gating
      });
    }

    return inputs;
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
