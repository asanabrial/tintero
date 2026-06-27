// FsPageWriter — write-side FS adapter for pages.
// IMPORTANT: NO imports from 'next/cache' or 'next/headers'.
// Cache invalidation is the Server Action layer's responsibility (ADR-4).
// NO 'use cache' directive anywhere in this file.

import * as fs from "fs/promises";
import * as path from "path";
import matter from "gray-matter";
import { cleanSeo } from "./fs-writer";
import {
  serializePageMarkdown,
  type PageSerializableFrontmatter,
} from "./markdown-serialize";
import { deriveSlug, isSafeSlug, resolveCollisionSlug, slugifyTitle } from "./slug";
import { PageFrontmatterSchema } from "./schema";
import type { PageWriter, CreatePageInput, UpdatePageInput, WriteResult, TrashedItemInfo } from "./ports";
import type { RevisionContext } from "../revisions/types";
import type { RevisionRepository } from "../revisions/ports";
import { getRevisionRepository } from "../revisions/factory";

// Re-export types so existing consumers keep working without import changes.
export type { PageSerializableFrontmatter };

// ============================================================
// Page-shaped serialization helpers
// ============================================================

/**
 * Builds the full markdown file content for a page with YAML frontmatter.
 * Delegates to serializePageMarkdown from markdown-serialize.ts so FS and DB
 * writers produce byte-identical revision rawContent.
 * Key order: title, slug?, date, status?, excerpt?, parent?, menu_order?, seo?
 * Post-only keys (tags, categories, comments) are never emitted.
 * Format: ---\n{yaml}---\n\n{body trimmed}\n
 */
export function buildPageFileContent(fm: PageSerializableFrontmatter, body: string): string {
  return serializePageMarkdown(fm, body);
}

// ============================================================
// Path-traversal guard (scoped to pagesDir)
// ============================================================

/**
 * Resolves the absolute path for a slug within pagesDir and asserts
 * it stays inside pagesDir. Returns WriteResult invalid_slug if not.
 */
function resolvePagePath(
  pagesDir: string,
  slug: string
): { ok: true; filePath: string } | { ok: false; error: { kind: "invalid_slug"; slug: string } } {
  const abs = path.resolve(pagesDir, `${slug}.md`);
  const safe = path.resolve(pagesDir) + path.sep;
  if (!abs.startsWith(safe)) {
    return { ok: false, error: { kind: "invalid_slug", slug } };
  }
  return { ok: true, filePath: abs };
}

// ============================================================
// FsPageWriter
// ============================================================

export class FsPageWriter implements PageWriter {
  constructor(
    private readonly pagesDir: string,
    private readonly revisions: () => RevisionRepository = () => getRevisionRepository()
  ) {}

  /**
   * Best-effort revision capture. Called AFTER the atomic file write succeeds.
   * A DB failure MUST NEVER block the write — swallowed silently.
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
      // Best-effort: DB down / no DATABASE_URL / factory throw — swallow, never re-throw
    }
  }

  /**
   * Reads the raw frontmatter and body for a page matching the given slug.
   * Scans the pagesDir for a file whose deriveSlug matches.
   * Returns null if not found.
   */
  async readRawPage(
    slug: string
  ): Promise<{ frontmatter: Record<string, unknown>; rawData: Record<string, unknown>; body: string } | null> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.pagesDir);
    } catch {
      return null;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      if (entry.startsWith(".")) continue;

      const fullPath = path.join(this.pagesDir, entry);
      let raw: string;
      try {
        raw = await fs.readFile(fullPath, "utf-8");
      } catch {
        continue;
      }

      const { data, content } = matter(raw);
      const derivedSlug = deriveSlug(entry, data.slug as string | undefined);
      if (derivedSlug !== slug) continue;

      return {
        frontmatter: data as Record<string, unknown>,
        rawData: data as Record<string, unknown>,
        body: content,
      };
    }

    return null;
  }

  async createPage(input: CreatePageInput, rev?: RevisionContext): Promise<WriteResult> {
    // If an explicit slug is provided by the user, validate the RAW value first
    if (input.slug?.trim()) {
      if (!isSafeSlug(input.slug.trim())) {
        return { ok: false, error: { kind: "invalid_slug", slug: input.slug.trim() } };
      }
    }

    // Validate frontmatter BEFORE slug derivation so empty title returns invalid_frontmatter
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

    // Determine desired slug (after frontmatter validation succeeds)
    const rawDesired = input.slug?.trim()
      ? slugifyTitle(input.slug.trim())
      : slugifyTitle(input.title);

    // Validate derived slug charset
    if (rawDesired === "" || !isSafeSlug(rawDesired)) {
      return { ok: false, error: { kind: "invalid_slug", slug: rawDesired } };
    }

    // Path-traversal guard (belt-and-suspenders after charset validation)
    const pathCheck = resolvePagePath(this.pagesDir, rawDesired);
    if (!pathCheck.ok) return pathCheck;

    // Gather existing slugs for collision resolution
    const existingSlugs = await this.getExistingSlugs();
    const finalSlug = resolveCollisionSlug(rawDesired, existingSlugs);

    // Only pin slug when it differs from what deriveSlug would infer from the filename
    const inferredFromFilename = slugifyTitle(input.title);
    const needsExplicitSlug = finalSlug !== inferredFromFilename;

    const fm: PageSerializableFrontmatter = {
      title: parseResult.data.title,
      ...(needsExplicitSlug ? { slug: finalSlug } : {}),
      date: parseResult.data.date,
      // Only write status when it is draft (omit when published — it is the default)
      ...(parseResult.data.status === "draft" ? { status: "draft" as const } : {}),
      ...(parseResult.data.excerpt ? { excerpt: parseResult.data.excerpt } : {}),
      // Only write parent when truthy
      ...(parseResult.data.parent ? { parent: parseResult.data.parent } : {}),
      // Only write menu_order when non-zero
      ...(parseResult.data.menu_order !== 0 ? { menu_order: parseResult.data.menu_order } : {}),
      ...(cleanSeo(parseResult.data.seo) ? { seo: cleanSeo(parseResult.data.seo) } : {}),
    };

    const content = buildPageFileContent(fm, input.body);

    const finalPath = path.join(this.pagesDir, `${finalSlug}.md`);
    const tmpPath = path.join(this.pagesDir, `.${finalSlug}.tmp`);

    try {
      await fs.writeFile(tmpPath, content, "utf-8");
      await fs.rename(tmpPath, finalPath);
    } catch (err) {
      try { await fs.unlink(tmpPath); } catch { /* ignore cleanup error */ }
      throw err;
    }

    // Best-effort revision capture — AFTER the file write succeeds; failures swallowed.
    await this.captureRevision("page", finalSlug, content, rev);

    return { ok: true, slug: finalSlug };
  }

  async updatePage(currentSlug: string, input: UpdatePageInput, rev?: RevisionContext): Promise<WriteResult> {
    // Validate current slug
    if (!isSafeSlug(currentSlug)) {
      return { ok: false, error: { kind: "invalid_slug", slug: currentSlug } };
    }
    const currentPathCheck = resolvePagePath(this.pagesDir, currentSlug);
    if (!currentPathCheck.ok) return currentPathCheck;

    // Read existing file (for ADR-7 extra-key preservation)
    const existing = await this.readRawPage(currentSlug);
    if (!existing) {
      return { ok: false, error: { kind: "page_not_found", slug: currentSlug } };
    }

    // Determine new slug
    const desiredNewSlug = input.slug?.trim()
      ? slugifyTitle(input.slug)
      : currentSlug;

    const slugChanged = desiredNewSlug !== currentSlug;

    if (slugChanged) {
      // Validate new slug
      if (!isSafeSlug(desiredNewSlug)) {
        return { ok: false, error: { kind: "invalid_slug", slug: desiredNewSlug } };
      }
      const newPathCheck = resolvePagePath(this.pagesDir, desiredNewSlug);
      if (!newPathCheck.ok) return newPathCheck;

      // Collision check: exclude the current slug from the existing set (hard-reject)
      const existingSlugs = await this.getExistingSlugs();
      existingSlugs.delete(currentSlug);
      if (existingSlugs.has(desiredNewSlug)) {
        return { ok: false, error: { kind: "slug_collision", slug: desiredNewSlug } };
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

    // ADR-7: merge validated known fields over a shallow copy of the raw data
    // so unknown author-added frontmatter keys survive the update.
    const mergedData: PageSerializableFrontmatter = {
      ...existing.rawData,
      title: parseResult.data.title,
      date: parseResult.data.date,
    };

    // Handle status: only keep draft explicitly; omit published (the default)
    if (parseResult.data.status === "draft") {
      mergedData.status = "draft";
    } else {
      delete mergedData.status;
    }

    // Handle excerpt: set or remove
    if (parseResult.data.excerpt) {
      mergedData.excerpt = parseResult.data.excerpt;
    } else {
      delete mergedData.excerpt;
    }

    // Handle parent: set when truthy, remove when absent
    if (parseResult.data.parent) {
      mergedData.parent = parseResult.data.parent;
    } else {
      delete mergedData.parent;
    }

    // Handle menu_order: set when non-zero, remove when 0 (the default)
    if (parseResult.data.menu_order !== 0) {
      mergedData.menu_order = parseResult.data.menu_order;
    } else {
      delete mergedData.menu_order;
    }

    // Handle SEO overrides: set when any non-empty field remains, else remove.
    const cleanedSeo = cleanSeo(parseResult.data.seo);
    if (cleanedSeo) {
      mergedData.seo = cleanedSeo;
    } else {
      delete mergedData.seo;
    }

    // On slug change: write explicit slug frontmatter to pin the permalink
    if (slugChanged) {
      mergedData.slug = newSlug;
    }
    // If slug unchanged: preserve existing slug field behavior from rawData spread

    // Spec requirement: page serializer MUST NOT emit post-only keys, even if the
    // file was manually edited to include them (ADR-7 preserves unknown keys, but
    // these three are categorically forbidden in page files — status is now a PAGE field).
    delete (mergedData as Record<string, unknown>).tags;
    delete (mergedData as Record<string, unknown>).categories;
    delete (mergedData as Record<string, unknown>).comments;

    const content = buildPageFileContent(mergedData, input.body);
    const finalPath = path.join(this.pagesDir, `${newSlug}.md`);
    const tmpPath = path.join(this.pagesDir, `.${newSlug}.tmp`);

    try {
      await fs.writeFile(tmpPath, content, "utf-8");
      await fs.rename(tmpPath, finalPath);
    } catch (err) {
      try { await fs.unlink(tmpPath); } catch { /* ignore cleanup error */ }
      throw err;
    }

    // If slug changed, remove the old file
    if (slugChanged) {
      const oldPath = path.join(this.pagesDir, `${currentSlug}.md`);
      try {
        await fs.unlink(oldPath);
      } catch {
        // If the old file doesn't exist (shouldn't happen), ignore
      }
    }

    // Best-effort revision capture — AFTER the file write + optional old-file removal; failures swallowed.
    await this.captureRevision("page", newSlug, content, rev);

    return { ok: true, slug: newSlug };
  }

  async deletePage(slug: string): Promise<WriteResult> {
    // Validate slug
    if (!isSafeSlug(slug)) {
      return { ok: false, error: { kind: "invalid_slug", slug } };
    }
    const pathCheck = resolvePagePath(this.pagesDir, slug);
    if (!pathCheck.ok) return pathCheck;

    const filePath = pathCheck.filePath;
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // Graceful: file already gone
        return { ok: true, slug };
      }
      throw err;
    }

    return { ok: true, slug };
  }

  async setPageStatus(slug: string, status: "published" | "draft"): Promise<WriteResult> {
    if (!isSafeSlug(slug)) {
      return { ok: false, error: { kind: "invalid_slug", slug } };
    }
    const abs = path.resolve(this.pagesDir, `${slug}.md`);
    const safe = path.resolve(this.pagesDir) + path.sep;
    if (!abs.startsWith(safe)) {
      return { ok: false, error: { kind: "invalid_slug", slug } };
    }

    const existing = await this.readRawPage(slug);
    if (!existing) {
      return { ok: false, error: { kind: "page_not_found", slug } };
    }

    const mergedData = { ...existing.rawData } as PageSerializableFrontmatter;
    if (status === "draft") {
      mergedData.status = "draft";
    } else {
      delete mergedData.status;
    }

    // Page invariant: never emit post-only keys
    delete (mergedData as Record<string, unknown>).tags;
    delete (mergedData as Record<string, unknown>).categories;
    delete (mergedData as Record<string, unknown>).comments;

    const content = buildPageFileContent(mergedData, existing.body);

    const finalPath = path.join(this.pagesDir, `${slug}.md`);
    const tmpPath = path.join(this.pagesDir, `.${slug}.tmp`);

    try {
      await fs.writeFile(tmpPath, content, "utf-8");
      await fs.rename(tmpPath, finalPath);
    } catch (err) {
      try { await fs.unlink(tmpPath); } catch { /* ignore */ }
      throw err;
    }

    await this.captureRevision("page", slug, content, undefined);
    return { ok: true, slug };
  }

  // ============================================================
  // Trash (soft-delete) — WordPress Trash parity
  // ============================================================

  private get trashDir(): string {
    return path.join(path.dirname(this.pagesDir), ".trash", "pages");
  }

  async trashPage(slug: string): Promise<WriteResult> {
    if (!isSafeSlug(slug)) {
      return { ok: false, error: { kind: "invalid_slug", slug } };
    }
    const pathCheck = resolvePagePath(this.pagesDir, slug);
    if (!pathCheck.ok) return pathCheck;

    await fs.mkdir(this.trashDir, { recursive: true });

    const livePath = pathCheck.filePath;
    const trashPath = path.join(this.trashDir, `${slug}.md`);
    try {
      await fs.rename(livePath, trashPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { ok: false, error: { kind: "page_not_found", slug } };
      }
      throw err;
    }
    return { ok: true, slug };
  }

  async listTrashedPages(): Promise<TrashedItemInfo[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.trashDir);
    } catch {
      return [];
    }

    const items: TrashedItemInfo[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      if (entry.startsWith(".")) continue;

      const fullPath = path.join(this.trashDir, entry);
      try {
        const raw = await fs.readFile(fullPath, "utf-8");
        const { data } = matter(raw);
        const slug = deriveSlug(entry, data.slug as string | undefined);
        items.push({
          slug,
          title: typeof data.title === "string" ? data.title : slug,
          date: typeof data.date === "string" ? data.date : (data.date instanceof Date ? data.date.toISOString().slice(0, 10) : ""),
        });
      } catch {
        // Skip unreadable files
      }
    }
    return items;
  }

  async restorePage(slug: string): Promise<WriteResult> {
    if (!isSafeSlug(slug)) {
      return { ok: false, error: { kind: "invalid_slug", slug } };
    }

    const trashPath = path.join(this.trashDir, `${slug}.md`);
    const livePath = path.join(this.pagesDir, `${slug}.md`);

    try {
      await fs.access(trashPath);
    } catch {
      return { ok: false, error: { kind: "page_not_found", slug } };
    }

    try {
      await fs.access(livePath);
      return { ok: false, error: { kind: "slug_collision", slug } };
    } catch {
      // No collision
    }

    await fs.rename(trashPath, livePath);
    return { ok: true, slug };
  }

  async permanentlyDeletePage(slug: string): Promise<WriteResult> {
    if (!isSafeSlug(slug)) {
      return { ok: false, error: { kind: "invalid_slug", slug } };
    }

    const trashPath = path.join(this.trashDir, `${slug}.md`);
    try {
      await fs.unlink(trashPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { ok: true, slug }; // graceful
      }
      throw err;
    }
    return { ok: true, slug };
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private async getExistingSlugs(): Promise<Set<string>> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.pagesDir);
    } catch {
      return new Set();
    }

    const slugs = new Set<string>();
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      if (entry.startsWith(".")) continue;

      const fullPath = path.join(this.pagesDir, entry);
      try {
        const raw = await fs.readFile(fullPath, "utf-8");
        const { data } = matter(raw);
        const slug = deriveSlug(entry, data.slug as string | undefined);
        slugs.add(slug);
      } catch {
        // Skip unreadable files
      }
    }
    return slugs;
  }
}
