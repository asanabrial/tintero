// Pure restore-input helpers — no Next.js imports, no "use server".
// Importable from bun:test without environment setup.
// Both functions are best-effort: malformed YAML never throws.

import matter from "gray-matter";
import type { UpdatePostInput, UpdatePageInput } from "@/lib/content";

/**
 * Parses a raw markdown file string (frontmatter + body) and maps it to
 * UpdatePostInput. Mirrors the inline mapping in posts revisions/actions.ts.
 * Never throws — malformed YAML falls back to sane defaults with body = rawContent.
 */
export function buildRestoreInput(rawContent: string): UpdatePostInput {
  let data: Record<string, unknown> = {};
  let body = "";
  try {
    const parsed = matter(rawContent);
    data = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch {
    // Malformed YAML — treat entire input as body, use defaults for frontmatter
    body = rawContent;
  }

  const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
  const categories = Array.isArray(data.categories) ? (data.categories as string[]) : [];

  return {
    title: typeof data.title === "string" ? data.title : "",
    slug: typeof data.slug === "string" ? data.slug : undefined,
    date:
      data.date instanceof Date
        ? data.date.toISOString().slice(0, 10)
        : typeof data.date === "string"
          ? data.date
          : new Date().toISOString().slice(0, 10),
    status:
      data.status === "published" || data.status === "draft"
        ? data.status
        : "draft",
    excerpt:
      typeof data.excerpt === "string" && data.excerpt ? data.excerpt : undefined,
    tags,
    categories,
    comments: typeof data.comments === "boolean" ? data.comments : true,
    body,
  };
}

/**
 * Parses a raw page markdown file string and maps it to UpdatePageInput.
 * Page input has NO status/tags/categories/comments fields.
 * Never throws — malformed YAML falls back to sane defaults with body = rawContent.
 */
export function buildRestorePageInput(rawContent: string): UpdatePageInput {
  let data: Record<string, unknown> = {};
  let body = "";
  try {
    const parsed = matter(rawContent);
    data = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch {
    // Malformed YAML — treat entire input as body, use defaults for frontmatter
    body = rawContent;
  }

  return {
    title: typeof data.title === "string" ? data.title : "",
    slug: typeof data.slug === "string" ? data.slug : undefined,
    date:
      data.date instanceof Date
        ? data.date.toISOString().slice(0, 10)
        : typeof data.date === "string"
          ? data.date
          : new Date().toISOString().slice(0, 10),
    excerpt:
      typeof data.excerpt === "string" && data.excerpt ? data.excerpt : undefined,
    body,
  };
}
