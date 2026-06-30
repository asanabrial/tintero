/**
 * DrizzleContentWriter — write-side DB adapter for posts.
 *
 * Implements ContentWriter using an injected drizzle instance + schema bundle.
 * Schema-agnostic: both schema.sqlite.ts and schema.pg.ts are accepted.
 *
 * Slice scope (Phase 5 Slice B):
 *   - CRUD core: createPost / updatePost / deletePost / readRaw / setPostStatus
 *   - Trash operations: NOT implemented (throw "Phase 5 Slice C")
 *   - Pages: NOT implemented (separate slice)
 *
 * Atomicity:
 *   Each mutating method wraps its full write sequence in a single transaction via
 *   `withTransaction` (see ./db-transaction), using libSQL's async transaction API
 *   (db.transaction(async tx => ...)). A mid-write failure rolls back the WHOLE
 *   operation — no orphan content / term / relationship / meta rows. Read-only
 *   pre-work (validation, slug derivation, collision lookups) stays OUTSIDE the
 *   transaction; best-effort revision capture runs AFTER it commits.
 *
 * ADR-7 note:
 *   The FS writer preserves unknown frontmatter keys via a rawData spread (ADR-7).
 *   The DB has no concept of arbitrary extra keys — only the schema columns exist.
 *   readRaw returns { frontmatter, rawData } where both fields contain the same
 *   reconstructed object from the DB row. The rawData shape matches the admin
 *   action layer's expected keys (title, date, status, tags, categories, etc.).
 */

import { and, asc, desc, eq, inArray, isNotNull, isNull, like, ne, sql } from "drizzle-orm";
import {
  PostFrontmatterSchema,
} from "./schema";
import {
  isSafeSlug,
  resolveCollisionSlug,
  slugifyTitle,
} from "./slug";
import {
  newId,
  nowEpoch,
  toEpoch,
  fromEpoch,
  toBool01,
  fromBool01,
} from "./db-values";
import { slugifyTag } from "./tag";
import { slugifyCategory, joinSlug } from "./category";
import { SEO_FIELDS, seoMetaKey, seoMetaValue, reassembleSeo } from "./seo-meta";
import { cleanSeo } from "./fs-writer";
import {
  serializePostMarkdown,
  type SerializableFrontmatter,
} from "./markdown-serialize";
import type {
  ContentWriter,
  CreatePostInput,
  UpdatePostInput,
  WriteResult,
  TrashedItemInfo,
} from "./ports";
import type { PostSeo } from "./types";
import type { RevisionContext } from "../revisions/types";
import type { RevisionRepository } from "../revisions/ports";
import { getRevisionRepository } from "../revisions/factory";
import { withTransaction, type Executor } from "./db-transaction";
import { upsertReturningId, upsert, insertIgnore } from "./db-upsert";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleContentSchema = Record<string, any>;

export class DrizzleContentWriter implements ContentWriter {
  private readonly db: DrizzleDb;
  private readonly schema: DrizzleContentSchema;
  private readonly revisions: () => RevisionRepository;

  constructor(
    db: DrizzleDb,
    schema: DrizzleContentSchema,
    revisions: () => RevisionRepository = () => getRevisionRepository()
  ) {
    this.db = db;
    this.schema = schema;
    this.revisions = revisions;
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  /**
   * Best-effort revision capture — mirrors FsContentWriter.captureRevision.
   * Called AFTER the atomic write succeeds. DB failures are swallowed.
   */
  private async captureRevision(
    contentType: "post" | "page",
    slug: string,
    rawContent: string,
    rev?: RevisionContext
  ): Promise<void> {
    try {
      await this.revisions().record({
        contentType,
        slug,
        rawContent,
        source: rev?.source ?? "cli",
        authorId: rev?.authorId ?? null,
        authorLabel: rev?.authorLabel ?? null,
      });
    } catch {
      // Best-effort: DB down / no DATABASE_URL — swallow, never re-throw.
    }
  }

  /**
   * Return the set of slugs for all LIVE (non-trashed) posts.
   * Used by createPost for collision resolution.
   */
  private async getLiveSlugs(): Promise<Set<string>> {
    const rows: Array<{ slug: string }> = await this.db
      .select({ slug: this.schema.content.slug })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "post"),
          isNull(this.schema.content.deleted_at)
        )
      );
    return new Set(rows.map((r) => r.slug));
  }

  /**
   * Upsert a term row (taxonomy, slug, label).
   * On conflict (taxonomy, slug): update label + updated_at.
   * Returns the term's DB id.
   */
  private async upsertTerm(
    exec: Executor,
    taxonomy: string,
    slug: string,
    label: string
  ): Promise<string> {
    const now = nowEpoch();
    const id = newId();
    return upsertReturningId(
      exec,
      this.schema.terms,
      {
        id,
        taxonomy,
        slug,
        label,
        parent_id: null,
        description_markdown: null,
        count: 0,
        created_at: now,
        updated_at: now,
      },
      {
        conflictTarget: [this.schema.terms.taxonomy, this.schema.terms.slug],
        updateSet: { label, updated_at: now },
        idColumn: this.schema.terms.id,
        // MySQL has no RETURNING: identify the live term row by its natural key
        // (taxonomy, slug) — the same row the conflict target resolves to.
        naturalKeyWhere: and(
          eq(this.schema.terms.taxonomy, taxonomy),
          eq(this.schema.terms.slug, slug)
        ),
      }
    );
  }

  /**
   * Reconcile terms.count for a set of term IDs.
   * Recounts LIVE usage only: counts DISTINCT content_id in term_relationships
   * joined to content WHERE content.deleted_at IS NULL.
   * This ensures trashed posts do not inflate term counts; restoring a post
   * brings its terms' counts back.
   * Sets count = 0 for terms no longer referenced by any live post.
   */
  private async reconcileTermCounts(
    exec: Executor,
    termIds: string[]
  ): Promise<void> {
    if (termIds.length === 0) return;
    const now = nowEpoch();
    const uniqueIds = [...new Set(termIds)];

    const counts: Array<{ term_id: string; cnt: unknown }> = await exec
      .select({
        term_id: this.schema.term_relationships.term_id,
        cnt: sql`count(distinct ${this.schema.term_relationships.content_id})`,
      })
      .from(this.schema.term_relationships)
      .innerJoin(
        this.schema.content,
        eq(this.schema.term_relationships.content_id, this.schema.content.id)
      )
      .where(
        and(
          inArray(this.schema.term_relationships.term_id, uniqueIds),
          isNull(this.schema.content.deleted_at)
        )
      )
      .groupBy(this.schema.term_relationships.term_id);

    const countMap = new Map(counts.map((r) => [r.term_id, Number(r.cnt)]));

    for (const termId of uniqueIds) {
      const cnt = countMap.get(termId) ?? 0;
      await exec
        .update(this.schema.terms)
        .set({ count: cnt, updated_at: now })
        .where(eq(this.schema.terms.id, termId));
    }
  }

  /**
   * Insert SEO content_meta rows for a new content row.
   * Uses onConflictDoUpdate so callers may re-use it idempotently.
   */
  private async insertSeoMeta(
    exec: Executor,
    contentId: string,
    seo: PostSeo | undefined
  ): Promise<void> {
    const cleaned = cleanSeo(seo);
    if (!cleaned) return;

    for (const field of SEO_FIELDS) {
      const value = cleaned[field];
      if (value === undefined) continue;
      const id = newId();
      await upsert(
        exec,
        this.schema.content_meta,
        {
          id,
          content_id: contentId,
          meta_key: seoMetaKey(field),
          meta_value: seoMetaValue(value),
        },
        {
          conflictTarget: [
            this.schema.content_meta.content_id,
            this.schema.content_meta.meta_key,
          ],
          updateSet: { meta_value: seoMetaValue(value) },
        }
      );
    }
  }

  /**
   * Replace all SEO content_meta rows for a content item.
   * Strategy: DELETE all existing seo.* rows, then re-insert the new set.
   * This is simpler than diffing and correctly handles field removal.
   */
  private async updateSeoMeta(
    exec: Executor,
    contentId: string,
    seo: PostSeo | undefined
  ): Promise<void> {
    // Step 1: delete all existing seo rows for this content
    await exec
      .delete(this.schema.content_meta)
      .where(
        and(
          eq(this.schema.content_meta.content_id, contentId),
          like(this.schema.content_meta.meta_key, "seo.%")
        )
      );

    // Step 2: insert the new set (may be empty if cleanSeo returns undefined)
    const cleaned = cleanSeo(seo);
    if (!cleaned) return;

    for (const field of SEO_FIELDS) {
      const value = cleaned[field];
      if (value === undefined) continue;
      const id = newId();
      await exec.insert(this.schema.content_meta).values({
        id,
        content_id: contentId,
        meta_key: seoMetaKey(field),
        meta_value: seoMetaValue(value),
      });
    }
  }

  // ------------------------------------------------------------------
  // ContentWriter — CRUD core
  // ------------------------------------------------------------------

  async createPost(
    input: CreatePostInput,
    rev?: RevisionContext
  ): Promise<WriteResult> {
    // Validate explicit slug before anything else — mirrors FsContentWriter order.
    if (input.slug?.trim()) {
      if (!isSafeSlug(input.slug.trim())) {
        return {
          ok: false,
          error: { kind: "invalid_slug", slug: input.slug.trim() },
        };
      }
    }

    // Validate frontmatter (title, date, status, tags, categories, comments,
    // author, authorId, visibility, password, seo). sticky is handled directly
    // from input (mirrors FsContentWriter which bypasses schema for sticky).
    const parseResult = PostFrontmatterSchema.safeParse({
      title: input.title,
      date: input.date,
      status: input.status,
      excerpt: input.excerpt,
      coverImage: input.coverImage,
      tags: input.tags,
      categories: input.categories,
      comments: input.comments,
      author: input.author,
      authorId: input.authorId,
      visibility: input.visibility,
      password: input.password,
      seo: input.seo,
    });
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
        .join("; ");
      return { ok: false, error: { kind: "invalid_frontmatter", issues } };
    }

    // Derive final slug (explicit → slugify; else slugifyTitle(title))
    const rawDesired = input.slug?.trim()
      ? slugifyTitle(input.slug.trim())
      : slugifyTitle(input.title);

    if (!rawDesired || !isSafeSlug(rawDesired)) {
      return { ok: false, error: { kind: "invalid_slug", slug: rawDesired } };
    }

    // Auto-resolve collision against LIVE posts (same as FS createPost)
    const existingSlugs = await this.getLiveSlugs();
    const finalSlug = resolveCollisionSlug(rawDesired, existingSlugs);

    const now = nowEpoch();
    const contentId = newId();

    // Atomic write sequence: content row + terms + relationships + SEO meta +
    // count reconciliation. A failure anywhere rolls the whole thing back.
    await withTransaction(this.db, async (tx: Executor) => {
      await tx.insert(this.schema.content).values({
        id: contentId,
        type: "post",
        slug: finalSlug,
        title: parseResult.data.title,
        status: parseResult.data.status,
        visibility: parseResult.data.visibility ?? "public",
        password: parseResult.data.password ?? null,
        body_markdown: input.body,
        excerpt: parseResult.data.excerpt ?? null,
        cover_image: parseResult.data.coverImage ?? null,
        author_label: parseResult.data.author ?? null,
        author_id: parseResult.data.authorId ?? null,
        sticky: toBool01(input.sticky ?? false),
        comments_enabled: toBool01(parseResult.data.comments),
        parent_id: null,
        menu_order: 0,
        published_at: toEpoch(parseResult.data.date),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });

      // Upsert terms + relationships
      const affectedTermIds: string[] = [];

      for (const rawTag of parseResult.data.tags) {
        const slug = slugifyTag(rawTag);
        const termId = await this.upsertTerm(tx, "tag", slug, rawTag);
        await insertIgnore(
          tx,
          this.schema.term_relationships,
          { content_id: contentId, term_id: termId },
          { selfRefColumn: this.schema.term_relationships.content_id }
        );
        affectedTermIds.push(termId);
      }

      for (const rawCat of parseResult.data.categories) {
        const slug = joinSlug(slugifyCategory(rawCat));
        if (!slug) continue;
        const termId = await this.upsertTerm(tx, "category", slug, rawCat);
        await insertIgnore(
          tx,
          this.schema.term_relationships,
          { content_id: contentId, term_id: termId },
          { selfRefColumn: this.schema.term_relationships.content_id }
        );
        affectedTermIds.push(termId);
      }

      // Write SEO content_meta rows
      await this.insertSeoMeta(tx, contentId, parseResult.data.seo);

      // Reconcile term counts for affected terms
      await this.reconcileTermCounts(tx, affectedTermIds);
    });

    // Build the full serialized markdown for revision capture — mirrors FsContentWriter.createPost.
    // Slug is pinned in frontmatter only when it differs from the title-derived slug
    // (matches FS: needsExplicitSlug = finalSlug !== slugifyTitle(title)).
    const inferredFromTitle = slugifyTitle(parseResult.data.title);
    const needsExplicitSlug = finalSlug !== inferredFromTitle;
    const fm: SerializableFrontmatter = {
      title: parseResult.data.title,
      ...(needsExplicitSlug ? { slug: finalSlug } : {}),
      date: parseResult.data.date,
      status: parseResult.data.status,
      ...(parseResult.data.excerpt ? { excerpt: parseResult.data.excerpt } : {}),
      ...(parseResult.data.coverImage ? { coverImage: parseResult.data.coverImage } : {}),
      tags: parseResult.data.tags,
      categories: parseResult.data.categories,
      comments: parseResult.data.comments,
      ...(parseResult.data.author ? { author: parseResult.data.author } : {}),
      ...(input.sticky ? { sticky: true } : {}),
      ...(parseResult.data.authorId ? { authorId: parseResult.data.authorId } : {}),
      ...(input.visibility && input.visibility !== "public" ? { visibility: input.visibility } : {}),
      ...(input.visibility === "password" && input.password ? { password: input.password } : {}),
      ...(cleanSeo(parseResult.data.seo) ? { seo: cleanSeo(parseResult.data.seo) } : {}),
    };
    const rawContent = serializePostMarkdown(fm, input.body);

    // Best-effort revision capture — AFTER all writes succeed; failures swallowed.
    await this.captureRevision("post", finalSlug, rawContent, rev);

    return { ok: true, slug: finalSlug };
  }

  async updatePost(
    currentSlug: string,
    input: UpdatePostInput,
    rev?: RevisionContext
  ): Promise<WriteResult> {
    // Locate existing live post
    const existingRows: Array<{
      id: string;
      slug: string;
      author_id: string | null;
    }> = await this.db
      .select({
        id: this.schema.content.id,
        slug: this.schema.content.slug,
        author_id: this.schema.content.author_id,
      })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "post"),
          eq(this.schema.content.slug, currentSlug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (existingRows.length === 0) {
      return {
        ok: false,
        error: { kind: "post_not_found", slug: currentSlug },
      };
    }

    const existingRow = existingRows[0];
    const contentId = existingRow.id;
    const existingAuthorId = existingRow.author_id;

    // Compute new slug
    const desiredNewSlug = input.slug?.trim()
      ? slugifyTitle(input.slug.trim())
      : currentSlug;
    const slugChanged = desiredNewSlug !== currentSlug;

    if (slugChanged) {
      // Validate new slug charset
      if (!isSafeSlug(desiredNewSlug)) {
        return {
          ok: false,
          error: { kind: "invalid_slug", slug: desiredNewSlug },
        };
      }
      // Hard-reject collision: another LIVE post (not the current row) already owns the new slug
      const collisionRows: Array<{ id: string }> = await this.db
        .select({ id: this.schema.content.id })
        .from(this.schema.content)
        .where(
          and(
            eq(this.schema.content.type, "post"),
            eq(this.schema.content.slug, desiredNewSlug),
            isNull(this.schema.content.deleted_at),
            ne(this.schema.content.id, contentId)
          )
        )
        .limit(1);
      if (collisionRows.length > 0) {
        return {
          ok: false,
          error: { kind: "slug_collision", slug: desiredNewSlug },
        };
      }
    }

    const newSlug = slugChanged ? desiredNewSlug : currentSlug;

    // Validate frontmatter — note: authorId and sticky are NOT validated via the
    // schema here (mirrors FsContentWriter.updatePost which also omits both).
    // authorId is preserved from the existing DB row (equivalent to ADR-7 rawData spread).
    // sticky is read directly from input (as in FsContentWriter).
    const parseResult = PostFrontmatterSchema.safeParse({
      title: input.title,
      date: input.date,
      status: input.status,
      excerpt: input.excerpt,
      coverImage: input.coverImage,
      tags: input.tags,
      categories: input.categories,
      comments: input.comments,
      author: input.author,
      visibility: input.visibility,
      password: input.password,
      seo: input.seo,
    });
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
        .join("; ");
      return { ok: false, error: { kind: "invalid_frontmatter", issues } };
    }

    const now = nowEpoch();

    // Collect old term IDs before mutation (for count reconciliation)
    const oldTermRels: Array<{ term_id: string }> = await this.db
      .select({ term_id: this.schema.term_relationships.term_id })
      .from(this.schema.term_relationships)
      .where(eq(this.schema.term_relationships.content_id, contentId));
    const oldTermIds = oldTermRels.map((r) => r.term_id);

    // Atomic write sequence: content UPDATE + term relationship replacement +
    // SEO meta replacement + count reconciliation roll back together on failure.
    await withTransaction(this.db, async (tx: Executor) => {
      // UPDATE content row by ID — preserve author_id from existing row (ADR-7 parity)
      await tx
        .update(this.schema.content)
        .set({
          slug: newSlug,
          title: parseResult.data.title,
          status: parseResult.data.status,
          visibility: parseResult.data.visibility ?? "public",
          password: parseResult.data.password ?? null,
          body_markdown: input.body,
          excerpt: parseResult.data.excerpt ?? null,
          cover_image: parseResult.data.coverImage ?? null,
          author_label: parseResult.data.author ?? null,
          // author_id is preserved from the existing row (not overwritten from input)
          author_id: existingAuthorId,
          sticky: toBool01(input.sticky ?? false),
          comments_enabled: toBool01(parseResult.data.comments),
          published_at: toEpoch(parseResult.data.date),
          updated_at: now,
        })
        .where(eq(this.schema.content.id, contentId));

      // Delete all old term_relationships for this content
      await tx
        .delete(this.schema.term_relationships)
        .where(eq(this.schema.term_relationships.content_id, contentId));

      // Upsert new terms + relationships
      const newTermIds: string[] = [];

      for (const rawTag of parseResult.data.tags) {
        const slug = slugifyTag(rawTag);
        const termId = await this.upsertTerm(tx, "tag", slug, rawTag);
        await insertIgnore(
          tx,
          this.schema.term_relationships,
          { content_id: contentId, term_id: termId },
          { selfRefColumn: this.schema.term_relationships.content_id }
        );
        newTermIds.push(termId);
      }

      for (const rawCat of parseResult.data.categories) {
        const slug = joinSlug(slugifyCategory(rawCat));
        if (!slug) continue;
        const termId = await this.upsertTerm(tx, "category", slug, rawCat);
        await insertIgnore(
          tx,
          this.schema.term_relationships,
          { content_id: contentId, term_id: termId },
          { selfRefColumn: this.schema.term_relationships.content_id }
        );
        newTermIds.push(termId);
      }

      // Replace SEO meta (delete old set, insert new set)
      await this.updateSeoMeta(tx, contentId, parseResult.data.seo);

      // Reconcile term counts for all affected terms (old + new)
      const allAffected = [...new Set([...oldTermIds, ...newTermIds])];
      await this.reconcileTermCounts(tx, allAffected);
    });

    // Build the full serialized markdown for revision capture — mirrors FsContentWriter.updatePost.
    // Slug is pinned only when it differs from what deriveSlug would infer from the (new) title.
    // This matches FS behaviour: for an unchanged slug with an unchanged title, slug is omitted
    // (rawData from disk had no explicit slug); for a changed slug or title-derived divergence,
    // slug is pinned explicitly.
    const inferredFromTitle = slugifyTitle(input.title);
    const shouldPinSlug = newSlug !== inferredFromTitle;
    const updateFm: SerializableFrontmatter = {
      title: parseResult.data.title,
      ...(shouldPinSlug ? { slug: newSlug } : {}),
      date: parseResult.data.date,
      status: parseResult.data.status,
      ...(parseResult.data.excerpt ? { excerpt: parseResult.data.excerpt } : {}),
      ...(parseResult.data.coverImage ? { coverImage: parseResult.data.coverImage } : {}),
      tags: parseResult.data.tags,
      categories: parseResult.data.categories,
      comments: parseResult.data.comments,
      ...(parseResult.data.author ? { author: parseResult.data.author } : {}),
      ...(input.sticky ? { sticky: true } : {}),
      // authorId: preserve from the existing DB row (mirrors FsContentWriter which spreads
      // existing.rawData and thus keeps the authorId from the original write).
      ...(existingAuthorId ? { authorId: existingAuthorId } : {}),
      ...(input.visibility && input.visibility !== "public" ? { visibility: input.visibility } : {}),
      ...(input.visibility === "password" && input.password ? { password: input.password } : {}),
      ...(cleanSeo(parseResult.data.seo) ? { seo: cleanSeo(parseResult.data.seo) } : {}),
    };
    const updateRawContent = serializePostMarkdown(updateFm, input.body);

    // Best-effort revision — AFTER all writes succeed; failures swallowed.
    await this.captureRevision("post", newSlug, updateRawContent, rev);

    return { ok: true, slug: newSlug };
  }

  async deletePost(slug: string): Promise<WriteResult> {
    // Find the live post (graceful: absent → ok:true, same as FsContentWriter on ENOENT)
    const rows: Array<{ id: string }> = await this.db
      .select({ id: this.schema.content.id })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "post"),
          eq(this.schema.content.slug, slug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      // Graceful: row absent → ok:true
      return { ok: true, slug };
    }

    const contentId = rows[0].id;

    // Collect affected term IDs for count reconciliation
    const termRels: Array<{ term_id: string }> = await this.db
      .select({ term_id: this.schema.term_relationships.term_id })
      .from(this.schema.term_relationships)
      .where(eq(this.schema.term_relationships.content_id, contentId));
    const affectedTermIds = termRels.map((r) => r.term_id);

    // Atomic cascade: term_relationships + content_meta + content + count
    // reconciliation roll back together on failure.
    await withTransaction(this.db, async (tx: Executor) => {
      // Cascade: delete term_relationships and content_meta before the content row
      await tx
        .delete(this.schema.term_relationships)
        .where(eq(this.schema.term_relationships.content_id, contentId));

      await tx
        .delete(this.schema.content_meta)
        .where(eq(this.schema.content_meta.content_id, contentId));

      // Hard-delete the content row
      await tx
        .delete(this.schema.content)
        .where(eq(this.schema.content.id, contentId));

      // Reconcile counts for freed terms
      await this.reconcileTermCounts(tx, affectedTermIds);
    });

    return { ok: true, slug };
  }

  async readRaw(
    slug: string
  ): Promise<{
    frontmatter: Record<string, unknown>;
    rawData: Record<string, unknown>;
    body: string;
  } | null> {
    // Fetch the live post row
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
      author_id: string | null;
      sticky: number;
      comments_enabled: number;
      published_at: number;
    }> = await this.db
      .select()
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "post"),
          eq(this.schema.content.slug, slug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0];

    // Fetch terms for this content in a stable, deterministic order.
    // ORDER BY label ASC, id ASC gives an alphabetical tag/category list that is
    // consistent across runs regardless of engine row-return order.
    const termRows: Array<{ taxonomy: string; label: string }> = await this.db
      .select({
        taxonomy: this.schema.terms.taxonomy,
        label: this.schema.terms.label,
      })
      .from(this.schema.term_relationships)
      .innerJoin(
        this.schema.terms,
        eq(this.schema.term_relationships.term_id, this.schema.terms.id)
      )
      .where(eq(this.schema.term_relationships.content_id, r.id))
      .orderBy(asc(this.schema.terms.label), asc(this.schema.terms.id));

    const tags = termRows
      .filter((t) => t.taxonomy === "tag")
      .map((t) => t.label);
    const categories = termRows
      .filter((t) => t.taxonomy === "category")
      .map((t) => t.label);

    // Fetch SEO meta rows
    const metaRows: Array<{ meta_key: string; meta_value: string | null }> =
      await this.db
        .select({
          meta_key: this.schema.content_meta.meta_key,
          meta_value: this.schema.content_meta.meta_value,
        })
        .from(this.schema.content_meta)
        .where(
          and(
            eq(this.schema.content_meta.content_id, r.id),
            like(this.schema.content_meta.meta_key, "seo.%")
          )
        );

    const seo = reassembleSeo(metaRows);

    // Reconstruct known fields into a plain record.
    // DB-vs-FS note (ADR-7): the DB has no arbitrary extra keys. rawData and
    // frontmatter carry identical content (the known schema fields only). This
    // differs from the FS adapter where rawData may include author-added keys.
    const data: Record<string, unknown> = {
      title: r.title,
      // published_at is epoch milliseconds → YYYY-MM-DD
      date: fromEpoch(r.published_at).toISOString().slice(0, 10),
      status: r.status,
      tags,
      categories,
      slug: r.slug,
      comments: fromBool01(r.comments_enabled),
      sticky: fromBool01(r.sticky),
      // visibility: omit when "public" to match FS oracle (FIX 1 — shape parity).
      // FS writer uses serializeKnownFrontmatter which skips `visibility` when "public",
      // so readRaw on a public FS post returns frontmatter WITHOUT a visibility key.
      // Callers normalize via: (raw.frontmatter.visibility ?? "public")
    };

    const storedVisibility = r.visibility ?? "public";
    if (storedVisibility !== "public") data.visibility = storedVisibility;
    if (r.excerpt !== null) data.excerpt = r.excerpt;
    if (r.cover_image !== null) data.coverImage = r.cover_image;
    if (r.author_label !== null) data.author = r.author_label;
    if (r.author_id !== null) data.authorId = r.author_id;
    if (r.visibility === "password" && r.password !== null)
      data.password = r.password;
    if (seo !== undefined) data.seo = seo;

    return {
      frontmatter: data,
      rawData: data, // same object — DB has no extra keys
      body: r.body_markdown,
    };
  }

  async setPostStatus(
    slug: string,
    status: "published" | "draft"
  ): Promise<WriteResult> {
    // Select the full post row upfront — all fields needed to build the revision fm.
    const rows: Array<{
      id: string;
      title: string;
      body_markdown: string;
      excerpt: string | null;
      cover_image: string | null;
      author_label: string | null;
      author_id: string | null;
      sticky: number;
      comments_enabled: number;
      visibility: string;
      password: string | null;
      published_at: number;
    }> = await this.db
      .select({
        id: this.schema.content.id,
        title: this.schema.content.title,
        body_markdown: this.schema.content.body_markdown,
        excerpt: this.schema.content.excerpt,
        cover_image: this.schema.content.cover_image,
        author_label: this.schema.content.author_label,
        author_id: this.schema.content.author_id,
        sticky: this.schema.content.sticky,
        comments_enabled: this.schema.content.comments_enabled,
        visibility: this.schema.content.visibility,
        password: this.schema.content.password,
        published_at: this.schema.content.published_at,
      })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "post"),
          eq(this.schema.content.slug, slug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return { ok: false, error: { kind: "post_not_found", slug } };
    }

    const r = rows[0];
    const now = nowEpoch();
    // Single-statement write, wrapped for a uniform atomic boundary.
    await withTransaction(this.db, async (tx: Executor) => {
      await tx
        .update(this.schema.content)
        .set({ status, updated_at: now })
        .where(eq(this.schema.content.id, r.id));
    });

    // Build serialized markdown for revision capture — mirrors FsContentWriter.setPostStatus
    // which does: mergedData = { ...existing.rawData, status }; captureRevision(rawContent).
    // Fetch terms and SEO to reconstruct the full fm for the new-status revision.
    // ORDER BY label ASC, id ASC for a stable, deterministic tag/category order so that
    // the serialized frontmatter is reproducible across runs (root cause of the flaky
    // cross-writer parity test: non-deterministic row order in term_relationships join).
    const termRows: Array<{ taxonomy: string; label: string }> = await this.db
      .select({
        taxonomy: this.schema.terms.taxonomy,
        label: this.schema.terms.label,
      })
      .from(this.schema.term_relationships)
      .innerJoin(
        this.schema.terms,
        eq(this.schema.term_relationships.term_id, this.schema.terms.id)
      )
      .where(eq(this.schema.term_relationships.content_id, r.id))
      .orderBy(asc(this.schema.terms.label), asc(this.schema.terms.id));

    const tags = termRows
      .filter((t) => t.taxonomy === "tag")
      .map((t) => t.label);
    const categories = termRows
      .filter((t) => t.taxonomy === "category")
      .map((t) => t.label);

    const metaRows: Array<{ meta_key: string; meta_value: string | null }> =
      await this.db
        .select({
          meta_key: this.schema.content_meta.meta_key,
          meta_value: this.schema.content_meta.meta_value,
        })
        .from(this.schema.content_meta)
        .where(
          and(
            eq(this.schema.content_meta.content_id, r.id),
            like(this.schema.content_meta.meta_key, "seo.%")
          )
        );
    const seo = reassembleSeo(metaRows);

    // Slug is pinned only when it differs from the title-derived slug — same logic
    // as createPost, so the serialized fm matches what FS would produce from readRaw.
    const inferredFromTitle = slugifyTitle(r.title);
    const needsExplicitSlug = slug !== inferredFromTitle;
    const storedVisibility = r.visibility ?? "public";
    const fm: SerializableFrontmatter = {
      title: r.title,
      ...(needsExplicitSlug ? { slug } : {}),
      date: fromEpoch(r.published_at).toISOString().slice(0, 10),
      status,
      ...(r.excerpt ? { excerpt: r.excerpt } : {}),
      ...(r.cover_image ? { coverImage: r.cover_image } : {}),
      tags,
      categories,
      comments: fromBool01(r.comments_enabled),
      ...(r.author_label ? { author: r.author_label } : {}),
      ...(fromBool01(r.sticky) ? { sticky: true } : {}),
      ...(r.author_id ? { authorId: r.author_id } : {}),
      ...(storedVisibility !== "public"
        ? { visibility: storedVisibility as "private" | "password" }
        : {}),
      ...(storedVisibility === "password" && r.password
        ? { password: r.password }
        : {}),
      ...(cleanSeo(seo) ? { seo: cleanSeo(seo) } : {}),
    };
    // Prepend "\n" to the body to match gray-matter's content field:
    // gray-matter returns the blank-line separator as part of the body (i.e.
    // "\n" + body_markdown), so re-serializing with just body_markdown would produce
    // one fewer blank line than the FS writer produces after a readRaw round-trip.
    const rawContent = serializePostMarkdown(fm, "\n" + r.body_markdown);

    // Best-effort revision capture — AFTER the UPDATE succeeds; failures swallowed.
    await this.captureRevision("post", slug, rawContent, undefined);

    return { ok: true, slug };
  }

  // ------------------------------------------------------------------
  // Trash operations — Phase 5 Slice C
  // ------------------------------------------------------------------

  /**
   * Move a LIVE post to the trash by setting deleted_at.
   * Returns post_not_found when no live post with that slug exists.
   * term_relationships and content_meta are LEFT INTACT so restore
   * brings them back. Reconciles term counts (trashed post no longer live).
   */
  async trashPost(slug: string): Promise<WriteResult> {
    // Find the live row
    const rows: Array<{ id: string }> = await this.db
      .select({ id: this.schema.content.id })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "post"),
          eq(this.schema.content.slug, slug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return { ok: false, error: { kind: "post_not_found", slug } };
    }

    const contentId = rows[0].id;
    const now = nowEpoch();

    // Atomic: the deleted_at UPDATE and the dependent count reconciliation (which
    // must observe the in-transaction trashed state) roll back together.
    await withTransaction(this.db, async (tx: Executor) => {
      await tx
        .update(this.schema.content)
        .set({ deleted_at: now, updated_at: now })
        .where(eq(this.schema.content.id, contentId));

      // Reconcile term counts — trashed post no longer counts as live
      const termRels: Array<{ term_id: string }> = await tx
        .select({ term_id: this.schema.term_relationships.term_id })
        .from(this.schema.term_relationships)
        .where(eq(this.schema.term_relationships.content_id, contentId));
      await this.reconcileTermCounts(tx, termRels.map((r) => r.term_id));
    });

    return { ok: true, slug };
  }

  /**
   * List all trashed posts (deleted_at IS NOT NULL).
   * Returns TrashedItemInfo[] sorted by published_at DESC, slug ASC for determinism.
   * date field is YYYY-MM-DD derived from published_at epoch milliseconds.
   */
  async listTrashedPosts(): Promise<TrashedItemInfo[]> {
    const rows: Array<{
      slug: string;
      title: string;
      published_at: number;
    }> = await this.db
      .select({
        slug: this.schema.content.slug,
        title: this.schema.content.title,
        published_at: this.schema.content.published_at,
      })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "post"),
          isNotNull(this.schema.content.deleted_at)
        )
      )
      .orderBy(
        desc(this.schema.content.published_at),
        asc(this.schema.content.slug)
      );

    return rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      date: fromEpoch(r.published_at).toISOString().slice(0, 10),
    }));
  }

  /**
   * Restore a trashed post by clearing deleted_at.
   * Returns post_not_found when no trashed post with that slug exists.
   * Checks for a live slug collision before restoring (mirrors FS behavior:
   * FS checks whether live/{slug}.md exists before moving from trash).
   * Reconciles term counts on success (restored post is now live again).
   */
  async restorePost(slug: string): Promise<WriteResult> {
    // Find the trashed row
    const trashedRows: Array<{ id: string }> = await this.db
      .select({ id: this.schema.content.id })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "post"),
          eq(this.schema.content.slug, slug),
          isNotNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (trashedRows.length === 0) {
      return { ok: false, error: { kind: "post_not_found", slug } };
    }

    // Check for a live collision (another live row owns this slug)
    const liveRows: Array<{ id: string }> = await this.db
      .select({ id: this.schema.content.id })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "post"),
          eq(this.schema.content.slug, slug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (liveRows.length > 0) {
      return { ok: false, error: { kind: "slug_collision", slug } };
    }

    const contentId = trashedRows[0].id;
    const now = nowEpoch();

    // Atomic: the deleted_at clear and the dependent count reconciliation (which
    // must observe the in-transaction live state) roll back together.
    await withTransaction(this.db, async (tx: Executor) => {
      await tx
        .update(this.schema.content)
        .set({ deleted_at: null, updated_at: now })
        .where(eq(this.schema.content.id, contentId));

      // Reconcile term counts — restored post is now live
      const termRels: Array<{ term_id: string }> = await tx
        .select({ term_id: this.schema.term_relationships.term_id })
        .from(this.schema.term_relationships)
        .where(eq(this.schema.term_relationships.content_id, contentId));
      await this.reconcileTermCounts(tx, termRels.map((r) => r.term_id));
    });

    return { ok: true, slug };
  }

  /**
   * Permanently hard-delete a trashed post.
   * Graceful when the slug is not in the trash (ok:true, mirrors FS ENOENT).
   * Cascades: deletes term_relationships + content_meta before the content row.
   * Reconciles term counts for freed terms.
   */
  async permanentlyDeletePost(slug: string): Promise<WriteResult> {
    // Find the trashed row
    const rows: Array<{ id: string }> = await this.db
      .select({ id: this.schema.content.id })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "post"),
          eq(this.schema.content.slug, slug),
          isNotNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      // Graceful: not in trash
      return { ok: true, slug };
    }

    const contentId = rows[0].id;

    // Collect affected term IDs before cascade delete
    const termRels: Array<{ term_id: string }> = await this.db
      .select({ term_id: this.schema.term_relationships.term_id })
      .from(this.schema.term_relationships)
      .where(eq(this.schema.term_relationships.content_id, contentId));
    const affectedTermIds = termRels.map((r) => r.term_id);

    // Atomic cascade: term_relationships → content_meta → content + count
    // reconciliation roll back together on failure.
    await withTransaction(this.db, async (tx: Executor) => {
      await tx
        .delete(this.schema.term_relationships)
        .where(eq(this.schema.term_relationships.content_id, contentId));

      await tx
        .delete(this.schema.content_meta)
        .where(eq(this.schema.content_meta.content_id, contentId));

      await tx
        .delete(this.schema.content)
        .where(eq(this.schema.content.id, contentId));

      // Reconcile term counts for freed terms
      await this.reconcileTermCounts(tx, affectedTermIds);
    });

    return { ok: true, slug };
  }
}
