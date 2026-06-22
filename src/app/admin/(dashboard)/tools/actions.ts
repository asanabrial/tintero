"use server";

import { updateTag } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getWriter, getPageWriter } from "@/lib/content";
import {
  parseImportBundle,
  importBundle,
  type ImportReport,
  type ImportMode,
} from "@/lib/content/import";
import { BUNDLE_VERSION, type ExportBundle } from "@/lib/content/export";
import type { SiteConfig } from "@/lib/content/types";
import { parseWxr } from "@/lib/content/wxr";

// ============================================================
// Constants
// ============================================================

const MAX_BUNDLE_BYTES = 10 * 1024 * 1024; // ~10MB
const MAX_WXR_BYTES = 50 * 1024 * 1024; // ~50MB — WP exports can be large

// ============================================================
// Types
// ============================================================

export type ImportActionState =
  | { ok: true; report: ImportReport }
  | { error: string }
  | undefined;

// ============================================================
// importAction
// ============================================================

/**
 * Server Action: import a tintero export bundle.
 * verifySession() is the FIRST call — DB admin role gate.
 * Size guard enforced BEFORE file.text()/JSON.parse to bound memory.
 */
export async function importAction(
  _prev: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  // AUTH GUARD — must be first
  const session = await verifySession();

  if (!can(session.role, "tools:access")) {
    return { error: "You do not have permission to perform this action." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No file uploaded" };
  }

  // Size guard BEFORE file.text() to avoid parsing huge payloads
  if (file.size > MAX_BUNDLE_BYTES) {
    return { error: "File too large (max 10MB)" };
  }

  const text = await file.text();

  const parsed = parseImportBundle(text);
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const modeRaw = formData.get("mode");
  const mode: ImportMode = modeRaw === "overwrite" ? "overwrite" : "skip";

  const writer = getWriter();
  const pageWriter = getPageWriter();

  const report = await importBundle(
    parsed.bundle,
    {
      postExists: async (slug) => (await writer.readRaw(slug)) !== null,
      createPost: (input) => writer.createPost(input, { source: "api" }),
      updatePost: (slug, input) => writer.updatePost(slug, input, { source: "api" }),
      pageExists: async (slug) => (await pageWriter.readRawPage(slug)) !== null,
      createPage: (input) => pageWriter.createPage(input, { source: "api" }),
      updatePage: (slug, input) => pageWriter.updatePage(slug, input, { source: "api" }),
    },
    mode
  );

  // Bulk cache invalidation after successful import
  updateTag("posts");
  updateTag("pages");
  updateTag("tags");
  updateTag("categories");

  return { ok: true, report };
}

// ============================================================
// WXR Import
// ============================================================

export type WxrImportActionState =
  | { ok: true; report: ImportReport; warnings: string[] }
  | { error: string }
  | undefined;

/**
 * Server Action: import a WordPress WXR (.xml) export.
 * verifySession() is the FIRST call — DB admin role gate.
 * 50MB size guard before file.text() to bound memory usage.
 */
export async function wxrImportAction(
  _prev: WxrImportActionState,
  formData: FormData
): Promise<WxrImportActionState> {
  try {
    // AUTH GUARD — must be first
    const session = await verifySession();

    if (!can(session.role, "tools:access")) {
      return { error: "You do not have permission to perform this action." };
    }

    const file = formData.get("wxr-file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "No file uploaded" };
    }

    // Size guard BEFORE file.text() to avoid parsing huge payloads
    if (file.size > MAX_WXR_BYTES) {
      return { error: "File too large (max 50MB)" };
    }

    const xml = await file.text();
    const { posts, pages, warnings } = parseWxr(xml);

    const modeRaw = formData.get("mode");
    const mode: ImportMode = modeRaw === "overwrite" ? "overwrite" : "skip";

    // Synthetic ExportBundle — siteConfig placeholder is NOT applied on import.
    // WxrItem.frontmatter is Record<string,unknown>; importBundle re-validates each
    // item via PostFrontmatterSchema/PageFrontmatterSchema, so the cast is safe.
    const bundle = {
      version: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      siteConfig: {} as unknown as SiteConfig,
      posts,
      pages,
    } as unknown as ExportBundle;

    const writer = getWriter();
    const pageWriter = getPageWriter();

    const report = await importBundle(
      bundle,
      {
        postExists: async (slug) => (await writer.readRaw(slug)) !== null,
        createPost: (input) => writer.createPost(input, { source: "api" }),
        updatePost: (slug, input) =>
          writer.updatePost(slug, input, { source: "api" }),
        pageExists: async (slug) => (await pageWriter.readRawPage(slug)) !== null,
        createPage: (input) => pageWriter.createPage(input, { source: "api" }),
        updatePage: (slug, input) =>
          pageWriter.updatePage(slug, input, { source: "api" }),
      },
      mode
    );

    // Bulk cache invalidation after successful import
    updateTag("posts");
    updateTag("pages");
    updateTag("tags");
    updateTag("categories");

    return { ok: true, report, warnings };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
