// Pure category helpers — no React/Next.js imports.
// Mirrors the tag.ts module but adds slash-path hierarchy.

import { slugifyTag } from "./tag";
import type { Category } from "./types";

/**
 * Convert a raw category string into an array of URL-safe slug segments.
 * Splits on "/" FIRST, then applies the same slug rules as slugifyTag to
 * each segment individually. Empty segments (from leading/trailing/double
 * slashes) are filtered out.
 *
 * Example: "Tech Stuff/JavaScript" → ["tech-stuff", "javascript"]
 */
export function slugifyCategory(raw: string): string[] {
  return raw
    .split("/")
    .map((seg) => slugifyTag(seg))
    .filter((seg) => seg.length > 0);
}

/**
 * Join an array of slug segments back into a full slash-path.
 * Example: ["tech", "javascript"] → "tech/javascript"
 */
export function joinSlug(segments: string[]): string {
  return segments.join("/");
}

/**
 * Test whether a post category path matches a filter slug.
 * Allows exact match OR descendant match (postPath starts with filterSlug + "/").
 * The trailing "/" guard prevents "technology" from matching filter "tech".
 */
export function matchesCategory(postPath: string, filterSlug: string): boolean {
  return postPath === filterSlug || postPath.startsWith(filterSlug + "/");
}

/**
 * Build a deduped category index from a 2D array of per-post raw category values.
 * Each inner array is one post's already-defaulted categories frontmatter.
 *
 * Key behaviours:
 * - Prefix expansion: "tech/javascript" emits both "tech" and "tech/javascript".
 * - Anti-double-count: a post declaring both "tech" and "tech/javascript" counts
 *   once toward "tech" (uses a per-post Set of prefix keys).
 * - Count = distinct posts matching each slug (prefix-inclusive).
 * - Label: first-occurrence-wins from raw declaration; intermediate parents derive
 *   their label from the raw segment of the declaring post.
 * - Output sorted alphabetically by slug.
 */
export function buildCategoryIndex(rawPerPost: string[][]): Category[] {
  const countMap = new Map<string, number>(); // slug → post count
  const labelMap = new Map<string, string>(); // slug → display label
  const segmentsMap = new Map<string, string[]>(); // slug → segments array

  for (const postRawCategories of rawPerPost) {
    // Per-post set of all prefix keys this post contributes to (prevents double-count)
    const postPrefixKeys = new Set<string>();

    for (const raw of postRawCategories) {
      const segments = slugifyCategory(raw);
      if (segments.length === 0) continue;

      // Expand all prefixes for this category path
      for (let depth = 1; depth <= segments.length; depth++) {
        const prefixSegments = segments.slice(0, depth);
        const prefixSlug = joinSlug(prefixSegments);
        postPrefixKeys.add(prefixSlug);

        // Record segments for this slug
        if (!segmentsMap.has(prefixSlug)) {
          segmentsMap.set(prefixSlug, prefixSegments);
        }

        // Label: first-occurrence-wins
        // For leaves and intermediate parents, derive from the raw segment at this depth.
        if (!labelMap.has(prefixSlug)) {
          // The raw segment at this depth position
          const rawSegments = raw.split("/").map((s) => s.trim()).filter((s) => s.length > 0);
          const rawLabel = rawSegments[depth - 1] ?? prefixSegments[depth - 1];
          labelMap.set(prefixSlug, rawLabel);
        }
      }
    }

    // Increment count once per post for each unique prefix key this post touches
    for (const prefixSlug of postPrefixKeys) {
      countMap.set(prefixSlug, (countMap.get(prefixSlug) ?? 0) + 1);
    }
  }

  const categories: Category[] = Array.from(segmentsMap.entries()).map(
    ([slug, segments]) => ({
      segments,
      slug,
      label: labelMap.get(slug) ?? segments[segments.length - 1],
      count: countMap.get(slug) ?? 0,
      depth: segments.length,
    })
  );

  // Sort alphabetically by slug
  categories.sort((a, b) => a.slug.localeCompare(b.slug));

  return categories;
}
