// Pure import pipeline — no FS, no Next.js, no new Date().
// All writer deps are injected so this module is fully unit-testable in-memory.

import { z } from "zod";
import { PostFrontmatterSchema, PageFrontmatterSchema } from "./schema";
import { isSafeSlug } from "./slug";
import type { CreatePostInput, CreatePageInput, WriteResult } from "./ports";
import { BUNDLE_VERSION, type ExportBundle } from "./export";

// ============================================================
// Types
// ============================================================

export type ImportMode = "skip" | "overwrite";

export interface ImportReport {
  imported: string[];
  skipped: string[];
  failed: { slug: string; error: string }[];
}

// ============================================================
// Bundle validation schemas (loose — we re-validate frontmatter per-item)
// ============================================================

const BundleItemSchema = z.object({
  slug: z.string(),
  frontmatter: z.record(z.string(), z.unknown()),
  raw: z.string(),
});

const ExportBundleSchema = z.object({
  version: z.number(),
  exportedAt: z.string(),
  siteConfig: z.unknown(), // not applied on import (v1) — loose validate
  posts: z.array(BundleItemSchema),
  pages: z.array(BundleItemSchema),
});

// ============================================================
// parseImportBundle
// ============================================================

export function parseImportBundle(
  text: string
): { ok: true; bundle: ExportBundle } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }

  const parsed = ExportBundleSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: "Invalid bundle shape" };
  }

  if (parsed.data.version !== BUNDLE_VERSION) {
    return {
      ok: false,
      error: `Unsupported bundle version: ${parsed.data.version}`,
    };
  }

  return { ok: true, bundle: parsed.data as unknown as ExportBundle };
}

// ============================================================
// ImportDeps — injected writer functions (zero FS in tests)
// ============================================================

export interface ImportDeps {
  postExists: (slug: string) => Promise<boolean>;
  createPost: (input: CreatePostInput) => Promise<WriteResult>;
  updatePost: (currentSlug: string, input: CreatePostInput) => Promise<WriteResult>;
  pageExists: (slug: string) => Promise<boolean>;
  createPage: (input: CreatePageInput) => Promise<WriteResult>;
  updatePage: (currentSlug: string, input: CreatePageInput) => Promise<WriteResult>;
}

// ============================================================
// importBundle — best-effort per-item loop
// ============================================================

export async function importBundle(
  bundle: ExportBundle,
  deps: ImportDeps,
  mode: ImportMode
): Promise<ImportReport> {
  const report: ImportReport = { imported: [], skipped: [], failed: [] };

  for (const item of bundle.posts) {
    await importPost(item, deps, mode, report);
  }
  for (const item of bundle.pages) {
    await importPage(item, deps, mode, report);
  }

  return report;
}

// ============================================================
// Per-item helpers
// ============================================================

interface BundleItem {
  slug: string;
  frontmatter: Record<string, unknown>;
  raw: string;
}

async function importPost(
  item: BundleItem,
  deps: ImportDeps,
  mode: ImportMode,
  report: ImportReport
): Promise<void> {
  // Step 1: slug safety check — reject BEFORE any writer call
  if (!isSafeSlug(item.slug)) {
    report.failed.push({ slug: item.slug, error: "Unsafe slug rejected" });
    return;
  }

  // Step 2: validate frontmatter via schema
  const fmResult = PostFrontmatterSchema.safeParse(item.frontmatter);
  if (!fmResult.success) {
    const issues = fmResult.error.issues
      .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
      .join("; ");
    report.failed.push({ slug: item.slug, error: `Invalid frontmatter: ${issues}` });
    return;
  }

  // Step 3: build writer input
  const fm = fmResult.data;
  const input: CreatePostInput = {
    title: fm.title,
    slug: item.slug,
    date: fm.date,
    status: fm.status,
    excerpt: fm.excerpt,
    tags: fm.tags,
    categories: fm.categories,
    comments: fm.comments,
    body: item.raw,
  };

  // Step 4-5: existence check + collision mode (per ADR-D3)
  try {
    const exists = await deps.postExists(item.slug);

    if (mode === "skip" && exists) {
      report.skipped.push(item.slug);
      return;
    }

    let result: WriteResult;
    if (mode === "overwrite" && exists) {
      result = await deps.updatePost(item.slug, input);
    } else {
      result = await deps.createPost(input);
    }

    if (!result.ok) {
      report.failed.push({
        slug: item.slug,
        error: result.error.kind,
      });
      return;
    }

    report.imported.push(result.slug);
  } catch (err) {
    report.failed.push({
      slug: item.slug,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function importPage(
  item: BundleItem,
  deps: ImportDeps,
  mode: ImportMode,
  report: ImportReport
): Promise<void> {
  // Step 1: slug safety check
  if (!isSafeSlug(item.slug)) {
    report.failed.push({ slug: item.slug, error: "Unsafe slug rejected" });
    return;
  }

  // Step 2: validate frontmatter via schema
  const fmResult = PageFrontmatterSchema.safeParse(item.frontmatter);
  if (!fmResult.success) {
    const issues = fmResult.error.issues
      .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
      .join("; ");
    report.failed.push({ slug: item.slug, error: `Invalid frontmatter: ${issues}` });
    return;
  }

  // Step 3: build writer input
  const fm = fmResult.data;
  const input: CreatePageInput = {
    title: fm.title,
    slug: item.slug,
    date: fm.date,
    excerpt: fm.excerpt,
    body: item.raw,
  };

  // Step 4-5: existence check + collision mode (per ADR-D3)
  try {
    const exists = await deps.pageExists(item.slug);

    if (mode === "skip" && exists) {
      report.skipped.push(item.slug);
      return;
    }

    let result: WriteResult;
    if (mode === "overwrite" && exists) {
      result = await deps.updatePage(item.slug, input);
    } else {
      result = await deps.createPage(input);
    }

    if (!result.ok) {
      report.failed.push({
        slug: item.slug,
        error: result.error.kind,
      });
      return;
    }

    report.imported.push(result.slug);
  } catch (err) {
    report.failed.push({
      slug: item.slug,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
