/**
 * Shared markdown serialization helpers.
 *
 * This module is the canonical home for all post and page serialization logic.
 * Both FS writers (fs-writer.ts, fs-page-writer.ts) and DB writers
 * (drizzle-content-writer.ts, drizzle-page-writer.ts) import from here so that
 * revision rawContent is byte-identical regardless of the storage backend.
 *
 * Public surface:
 *   serializePostMarkdown(fm, body) → full markdown string for a post
 *   serializePageMarkdown(fm, body) → full markdown string for a page
 *
 * Lower-level helpers (serializeKnownFrontmatter, wrapFrontmatter,
 * serializeFrontmatter) are also exported so fs-writer.ts can re-export them
 * for backward compatibility.
 */

import { stringify as yamlStringify } from "yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SerializableFrontmatter = {
  title: string;
  slug?: string;
  date: string;
  status: "published" | "draft";
  excerpt?: string;
  coverImage?: string;
  tags: string[];
  categories: string[];
  comments: boolean;
  /** Display author/byline. Omitted when empty/undefined. */
  author?: string;
  /** Written only when true; omitted when false/undefined (backward compat). */
  sticky?: boolean;
  visibility?: "public" | "private" | "password";
  password?: string;
  [key: string]: unknown; // allows unknown author-added keys (ADR-7)
};

export type PageSerializableFrontmatter = {
  title: string;
  slug?: string;
  date: string;
  status?: "draft" | "published";
  excerpt?: string;
  parent?: string;
  menu_order?: number;
  [key: string]: unknown; // allows unknown author-added keys (ADR-7)
};

export const PAGE_KEY_ORDER = [
  "title",
  "slug",
  "date",
  "status",
  "excerpt",
  "parent",
  "menu_order",
  "seo",
] as const;

// ---------------------------------------------------------------------------
// Low-level helpers (shared between post and page serializers)
// ---------------------------------------------------------------------------

/**
 * Generic ordered-key serializer core.
 * Walks `orderedKnownKeys` in order, copies present/non-omitted keys, then appends
 * unknown extras (any key NOT in the ordered set and NOT "body").
 * Omission rule: a key is omitted when its value is `undefined`.
 * Special case: `excerpt` is also omitted when its value is `""` (empty string).
 * Returns a YAML string.
 */
export function serializeKnownFrontmatter(
  orderedKnownKeys: readonly string[],
  fm: Record<string, unknown>
): string {
  const knownKeySet = new Set([...orderedKnownKeys, "body"]);

  // Walk known keys in stable order, apply omission rules
  const known: Record<string, unknown> = {};
  for (const key of orderedKnownKeys) {
    const value = fm[key];
    if (value === undefined) continue;
    if (key === "excerpt" && value === "") continue;
    if (key === "coverImage" && value === "") continue;
    // sticky: omit entirely when false (write only when true, mirror WP "pinned" semantic)
    if (key === "sticky" && value === false) continue;
    // visibility: omit when "public" (backward compat — existing posts without the field stay clean)
    if (key === "visibility" && value === "public") continue;
    // password: omit unless visibility is "password" and value is non-empty
    if (key === "password" && (fm["visibility"] !== "password" || !value)) continue;
    known[key] = value;
  }

  // Collect extras: keys not in the known set
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fm)) {
    if (!knownKeySet.has(key)) {
      extra[key] = value;
    }
  }

  const obj = { ...known, ...extra };
  // Serialize as YAML 1.1 so the output round-trips through the read side, which
  // uses gray-matter (js-yaml / YAML 1.1). Under 1.1 a bare `2026-06-17` scalar is a
  // timestamp, so the stringifier quotes date-like strings ("2026-06-17"); js-yaml
  // then reads them back as strings. With the default 1.2 output the date is emitted
  // unquoted, js-yaml parses it as a Date, and z.string().date() rejects the post,
  // silently dropping it from every listing while it still exists on disk.
  return yamlStringify(obj, { version: "1.1" });
}

/**
 * Wraps a YAML string and body into the markdown frontmatter envelope.
 * Format: ---\n{yaml}---\n\n{body trimmed}\n
 */
export function wrapFrontmatter(yaml: string, body: string): string {
  return `---\n${yaml}---\n\n${body.trimEnd()}\n`;
}

/**
 * Serializes post frontmatter to a YAML string.
 * Known fields are written in a stable key order:
 *   title, slug?, date, status, excerpt?, coverImage?, tags, categories, comments,
 *   author?, sticky?, authorId?, visibility?, password?, seo?
 * Unknown extra keys are written after the known ones.
 * Thin wrapper around serializeKnownFrontmatter with the post key order.
 */
export function serializeFrontmatter(fm: SerializableFrontmatter): string {
  return serializeKnownFrontmatter(
    [
      "title",
      "slug",
      "date",
      "status",
      "excerpt",
      "coverImage",
      "tags",
      "categories",
      "comments",
      "author",
      "sticky",
      "authorId",
      "visibility",
      "password",
      "seo",
    ],
    fm as Record<string, unknown>
  );
}

// ---------------------------------------------------------------------------
// Primary exports: full-document serializers
// ---------------------------------------------------------------------------

/**
 * Builds the full markdown document for a post.
 * Format: ---\n{yaml frontmatter}---\n\n{body trimmed}\n
 *
 * This is the canonical serialization used by BOTH FsContentWriter (for disk
 * writes) and DrizzleContentWriter (for revision rawContent). Identical output
 * guarantees cross-writer revision parity.
 */
export function serializePostMarkdown(
  fm: SerializableFrontmatter,
  body: string
): string {
  return wrapFrontmatter(serializeFrontmatter(fm), body);
}

/**
 * Builds the full markdown document for a page.
 * Key order: title, slug?, date, status?, excerpt?, parent?, menu_order?, seo?
 * Post-only keys (tags, categories, comments) are NEVER emitted.
 *
 * This is the canonical serialization used by BOTH FsPageWriter and
 * DrizzlePageWriter for revision rawContent.
 */
export function serializePageMarkdown(
  fm: PageSerializableFrontmatter,
  body: string
): string {
  return wrapFrontmatter(
    serializeKnownFrontmatter(PAGE_KEY_ORDER, fm as Record<string, unknown>),
    body
  );
}
