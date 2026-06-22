import type { Tag } from "./types";

/**
 * Convert a raw tag string to a URL-safe slug.
 * Lowercases, replaces non-alphanumeric characters with hyphens,
 * and trims leading/trailing hyphens.
 */
export function slugifyTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build a deduped tag index from an array of per-post tag arrays.
 * Preserves the display label from the first occurrence of each slug.
 * Counts total occurrences across all posts.
 *
 * @param rawTagsPerPost - each element is the tags array for one post
 */
export function buildTagIndex(rawTagsPerPost: string[][]): Tag[] {
  const labelMap = new Map<string, string>();
  const countMap = new Map<string, number>();

  for (const postTags of rawTagsPerPost) {
    for (const raw of postTags) {
      const slug = slugifyTag(raw);
      if (!labelMap.has(slug)) {
        // First occurrence: preserve the raw label as the display label
        labelMap.set(slug, raw.trim());
      }
      countMap.set(slug, (countMap.get(slug) ?? 0) + 1);
    }
  }

  return Array.from(labelMap.entries()).map(([slug, label]) => ({
    slug,
    label,
    count: countMap.get(slug) ?? 0,
  }));
}
