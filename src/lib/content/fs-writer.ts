// FsContentWriter — write-side FS adapter for posts.
// IMPORTANT: NO imports from 'next/cache' or 'next/headers'.
// Cache invalidation is the Server Action layer's responsibility (ADR-4).

import * as fs from "fs/promises";
import * as path from "path";
import matter from "gray-matter";
import { PostFrontmatterSchema } from "./schema";
import { deriveSlug, isSafeSlug, resolveCollisionSlug, slugifyTitle } from "./slug";
import type { ContentWriter, CreatePostInput, UpdatePostInput, WriteResult, TrashedItemInfo } from "./ports";
import type { PostSeo } from "./types";
import type { RevisionContext } from "../revisions/types";
import type { RevisionRepository } from "../revisions/ports";
import { getRevisionRepository } from "../revisions/factory";
import {
  serializePostMarkdown,
  serializeKnownFrontmatter,
  wrapFrontmatter,
  serializeFrontmatter,
  type SerializableFrontmatter,
} from "./markdown-serialize";

// Re-export serialization helpers so existing consumers (fs-page-writer.ts,
// test files, etc.) continue to import them from this module unchanged.
export type { SerializableFrontmatter };
export { serializeKnownFrontmatter, wrapFrontmatter, serializeFrontmatter };

/**
 * Normalize a per-content SEO object for writing: keep only non-empty trimmed
 * fields, and return undefined when nothing remains (so the `seo` key is omitted
 * from frontmatter entirely rather than written as an empty object).
 */
export function cleanSeo(seo: PostSeo | undefined): PostSeo | undefined {
  if (!seo) return undefined;
  const out: PostSeo = {};
  if (seo.title?.trim()) out.title = seo.title.trim();
  if (seo.metaDescription?.trim()) out.metaDescription = seo.metaDescription.trim();
  if (seo.focusKeyphrase?.trim()) out.focusKeyphrase = seo.focusKeyphrase.trim();
  if (seo.canonical?.trim()) out.canonical = seo.canonical.trim();
  if (seo.noindex === true) out.noindex = true;
  if (seo.ogImage?.trim()) out.ogImage = seo.ogImage.trim();
  if (seo.cornerstone === true) out.cornerstone = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Builds the full markdown file content with YAML frontmatter.
 * Delegates to serializePostMarkdown from markdown-serialize.ts so that
 * FS and DB writers always produce byte-identical revision rawContent.
 * Format: ---\n{yaml}---\n\n{body trimmed}\n
 */
export function buildFileContent(fm: SerializableFrontmatter, body: string): string {
  return serializePostMarkdown(fm, body);
}

// ============================================================
// Path-traversal guard
// ============================================================

/**
 * Resolves the absolute path for a slug within postsDir and asserts
 * it stays inside postsDir. Returns WriteResult invalid_slug if not.
 * Returns the resolved absolute path on success.
 */
function resolvePostPath(
  postsDir: string,
  slug: string
): { ok: true; filePath: string } | { ok: false; error: { kind: "invalid_slug"; slug: string } } {
  const abs = path.resolve(postsDir, `${slug}.md`);
  const safe = path.resolve(postsDir) + path.sep;
  if (!abs.startsWith(safe)) {
    return { ok: false, error: { kind: "invalid_slug", slug } };
  }
  return { ok: true, filePath: abs };
}

// ============================================================
// FsContentWriter
// ============================================================

export class FsContentWriter implements ContentWriter {
  constructor(
    private readonly postsDir: string,
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
   * Reads the raw frontmatter and body for a post matching the given slug.
   * Scans the postsDir for a file whose deriveSlug matches.
   * Returns null if not found.
   */
  async readRaw(
    slug: string
  ): Promise<{ frontmatter: Record<string, unknown>; rawData: Record<string, unknown>; body: string } | null> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.postsDir);
    } catch {
      return null;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      if (entry.startsWith(".")) continue;

      const fullPath = path.join(this.postsDir, entry);
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

  async createPost(input: CreatePostInput, rev?: RevisionContext): Promise<WriteResult> {
    // If an explicit slug is provided by the user, validate the RAW value first
    // before cleaning — rejects "../evil", "Bad Slug!", etc.
    if (input.slug?.trim()) {
      if (!isSafeSlug(input.slug.trim())) {
        return { ok: false, error: { kind: "invalid_slug", slug: input.slug.trim() } };
      }
    }

    // Validate frontmatter BEFORE slug derivation so empty title returns invalid_frontmatter
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

    // Determine desired slug (after frontmatter validation succeeds)
    const rawDesired = input.slug?.trim()
      ? slugifyTitle(input.slug.trim())
      : slugifyTitle(input.title);

    // Validate derived slug charset (e.g. title-derived slug must also be safe)
    if (rawDesired === "" || !isSafeSlug(rawDesired)) {
      return { ok: false, error: { kind: "invalid_slug", slug: rawDesired } };
    }

    // Path-traversal guard (belt-and-suspenders after charset validation)
    const pathCheck = resolvePostPath(this.postsDir, rawDesired);
    if (!pathCheck.ok) return pathCheck;

    // Gather existing slugs for collision resolution
    const existingSlugs = await this.getExistingSlugs();
    const finalSlug = resolveCollisionSlug(rawDesired, existingSlugs);

    // Determine whether to write explicit slug frontmatter field
    // Only pin slug when it differs from what deriveSlug would infer from the filename
    const inferredFromFilename = slugifyTitle(input.title);
    const needsExplicitSlug = finalSlug !== inferredFromFilename;

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
      // Write sticky only when true — omit-when-false is enforced by serializeKnownFrontmatter
      ...(input.sticky ? { sticky: true } : {}),
      ...(parseResult.data.authorId ? { authorId: parseResult.data.authorId } : {}),
      ...(input.visibility && input.visibility !== "public" ? { visibility: input.visibility } : {}),
      ...(input.visibility === "password" && input.password ? { password: input.password } : {}),
      ...(cleanSeo(parseResult.data.seo) ? { seo: cleanSeo(parseResult.data.seo) } : {}),
    };

    const content = buildFileContent(fm, input.body);

    const finalPath = path.join(this.postsDir, `${finalSlug}.md`);
    const tmpPath = path.join(this.postsDir, `.${finalSlug}.tmp`);

    try {
      await fs.writeFile(tmpPath, content, "utf-8");
      await fs.rename(tmpPath, finalPath);
    } catch (err) {
      try { await fs.unlink(tmpPath); } catch { /* ignore cleanup error */ }
      throw err;
    }

    // Best-effort revision capture — AFTER the file write succeeds; failures swallowed.
    await this.captureRevision("post", finalSlug, content, rev);

    return { ok: true, slug: finalSlug };
  }

  async updatePost(currentSlug: string, input: UpdatePostInput, rev?: RevisionContext): Promise<WriteResult> {
    // Validate current slug
    if (!isSafeSlug(currentSlug)) {
      return { ok: false, error: { kind: "invalid_slug", slug: currentSlug } };
    }
    const currentPathCheck = resolvePostPath(this.postsDir, currentSlug);
    if (!currentPathCheck.ok) return currentPathCheck;

    // Read existing file (for ADR-7 extra-key preservation)
    const existing = await this.readRaw(currentSlug);
    if (!existing) {
      return { ok: false, error: { kind: "post_not_found", slug: currentSlug } };
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
      const newPathCheck = resolvePostPath(this.postsDir, desiredNewSlug);
      if (!newPathCheck.ok) return newPathCheck;

      // Collision check: exclude the current slug from the existing set
      const existingSlugs = await this.getExistingSlugs();
      existingSlugs.delete(currentSlug);
      if (existingSlugs.has(desiredNewSlug)) {
        return { ok: false, error: { kind: "slug_collision", slug: desiredNewSlug } };
      }
    }

    const newSlug = slugChanged ? desiredNewSlug : currentSlug;

    // Validate frontmatter
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

    // ADR-7: merge validated known fields over a shallow copy of the raw data
    // so unknown author-added frontmatter keys survive the update.
    const mergedData: SerializableFrontmatter = {
      ...existing.rawData,
      title: parseResult.data.title,
      date: parseResult.data.date,
      status: parseResult.data.status,
      tags: parseResult.data.tags,
      categories: parseResult.data.categories,
      comments: parseResult.data.comments,
      // slug is handled separately below
    };

    // Handle excerpt: set or remove
    if (parseResult.data.excerpt) {
      mergedData.excerpt = parseResult.data.excerpt;
    } else {
      delete mergedData.excerpt;
    }

    // Handle coverImage: set or remove. Use the validated value (parseResult.data)
    // so the schema's isSafeMediaUrl refine actually gates what reaches disk —
    // writing input.coverImage directly would bypass URL validation.
    if (parseResult.data.coverImage) {
      mergedData.coverImage = parseResult.data.coverImage;
    } else {
      delete mergedData.coverImage;
    }

    // Handle author: set or remove (omit when empty)
    if (parseResult.data.author) {
      mergedData.author = parseResult.data.author;
    } else {
      delete mergedData.author;
    }

    // Handle SEO overrides: set when any non-empty field remains, else remove.
    const cleanedSeo = cleanSeo(parseResult.data.seo);
    if (cleanedSeo) {
      mergedData.seo = cleanedSeo;
    } else {
      delete mergedData.seo;
    }

    // Handle sticky: write only when true; remove (omit) when false/absent
    if (input.sticky) {
      mergedData.sticky = true;
    } else {
      delete mergedData.sticky;
    }

    // Handle visibility: omit when public (backward compat)
    if (input.visibility && input.visibility !== "public") {
      mergedData.visibility = input.visibility;
    } else {
      delete mergedData.visibility;
    }
    // Handle password: only when visibility is password and non-empty
    if (input.visibility === "password" && input.password) {
      mergedData.password = input.password;
    } else {
      delete mergedData.password;
    }

    // On slug change: write explicit slug frontmatter to pin the permalink
    if (slugChanged) {
      mergedData.slug = newSlug;
    } else {
      // Keep existing slug field behavior: remove if it matches what deriveSlug infers
      // (keeps files clean), or keep if it was already explicitly set
      // For simplicity: if the file had an explicit slug field and slug didn't change,
      // preserve what was already in rawData (which mergedData already has from spread)
    }

    const content = buildFileContent(mergedData, input.body);
    const finalPath = path.join(this.postsDir, `${newSlug}.md`);
    const tmpPath = path.join(this.postsDir, `.${newSlug}.tmp`);

    try {
      await fs.writeFile(tmpPath, content, "utf-8");
      await fs.rename(tmpPath, finalPath);
    } catch (err) {
      try { await fs.unlink(tmpPath); } catch { /* ignore cleanup error */ }
      throw err;
    }

    // If slug changed, remove the old file
    if (slugChanged) {
      const oldPath = path.join(this.postsDir, `${currentSlug}.md`);
      try {
        await fs.unlink(oldPath);
      } catch {
        // If the old file doesn't exist (shouldn't happen), ignore
      }
    }

    // Best-effort revision capture — AFTER the file write + optional old-file removal; failures swallowed.
    await this.captureRevision("post", newSlug, content, rev);

    return { ok: true, slug: newSlug };
  }

  async deletePost(slug: string): Promise<WriteResult> {
    // Validate slug
    if (!isSafeSlug(slug)) {
      return { ok: false, error: { kind: "invalid_slug", slug } };
    }
    const pathCheck = resolvePostPath(this.postsDir, slug);
    if (!pathCheck.ok) return pathCheck;

    const filePath = pathCheck.filePath;
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // Graceful: file already gone — spec scenario "Delete non-existent"
        return { ok: true, slug };
      }
      throw err;
    }

    return { ok: true, slug };
  }

  async setPostStatus(slug: string, status: "published" | "draft"): Promise<WriteResult> {
    if (!isSafeSlug(slug)) {
      return { ok: false, error: { kind: "invalid_slug", slug } };
    }
    const abs = path.resolve(this.postsDir, `${slug}.md`);
    const safe = path.resolve(this.postsDir) + path.sep;
    if (!abs.startsWith(safe)) {
      return { ok: false, error: { kind: "invalid_slug", slug } };
    }

    const existing = await this.readRaw(slug);
    if (!existing) {
      return { ok: false, error: { kind: "post_not_found", slug } };
    }

    const mergedData = { ...existing.rawData, status } as SerializableFrontmatter;
    const content = buildFileContent(mergedData, existing.body);

    const finalPath = path.join(this.postsDir, `${slug}.md`);
    const tmpPath = path.join(this.postsDir, `.${slug}.tmp`);

    try {
      await fs.writeFile(tmpPath, content, "utf-8");
      await fs.rename(tmpPath, finalPath);
    } catch (err) {
      try { await fs.unlink(tmpPath); } catch { /* ignore */ }
      throw err;
    }

    await this.captureRevision("post", slug, content, undefined);
    return { ok: true, slug };
  }

  // ============================================================
  // Trash (soft-delete) — WordPress Trash parity
  // ============================================================

  private get trashDir(): string {
    return path.join(path.dirname(this.postsDir), ".trash", "posts");
  }

  async trashPost(slug: string): Promise<WriteResult> {
    if (!isSafeSlug(slug)) {
      return { ok: false, error: { kind: "invalid_slug", slug } };
    }
    const pathCheck = resolvePostPath(this.postsDir, slug);
    if (!pathCheck.ok) return pathCheck;

    await fs.mkdir(this.trashDir, { recursive: true });

    const livePath = pathCheck.filePath;
    const trashPath = path.join(this.trashDir, `${slug}.md`);
    try {
      await fs.rename(livePath, trashPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { ok: false, error: { kind: "post_not_found", slug } };
      }
      throw err;
    }
    return { ok: true, slug };
  }

  async listTrashedPosts(): Promise<TrashedItemInfo[]> {
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

  async restorePost(slug: string): Promise<WriteResult> {
    if (!isSafeSlug(slug)) {
      return { ok: false, error: { kind: "invalid_slug", slug } };
    }

    const trashPath = path.join(this.trashDir, `${slug}.md`);
    const livePath = path.join(this.postsDir, `${slug}.md`);

    // Check if file is in trash
    try {
      await fs.access(trashPath);
    } catch {
      return { ok: false, error: { kind: "post_not_found", slug } };
    }

    // Check for slug collision in live dir
    try {
      await fs.access(livePath);
      // If no error, file exists — collision
      return { ok: false, error: { kind: "slug_collision", slug } };
    } catch {
      // Good — no collision
    }

    await fs.rename(trashPath, livePath);
    return { ok: true, slug };
  }

  async permanentlyDeletePost(slug: string): Promise<WriteResult> {
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
      entries = await fs.readdir(this.postsDir);
    } catch {
      return new Set();
    }

    const slugs = new Set<string>();
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      if (entry.startsWith(".")) continue;

      const fullPath = path.join(this.postsDir, entry);
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
