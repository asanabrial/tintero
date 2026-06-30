/**
 * Backfill — reads the full filesystem content corpus and upserts it into the
 * SQL content database.
 *
 * Design goals:
 *   - IDEMPOTENT: safe to run multiple times; existing rows are updated, not duplicated.
 *   - INJECTABLE: receives drizzle instance + schema bundle as arguments; never reads
 *     env vars or constructs the DB itself (enables in-memory DB in tests).
 *   - DRY-RUN: when dryRun=true, computes and returns the report WITHOUT writing.
 *   - DIALECT-AGNOSTIC: works with both schema.sqlite.ts and schema.pg.ts table objects.
 *
 * Architecture note — raw body:
 *   ContentRepository.listPosts returns rendered HTML (post.html), NOT raw markdown.
 *   The DB stores body_markdown (raw). To get the raw body the source must implement
 *   RawBodyReader (ports.ts). FilesystemContentAdapter implements this interface.
 *   If the source does not expose raw bodies, this function will write empty strings
 *   for body_markdown rather than silently storing HTML.
 *
 * content_meta idempotency:
 *   A UNIQUE INDEX on (content_id, meta_key) (added to both schema files) allows
 *   onConflictDoUpdate to upsert SEO rows cleanly without delete-before-insert.
 */

import { eq, isNull, sql } from "drizzle-orm";
import { newId, toEpoch, nowEpoch, toBool01 } from "./db-values";
import { slugifyTag } from "./tag";
import { slugifyCategory, joinSlug } from "./category";
import { SEO_FIELDS, seoMetaKey, seoMetaValue } from "./seo-meta";
import type { ContentRepository, RawBodyReader } from "./ports";
import type { PostSeo } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleContentSchema = Record<string, any>;

/**
 * Source of content for backfill.
 * Must implement both the read repository and the raw-body reader interfaces.
 * FilesystemContentAdapter satisfies both.
 */
export type BackfillSource = ContentRepository & RawBodyReader;

export interface BackfillOpts {
  /**
   * Content source — reads posts/pages and raw markdown bodies.
   * The source must safely handle `pageSize: Number.MAX_SAFE_INTEGER` because
   * backfill always fetches the entire corpus in a single call. FilesystemContentAdapter
   * satisfies this; a DB-backed ContentRepository would not be an appropriate
   * backfill source (it would attempt to load every row into memory at once).
   */
  source: BackfillSource;
  /** Drizzle DB instance (libSQL, node-postgres, pglite — all accepted). */
  db: DrizzleDb;
  /** Dialect-appropriate schema bundle (schema.sqlite or schema.pg). */
  schema: DrizzleContentSchema;
  /**
   * When true, compute and return counts WITHOUT writing any DB rows.
   * Useful for previewing what a real backfill would do.
   */
  dryRun?: boolean;
}

export interface BackfillReport {
  /** Number of posts processed. */
  posts: number;
  /** Number of pages processed. */
  pages: number;
  /** Number of distinct taxonomy terms upserted. */
  terms: number;
  /** Number of content↔term relationship pairs processed. */
  relationships: number;
  /** Number of SEO content_meta key-value pairs processed. */
  meta: number;
}

// ---------------------------------------------------------------------------
// Helpers — term deduplication
// ---------------------------------------------------------------------------

interface TermEntry {
  taxonomy: string;
  slug: string;
  label: string;
}

function buildTermMap(
  posts: Array<{ tags: string[]; categories: string[] }>
): Map<string, TermEntry> {
  const map = new Map<string, TermEntry>();

  for (const post of posts) {
    for (const rawTag of post.tags) {
      const slug = slugifyTag(rawTag);
      const key = `tag:${slug}`;
      if (!map.has(key)) {
        map.set(key, { taxonomy: "tag", slug, label: rawTag });
      }
    }
    for (const rawCat of post.categories) {
      const slug = joinSlug(slugifyCategory(rawCat));
      if (!slug) continue;
      const key = `category:${slug}`;
      if (!map.has(key)) {
        map.set(key, { taxonomy: "category", slug, label: rawCat });
      }
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Helpers — relationship count from source
// ---------------------------------------------------------------------------

function countRelationships(
  posts: Array<{ tags: string[]; categories: string[] }>
): number {
  let total = 0;
  for (const post of posts) {
    // Dedupe tags per post: duplicate raw tags map to the same slug, and the
    // composite PK + onConflictDoNothing means only 1 row is written. Count
    // DISTINCT slugs so report.relationships matches actual written rows.
    const tagSlugs = new Set(post.tags.map(slugifyTag));
    total += tagSlugs.size;

    // Dedupe categories per post (same rationale; skip empty slugs).
    const catSlugs = new Set<string>();
    for (const rawCat of post.categories) {
      const slug = joinSlug(slugifyCategory(rawCat));
      if (slug) catSlugs.add(slug);
    }
    total += catSlugs.size;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Helpers — SEO meta count from source
// ---------------------------------------------------------------------------

function countMeta(
  items: Array<{ seo?: PostSeo }>
): number {
  let total = 0;
  for (const item of items) {
    if (!item.seo) continue;
    for (const field of SEO_FIELDS) {
      if (item.seo[field] !== undefined) total += 1;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Main backfill function
// ---------------------------------------------------------------------------

export async function runBackfill(opts: BackfillOpts): Promise<BackfillReport> {
  const { source, db, schema, dryRun = false } = opts;

  // 1. Fetch entire corpus from source (all posts and pages, including drafts)
  const [postsResult, pagesResult] = await Promise.all([
    source.listPosts({ includeDrafts: true, pageSize: Number.MAX_SAFE_INTEGER }),
    source.listPages({ includeDrafts: true, pageSize: Number.MAX_SAFE_INTEGER }),
  ]);

  const posts = postsResult.posts;
  const pages = pagesResult.pages;

  // 2. Build term dedup map from posts (pages have no tags/categories)
  const termMap = buildTermMap(posts);

  // 3. Compute report counts (deterministic from source — same whether dryRun or not)
  const relCount = countRelationships(posts);
  const metaCount = countMeta([...posts, ...pages]);

  const report: BackfillReport = {
    posts: posts.length,
    pages: pages.length,
    terms: termMap.size,
    relationships: relCount,
    meta: metaCount,
  };

  if (dryRun) {
    return report;
  }

  const now = nowEpoch();

  // 4. Fetch raw bodies for all posts and pages in parallel
  const [rawPostBodies, rawPageBodies] = await Promise.all([
    Promise.all(posts.map((p) => source.readRawPost(p.slug))),
    Promise.all(pages.map((p) => source.readRawPage(p.slug))),
  ]);

  // 5. Upsert posts into content table
  // On conflict (type, slug), update mutable fields and preserve id + created_at.
  const postIdBySlug = new Map<string, string>();

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const rawBody = rawPostBodies[i];
    const bodyMarkdown = rawBody?.body ?? "";
    const id = newId();

    const inserted = await db
      .insert(schema.content)
      .values({
        id,
        type: "post",
        slug: post.slug,
        title: post.title,
        status: post.status,
        visibility: post.visibility ?? "public",
        password: post.password ?? null,
        body_markdown: bodyMarkdown,
        excerpt: post.excerpt ?? null,
        cover_image: post.coverImage ?? null,
        author_label: post.author ?? null,
        author_id: null,
        sticky: toBool01(post.sticky ?? false),
        comments_enabled: toBool01(post.comments ?? false),
        parent_id: null,
        menu_order: 0,
        published_at: toEpoch(post.date),
        created_at: now,
        updated_at: now,
        // A live FS file is always untrashed — set deleted_at = null on INSERT.
        // Intentionally omitted from onConflictDoUpdate: a row trashed in the DB
        // must stay trashed across re-backfill (the FS file re-asserting itself
        // should not silently un-trash it).
        deleted_at: null,
      })
      .onConflictDoUpdate({
        target: [schema.content.type, schema.content.slug],
        // targetWhere scopes the conflict check to the partial unique index
        // (WHERE deleted_at IS NULL). Without this, SQLite/PG cannot resolve
        // the conflict target to the partial index definition.
        targetWhere: isNull(schema.content.deleted_at),
        set: {
          title: post.title,
          status: post.status,
          visibility: post.visibility ?? "public",
          password: post.password ?? null,
          body_markdown: bodyMarkdown,
          excerpt: post.excerpt ?? null,
          cover_image: post.coverImage ?? null,
          author_label: post.author ?? null,
          sticky: toBool01(post.sticky ?? false),
          comments_enabled: toBool01(post.comments ?? false),
          menu_order: 0,
          published_at: toEpoch(post.date),
          updated_at: now,
          // deleted_at is NOT updated here — a trashed row must remain trashed
          // even when the source FS file still exists (re-backfill ≠ un-trash).
        },
      })
      .returning({ id: schema.content.id });

    postIdBySlug.set(post.slug, inserted[0].id);
  }

  // 6. Upsert pages into content table — pass 1: parent_id = null
  // Pass 2 (below) resolves parent_id by slug → UUID after all pages exist.
  const pageIdBySlug = new Map<string, string>();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const rawBody = rawPageBodies[i];
    const bodyMarkdown = rawBody?.body ?? "";
    const id = newId();

    const inserted = await db
      .insert(schema.content)
      .values({
        id,
        type: "page",
        slug: page.slug,
        title: page.title,
        status: page.status,
        visibility: "public",
        password: null,
        body_markdown: bodyMarkdown,
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
        // A live FS file is always untrashed — set deleted_at = null on INSERT.
        // Intentionally omitted from onConflictDoUpdate: a row trashed in the DB
        // must stay trashed across re-backfill (see posts section above).
        deleted_at: null,
      })
      .onConflictDoUpdate({
        target: [schema.content.type, schema.content.slug],
        // targetWhere scopes the conflict check to the partial unique index
        // (WHERE deleted_at IS NULL). Same rationale as the post upsert above.
        targetWhere: isNull(schema.content.deleted_at),
        set: {
          title: page.title,
          status: page.status,
          body_markdown: bodyMarkdown,
          excerpt: page.excerpt ?? null,
          menu_order: page.menuOrder ?? 0,
          published_at: toEpoch(page.date),
          updated_at: now,
          // deleted_at is NOT updated here — a trashed row must remain trashed
          // even when the source FS file still exists (re-backfill ≠ un-trash).
        },
      })
      .returning({ id: schema.content.id });

    pageIdBySlug.set(page.slug, inserted[0].id);
  }

  // 7. Page parent_id — pass 2: resolve slug → UUID for pages that have a parent
  for (const page of pages) {
    if (!page.parent) continue;
    const parentId = pageIdBySlug.get(page.parent);
    if (!parentId) {
      // Parent slug not found in corpus — leave parent_id null (non-fatal)
      continue;
    }
    const childId = pageIdBySlug.get(page.slug);
    if (!childId) continue;

    await db
      .update(schema.content)
      .set({ parent_id: parentId, updated_at: now })
      .where(eq(schema.content.id, childId));
  }

  // 8. Upsert terms
  // On conflict (taxonomy, slug), update the label (in case it changed) and updated_at.
  const termIdMap = new Map<string, string>(); // "taxonomy:slug" → DB id

  for (const [key, term] of termMap) {
    const id = newId();
    const inserted = await db
      .insert(schema.terms)
      .values({
        id,
        taxonomy: term.taxonomy,
        slug: term.slug,
        label: term.label,
        parent_id: null,
        description_markdown: null,
        count: 0,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [schema.terms.taxonomy, schema.terms.slug],
        set: {
          label: term.label,
          updated_at: now,
        },
      })
      .returning({ id: schema.terms.id });

    termIdMap.set(key, inserted[0].id);
  }

  // 9. Insert term_relationships — idempotent via onConflictDoNothing on composite PK
  for (const post of posts) {
    const contentId = postIdBySlug.get(post.slug);
    if (!contentId) continue;

    for (const rawTag of post.tags) {
      const slug = slugifyTag(rawTag);
      const termId = termIdMap.get(`tag:${slug}`);
      if (!termId) continue;
      await db
        .insert(schema.term_relationships)
        .values({ content_id: contentId, term_id: termId })
        .onConflictDoNothing();
    }

    for (const rawCat of post.categories) {
      const slug = joinSlug(slugifyCategory(rawCat));
      if (!slug) continue;
      const termId = termIdMap.get(`category:${slug}`);
      if (!termId) continue;
      await db
        .insert(schema.term_relationships)
        .values({ content_id: contentId, term_id: termId })
        .onConflictDoNothing();
    }
  }

  // 10. Upsert content_meta for SEO fields
  // Requires UNIQUE INDEX on (content_id, meta_key) — added to both schema files.
  //
  // IMPORTANT: posts and pages are iterated in SEPARATE loops, each resolving ids
  // from their own dedicated map (postIdBySlug / pageIdBySlug). A combined loop that
  // used `postIdBySlug.get(slug) ?? pageIdBySlug.get(slug)` would silently mis-attribute
  // a page's SEO to a post's content_id whenever both share the same slug (valid —
  // content table is unique on (type, slug), not on slug alone).
  for (const post of posts) {
    if (!post.seo) continue;

    const contentId = postIdBySlug.get(post.slug);
    if (!contentId) continue;

    for (const field of SEO_FIELDS) {
      const value = post.seo[field];
      if (value === undefined) continue;

      const metaKey = seoMetaKey(field);
      const metaValue = seoMetaValue(value);
      const id = newId();

      await db
        .insert(schema.content_meta)
        .values({
          id,
          content_id: contentId,
          meta_key: metaKey,
          meta_value: metaValue,
        })
        .onConflictDoUpdate({
          target: [schema.content_meta.content_id, schema.content_meta.meta_key],
          set: { meta_value: metaValue },
        });
    }
  }

  for (const page of pages) {
    if (!page.seo) continue;

    const contentId = pageIdBySlug.get(page.slug);
    if (!contentId) continue;

    for (const field of SEO_FIELDS) {
      const value = page.seo[field];
      if (value === undefined) continue;

      const metaKey = seoMetaKey(field);
      const metaValue = seoMetaValue(value);
      const id = newId();

      await db
        .insert(schema.content_meta)
        .values({
          id,
          content_id: contentId,
          meta_key: metaKey,
          meta_value: metaValue,
        })
        .onConflictDoUpdate({
          target: [schema.content_meta.content_id, schema.content_meta.meta_key],
          set: { meta_value: metaValue },
        });
    }
  }

  // 11. Reconcile terms.count — set each term's count to the number of DISTINCT
  // Note: backfill is additive. Terms removed from all posts between runs are NOT
  // deleted from the terms table — pruning orphaned terms is a separate operation.
  // content_id rows in term_relationships for that term (GROUP BY across all terms).
  const relCountRows: Array<{ term_id: string; cnt: unknown }> = await db
    .select({
      term_id: schema.term_relationships.term_id,
      cnt: sql`count(distinct ${schema.term_relationships.content_id})`,
    })
    .from(schema.term_relationships)
    .groupBy(schema.term_relationships.term_id);

  for (const row of relCountRows) {
    await db
      .update(schema.terms)
      .set({ count: Number(row.cnt), updated_at: now })
      .where(eq(schema.terms.id, row.term_id));
  }

  return report;
}
