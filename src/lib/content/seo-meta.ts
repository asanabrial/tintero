/**
 * Shared SEO meta helpers for the content DB layer.
 *
 * Extracted from backfill.ts and drizzle-adapter.ts to avoid duplication.
 * Callers:
 *   - backfill.ts            (forward:  PostSeo → content_meta rows)
 *   - drizzle-adapter.ts     (reverse:  content_meta rows → PostSeo)
 *   - drizzle-content-writer.ts (both directions)
 */

import type { PostSeo } from "./types";

// Stable insertion order — matches backfill.ts / drizzle-adapter.ts.
export const SEO_FIELDS: ReadonlyArray<keyof PostSeo> = [
  "title",
  "metaDescription",
  "focusKeyphrase",
  "canonical",
  "noindex",
  "ogImage",
  "cornerstone",
];

/**
 * Map a PostSeo field name to the meta_key stored in content_meta.
 * Example: "title" → "seo.title"
 */
export function seoMetaKey(field: keyof PostSeo): string {
  return `seo.${field}`;
}

/**
 * Serialize a PostSeo field value to the meta_value string stored in content_meta.
 * Booleans → "true"/"false"; strings pass through; undefined → null.
 */
export function seoMetaValue(value: string | boolean | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * Reassemble a PostSeo object from content_meta rows.
 *
 * Processes rows that carry a "seo." prefix on meta_key. Boolean fields
 * (noindex, cornerstone) are parsed from their "true"/"false" text form.
 * Returns undefined when no SEO fields are present so callers can omit the
 * key entirely rather than writing an empty object.
 */
export function reassembleSeo(
  rows: ReadonlyArray<{ meta_key: string; meta_value: string | null }>
): PostSeo | undefined {
  const BOOLEAN_SEO_FIELDS = new Set(["noindex", "cornerstone"]);
  const seo: Record<string, unknown> = {};
  let hasFields = false;

  for (const row of rows) {
    if (!row.meta_key.startsWith("seo.")) continue;
    if (row.meta_value === null) continue;
    const field = row.meta_key.slice(4); // strip "seo." prefix
    hasFields = true;
    if (BOOLEAN_SEO_FIELDS.has(field)) {
      seo[field] = row.meta_value === "true";
    } else {
      seo[field] = row.meta_value;
    }
  }

  return hasFields ? (seo as PostSeo) : undefined;
}
