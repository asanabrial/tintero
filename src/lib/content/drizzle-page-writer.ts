/**
 * DrizzlePageWriter — write-side DB adapter for pages.
 *
 * Implements PageWriter using an injected drizzle instance + schema bundle.
 * Schema-agnostic: both schema.sqlite.ts and schema.pg.ts are accepted.
 *
 * Slice scope (Phase 5 Slice B2):
 *   - CRUD core: createPage / updatePage / deletePage / readRawPage / setPageStatus
 *   - Trash operations: NOT implemented (throw "Phase 5 Slice C")
 *
 * Mirrors DrizzleContentWriter structure. Key differences from the post writer:
 *   - Pages have NO tags/categories/term_relationships — those are post-only.
 *   - Pages have parent_id (UUID FK → another page row) and menu_order.
 *   - Neutral values for post-only columns stored verbatim:
 *       visibility="public", sticky=0, comments_enabled=0,
 *       author_label=null, author_id=null, cover_image=null, password=null.
 *
 * Parent slug handling (createPage / updatePage):
 *   If input.parent is provided, we look up the live page with that slug and
 *   store its UUID in parent_id. If the parent slug is NOT found (e.g. not yet
 *   created, or typo), parent_id is stored as null.
 *   This is a deliberate divergence from FsPageWriter, which writes the slug
 *   string to the file regardless of whether the parent page exists. The DB
 *   cannot safely store a dangling UUID FK, so we normalize to null.
 *
 * Atomicity decision:
 *   Sequential writes (no transaction), consistent with DrizzleContentWriter
 *   and backfill.ts. A mid-write failure can leave the DB partially written.
 *   Acceptable for a low-frequency blog writer.
 *
 * readRawPage shape:
 *   Returns { frontmatter, rawData, body } where both frontmatter and rawData
 *   carry the same reconstructed object (no extra keys exist in DB, unlike FS).
 *   Fields follow the FS oracle shape to maintain parity:
 *     - status omitted when "published" (FS omits it as the default)
 *     - parent omitted when null
 *     - excerpt omitted when null
 *     - menu_order omitted when 0 (FS omits it as the default)
 *     - seo included when present
 */

import { and, asc, desc, eq, inArray, isNotNull, isNull, like, ne } from "drizzle-orm";
import { PageFrontmatterSchema } from "./schema";
import { isSafeSlug, resolveCollisionSlug, slugifyTitle } from "./slug";
import { newId, nowEpoch, toEpoch, fromEpoch } from "./db-values";
import { SEO_FIELDS, seoMetaKey, seoMetaValue, reassembleSeo } from "./seo-meta";
import { cleanSeo } from "./fs-writer";
import {
  serializePageMarkdown,
  type PageSerializableFrontmatter,
} from "./markdown-serialize";
import type {
  PageWriter,
  CreatePageInput,
  UpdatePageInput,
  WriteResult,
  TrashedItemInfo,
} from "./ports";
import type { PostSeo } from "./types";
import type { RevisionContext } from "../revisions/types";
import type { RevisionRepository } from "../revisions/ports";
import { getRevisionRepository } from "../revisions/factory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDb = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleContentSchema = Record<string, any>;

export class DrizzlePageWriter implements PageWriter {
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
   * Best-effort revision capture — mirrors FsPageWriter.captureRevision.
   * Called AFTER the atomic write succeeds. DB failures are swallowed.
   */
  private async captureRevision(
    slug: string,
    rawContent: string,
    rev?: RevisionContext
  ): Promise<void> {
    try {
      await this.revisions().record({
        contentType: "page",
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
   * Return the set of slugs for all LIVE (non-trashed) pages.
   * Used by createPage for collision resolution.
   */
  private async getLivePageSlugs(): Promise<Set<string>> {
    const rows: Array<{ slug: string }> = await this.db
      .select({ slug: this.schema.content.slug })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "page"),
          isNull(this.schema.content.deleted_at)
        )
      );
    return new Set(rows.map((r) => r.slug));
  }

  /**
   * Resolve a parent page slug to its content UUID.
   *
   * Looks up the live page row with the given slug. Returns null when:
   *   - parentSlug is undefined/empty
   *   - no live page with that slug exists (not-yet-created parent,
   *     or slug typo — documented divergence from FsPageWriter which
   *     writes the slug string regardless of whether the parent exists)
   */
  private async resolveParentId(
    parentSlug: string | undefined
  ): Promise<string | null> {
    if (!parentSlug) return null;
    const rows: Array<{ id: string }> = await this.db
      .select({ id: this.schema.content.id })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "page"),
          eq(this.schema.content.slug, parentSlug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);
    return rows.length > 0 ? rows[0].id : null;
  }

  /**
   * Resolve a set of content UUIDs to their page slugs.
   * Mirrors resolveIdsToSlugs in DrizzleContentAdapter.
   * Used by readRawPage to convert parent_id UUID → parent slug string.
   */
  private async resolveIdsToSlugs(ids: Set<string>): Promise<Map<string, string>> {
    if (ids.size === 0) return new Map();
    const rows: Array<{ id: string; slug: string }> = await this.db
      .select({
        id: this.schema.content.id,
        slug: this.schema.content.slug,
      })
      .from(this.schema.content)
      .where(inArray(this.schema.content.id, [...ids]));
    return new Map(rows.map((r) => [r.id, r.slug]));
  }

  /**
   * Insert SEO content_meta rows for a new page row.
   * Uses onConflictDoUpdate so callers may re-use it idempotently.
   * Mirrors DrizzleContentWriter.insertSeoMeta exactly.
   */
  private async insertSeoMeta(
    contentId: string,
    seo: PostSeo | undefined
  ): Promise<void> {
    const cleaned = cleanSeo(seo);
    if (!cleaned) return;

    for (const field of SEO_FIELDS) {
      const value = cleaned[field];
      if (value === undefined) continue;
      const id = newId();
      await this.db
        .insert(this.schema.content_meta)
        .values({
          id,
          content_id: contentId,
          meta_key: seoMetaKey(field),
          meta_value: seoMetaValue(value),
        })
        .onConflictDoUpdate({
          target: [
            this.schema.content_meta.content_id,
            this.schema.content_meta.meta_key,
          ],
          set: { meta_value: seoMetaValue(value) },
        });
    }
  }

  /**
   * Replace all SEO content_meta rows for a page.
   * Strategy: DELETE all existing seo.* rows, then re-insert the new set.
   * Mirrors DrizzleContentWriter.updateSeoMeta exactly.
   */
  private async updateSeoMeta(
    contentId: string,
    seo: PostSeo | undefined
  ): Promise<void> {
    // Step 1: delete all existing seo rows for this content
    await this.db
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
      await this.db.insert(this.schema.content_meta).values({
        id,
        content_id: contentId,
        meta_key: seoMetaKey(field),
        meta_value: seoMetaValue(value),
      });
    }
  }

  // ------------------------------------------------------------------
  // PageWriter — CRUD core
  // ------------------------------------------------------------------

  async createPage(
    input: CreatePageInput,
    rev?: RevisionContext
  ): Promise<WriteResult> {
    // Validate explicit slug before anything else — mirrors FsPageWriter order.
    if (input.slug?.trim()) {
      if (!isSafeSlug(input.slug.trim())) {
        return {
          ok: false,
          error: { kind: "invalid_slug", slug: input.slug.trim() },
        };
      }
    }

    // Validate frontmatter (title, date, status, excerpt, parent, menu_order, seo).
    const parseResult = PageFrontmatterSchema.safeParse({
      title: input.title,
      date: input.date,
      status: input.status,
      excerpt: input.excerpt,
      slug: input.slug,
      parent: input.parent,
      menu_order: input.menuOrder,
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

    // Auto-resolve collision against LIVE pages
    const existingSlugs = await this.getLivePageSlugs();
    const finalSlug = resolveCollisionSlug(rawDesired, existingSlugs);

    // Resolve parent slug → UUID (null when parent not found — documented divergence)
    const parentId = await this.resolveParentId(parseResult.data.parent);

    const now = nowEpoch();
    const contentId = newId();

    // Insert content row (sequential write — see atomicity note in module header)
    // Post-only columns are set to their neutral values:
    //   visibility="public", sticky=0, comments_enabled=0,
    //   author_label=null, author_id=null, cover_image=null, password=null
    await this.db.insert(this.schema.content).values({
      id: contentId,
      type: "page",
      slug: finalSlug,
      title: parseResult.data.title,
      status: parseResult.data.status,
      visibility: "public",
      password: null,
      body_markdown: input.body,
      excerpt: parseResult.data.excerpt ?? null,
      cover_image: null,
      author_label: null,
      author_id: null,
      sticky: 0,
      comments_enabled: 0,
      parent_id: parentId,
      menu_order: parseResult.data.menu_order,
      published_at: toEpoch(parseResult.data.date),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });

    // Write SEO content_meta rows
    await this.insertSeoMeta(contentId, parseResult.data.seo);

    // Build the full serialized markdown for revision capture — mirrors FsPageWriter.createPage.
    // Slug is pinned in frontmatter only when it differs from the title-derived slug.
    // status is omitted when "published" (the default for pages); menu_order omitted when 0.
    const inferredFromTitle = slugifyTitle(parseResult.data.title);
    const needsExplicitSlug = finalSlug !== inferredFromTitle;
    const pageFm: PageSerializableFrontmatter = {
      title: parseResult.data.title,
      ...(needsExplicitSlug ? { slug: finalSlug } : {}),
      date: parseResult.data.date,
      ...(parseResult.data.status === "draft" ? { status: "draft" as const } : {}),
      ...(parseResult.data.excerpt ? { excerpt: parseResult.data.excerpt } : {}),
      ...(parseResult.data.parent ? { parent: parseResult.data.parent } : {}),
      ...(parseResult.data.menu_order !== 0 ? { menu_order: parseResult.data.menu_order } : {}),
      ...(cleanSeo(parseResult.data.seo) ? { seo: cleanSeo(parseResult.data.seo) } : {}),
    };
    const pageRawContent = serializePageMarkdown(pageFm, input.body);

    // Best-effort revision capture — AFTER the write succeeds; failures swallowed.
    await this.captureRevision(finalSlug, pageRawContent, rev);

    return { ok: true, slug: finalSlug };
  }

  async updatePage(
    currentSlug: string,
    input: UpdatePageInput,
    rev?: RevisionContext
  ): Promise<WriteResult> {
    // Locate existing live page
    const existingRows: Array<{ id: string; slug: string }> = await this.db
      .select({
        id: this.schema.content.id,
        slug: this.schema.content.slug,
      })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "page"),
          eq(this.schema.content.slug, currentSlug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (existingRows.length === 0) {
      return {
        ok: false,
        error: { kind: "page_not_found", slug: currentSlug },
      };
    }

    const contentId = existingRows[0].id;

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
      // Hard-reject collision: another LIVE page (not the current row) already owns the new slug
      const collisionRows: Array<{ id: string }> = await this.db
        .select({ id: this.schema.content.id })
        .from(this.schema.content)
        .where(
          and(
            eq(this.schema.content.type, "page"),
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

    // Validate frontmatter
    const parseResult = PageFrontmatterSchema.safeParse({
      title: input.title,
      date: input.date,
      status: input.status,
      excerpt: input.excerpt,
      slug: input.slug,
      parent: input.parent,
      menu_order: input.menuOrder,
      seo: input.seo,
    });
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
        .join("; ");
      return { ok: false, error: { kind: "invalid_frontmatter", issues } };
    }

    // Resolve parent slug → UUID for the updated parent value
    const parentId = await this.resolveParentId(parseResult.data.parent);

    const now = nowEpoch();

    // UPDATE content row by ID — preserve created_at (via no-update), update updated_at
    await this.db
      .update(this.schema.content)
      .set({
        slug: newSlug,
        title: parseResult.data.title,
        status: parseResult.data.status,
        body_markdown: input.body,
        excerpt: parseResult.data.excerpt ?? null,
        parent_id: parentId,
        menu_order: parseResult.data.menu_order,
        published_at: toEpoch(parseResult.data.date),
        updated_at: now,
      })
      .where(eq(this.schema.content.id, contentId));

    // Replace SEO meta (delete old set, insert new set)
    await this.updateSeoMeta(contentId, parseResult.data.seo);

    // Build the full serialized markdown for revision capture — mirrors FsPageWriter.updatePage.
    // Slug is pinned only when it differs from the title-derived inferred slug.
    // status omitted when "published"; menu_order omitted when 0.
    const inferredFromUpdateTitle = slugifyTitle(input.title);
    const shouldPinSlugPage = newSlug !== inferredFromUpdateTitle;
    const updatePageFm: PageSerializableFrontmatter = {
      title: parseResult.data.title,
      ...(shouldPinSlugPage ? { slug: newSlug } : {}),
      date: parseResult.data.date,
      ...(parseResult.data.status === "draft" ? { status: "draft" as const } : {}),
      ...(parseResult.data.excerpt ? { excerpt: parseResult.data.excerpt } : {}),
      ...(parseResult.data.parent ? { parent: parseResult.data.parent } : {}),
      ...(parseResult.data.menu_order !== 0 ? { menu_order: parseResult.data.menu_order } : {}),
      ...(cleanSeo(parseResult.data.seo) ? { seo: cleanSeo(parseResult.data.seo) } : {}),
    };
    const updatePageRawContent = serializePageMarkdown(updatePageFm, input.body);

    // Best-effort revision — AFTER all writes succeed; failures swallowed.
    await this.captureRevision(newSlug, updatePageRawContent, rev);

    return { ok: true, slug: newSlug };
  }

  async deletePage(slug: string): Promise<WriteResult> {
    // Find the live page (graceful: absent → ok:true, mirrors FsPageWriter on ENOENT)
    const rows: Array<{ id: string }> = await this.db
      .select({ id: this.schema.content.id })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "page"),
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

    // Cascade: delete content_meta before the content row.
    // Pages never have term_relationships, but defensively delete any anyway.
    await this.db
      .delete(this.schema.content_meta)
      .where(eq(this.schema.content_meta.content_id, contentId));

    // Hard-delete the content row
    await this.db
      .delete(this.schema.content)
      .where(eq(this.schema.content.id, contentId));

    return { ok: true, slug };
  }

  async readRawPage(
    slug: string
  ): Promise<{
    frontmatter: Record<string, unknown>;
    rawData: Record<string, unknown>;
    body: string;
  } | null> {
    // Fetch the live page row
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
      .select({
        id: this.schema.content.id,
        slug: this.schema.content.slug,
        title: this.schema.content.title,
        status: this.schema.content.status,
        body_markdown: this.schema.content.body_markdown,
        excerpt: this.schema.content.excerpt,
        parent_id: this.schema.content.parent_id,
        menu_order: this.schema.content.menu_order,
        published_at: this.schema.content.published_at,
      })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "page"),
          eq(this.schema.content.slug, slug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (rows.length === 0) return null;
    const r = rows[0];

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

    // Resolve parent_id UUID → parent page slug (for readRawPage parity with FS)
    let parentSlug: string | undefined;
    if (r.parent_id) {
      const slugMap = await this.resolveIdsToSlugs(new Set([r.parent_id]));
      parentSlug = slugMap.get(r.parent_id);
    }

    // Reconstruct data following the FS oracle shape:
    //   - date as YYYY-MM-DD string (FS oracle returns a Date object from gray-matter;
    //     contract tests handle both via instanceof Date check)
    //   - status omitted when "published" (FS omits it as the default, so readRawPage
    //     on a published FS page returns frontmatter without a status key)
    //   - parent omitted when null
    //   - excerpt omitted when null
    //   - menu_order omitted when 0 (FS omits it as the default)
    //   - seo included when present
    const data: Record<string, unknown> = {
      title: r.title,
      date: fromEpoch(r.published_at).toISOString().slice(0, 10),
      slug: r.slug,
    };

    // Omit status when "published" to match FS oracle shape
    if (r.status !== "published") data.status = r.status;
    if (r.excerpt !== null) data.excerpt = r.excerpt;
    if (parentSlug !== undefined) data.parent = parentSlug;
    // Omit menu_order when 0 to match FS oracle shape
    if (r.menu_order !== 0) data.menu_order = r.menu_order;
    if (seo !== undefined) data.seo = seo;

    return {
      frontmatter: data,
      rawData: data, // same object — DB has no extra keys
      body: r.body_markdown,
    };
  }

  async setPageStatus(
    slug: string,
    status: "published" | "draft"
  ): Promise<WriteResult> {
    // Select the full page row upfront — all fields needed to build the revision fm.
    const rows: Array<{
      id: string;
      title: string;
      body_markdown: string;
      excerpt: string | null;
      parent_id: string | null;
      menu_order: number;
      published_at: number;
    }> = await this.db
      .select({
        id: this.schema.content.id,
        title: this.schema.content.title,
        body_markdown: this.schema.content.body_markdown,
        excerpt: this.schema.content.excerpt,
        parent_id: this.schema.content.parent_id,
        menu_order: this.schema.content.menu_order,
        published_at: this.schema.content.published_at,
      })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "page"),
          eq(this.schema.content.slug, slug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return { ok: false, error: { kind: "page_not_found", slug } };
    }

    const r = rows[0];
    const now = nowEpoch();
    await this.db
      .update(this.schema.content)
      .set({ status, updated_at: now })
      .where(eq(this.schema.content.id, r.id));

    // Build serialized markdown for revision capture — mirrors FsPageWriter.setPageStatus
    // which does: mergedData = { ...existing.rawData }; set/delete status; captureRevision.
    // Fetch SEO and resolve parent slug for the full fm reconstruction.
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

    // Resolve parent_id UUID → parent page slug (mirrors readRawPage which also resolves parent)
    let parentSlug: string | undefined;
    if (r.parent_id) {
      const slugMap = await this.resolveIdsToSlugs(new Set([r.parent_id]));
      parentSlug = slugMap.get(r.parent_id);
    }

    // Slug is pinned only when it differs from the title-derived slug — same logic
    // as createPage, so the serialized fm matches what FS would produce from readRawPage.
    // status is omitted when "published" (page convention); menu_order omitted when 0.
    const inferredFromTitle = slugifyTitle(r.title);
    const needsExplicitSlug = slug !== inferredFromTitle;
    const pageFm: PageSerializableFrontmatter = {
      title: r.title,
      ...(needsExplicitSlug ? { slug } : {}),
      date: fromEpoch(r.published_at).toISOString().slice(0, 10),
      ...(status === "draft" ? { status: "draft" as const } : {}),
      ...(r.excerpt ? { excerpt: r.excerpt } : {}),
      ...(parentSlug ? { parent: parentSlug } : {}),
      ...(r.menu_order !== 0 ? { menu_order: r.menu_order } : {}),
      ...(cleanSeo(seo) ? { seo: cleanSeo(seo) } : {}),
    };
    // Prepend "\n" to the body to match gray-matter's content field:
    // gray-matter returns the blank-line separator as part of the body (i.e.
    // "\n" + body_markdown), so re-serializing with just body_markdown would produce
    // one fewer blank line than the FS writer produces after a readRawPage round-trip.
    const rawContent = serializePageMarkdown(pageFm, "\n" + r.body_markdown);

    // Best-effort revision capture — AFTER the UPDATE succeeds; failures swallowed.
    await this.captureRevision(slug, rawContent, undefined);

    return { ok: true, slug };
  }

  // ------------------------------------------------------------------
  // Trash operations — Phase 5 Slice C
  // ------------------------------------------------------------------

  /**
   * Move a LIVE page to the trash by setting deleted_at.
   * Returns page_not_found when no live page with that slug exists.
   * content_meta rows are LEFT INTACT so restore brings them back.
   * Pages have no term_relationships — no count reconciliation needed.
   */
  async trashPage(slug: string): Promise<WriteResult> {
    const rows: Array<{ id: string }> = await this.db
      .select({ id: this.schema.content.id })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "page"),
          eq(this.schema.content.slug, slug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (rows.length === 0) {
      return { ok: false, error: { kind: "page_not_found", slug } };
    }

    const now = nowEpoch();
    await this.db
      .update(this.schema.content)
      .set({ deleted_at: now, updated_at: now })
      .where(eq(this.schema.content.id, rows[0].id));

    return { ok: true, slug };
  }

  /**
   * List all trashed pages (deleted_at IS NOT NULL).
   * Returns TrashedItemInfo[] sorted by published_at DESC, slug ASC for determinism.
   * date field is YYYY-MM-DD derived from published_at epoch milliseconds.
   */
  async listTrashedPages(): Promise<TrashedItemInfo[]> {
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
          eq(this.schema.content.type, "page"),
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
   * Restore a trashed page by clearing deleted_at.
   * Returns page_not_found when no trashed page with that slug exists.
   * Checks for a live slug collision before restoring (mirrors FS behavior).
   */
  async restorePage(slug: string): Promise<WriteResult> {
    // Find the trashed row
    const trashedRows: Array<{ id: string }> = await this.db
      .select({ id: this.schema.content.id })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "page"),
          eq(this.schema.content.slug, slug),
          isNotNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (trashedRows.length === 0) {
      return { ok: false, error: { kind: "page_not_found", slug } };
    }

    // Check for a live collision (another live row owns this slug)
    const liveRows: Array<{ id: string }> = await this.db
      .select({ id: this.schema.content.id })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "page"),
          eq(this.schema.content.slug, slug),
          isNull(this.schema.content.deleted_at)
        )
      )
      .limit(1);

    if (liveRows.length > 0) {
      return { ok: false, error: { kind: "slug_collision", slug } };
    }

    const now = nowEpoch();
    await this.db
      .update(this.schema.content)
      .set({ deleted_at: null, updated_at: now })
      .where(eq(this.schema.content.id, trashedRows[0].id));

    return { ok: true, slug };
  }

  /**
   * Permanently hard-delete a trashed page.
   * Graceful when the slug is not in the trash (ok:true, mirrors FS ENOENT).
   * Cascades: deletes content_meta before the content row.
   * Pages have no term_relationships.
   */
  async permanentlyDeletePage(slug: string): Promise<WriteResult> {
    // Find the trashed row
    const rows: Array<{ id: string }> = await this.db
      .select({ id: this.schema.content.id })
      .from(this.schema.content)
      .where(
        and(
          eq(this.schema.content.type, "page"),
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

    // Cascade: content_meta → content
    await this.db
      .delete(this.schema.content_meta)
      .where(eq(this.schema.content_meta.content_id, contentId));

    await this.db
      .delete(this.schema.content)
      .where(eq(this.schema.content.id, contentId));

    return { ok: true, slug };
  }
}
