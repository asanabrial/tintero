// Pure relatedness and navigation helpers — no React/Next/fs/Date imports.
// Mirrors the module structure of category.ts and tag.ts.

import { slugifyTag } from "./tag";
import { slugifyCategory, joinSlug } from "./category";
import type { Post } from "./types";

/**
 * Returns a Set of comparable category slugs for a post.
 * Each raw category is normalized via joinSlug(slugifyCategory(raw))
 * producing a full slash-path (e.g. "Tech/JavaScript" → "tech/javascript").
 * Empty strings are filtered out.
 */
function categorySlugSet(post: Post): Set<string> {
  return new Set(
    post.categories
      .map((raw) => joinSlug(slugifyCategory(raw)))
      .filter((s) => s.length > 0)
  );
}

/**
 * Returns a Set of comparable tag slugs for a post.
 * Each raw tag is normalized via slugifyTag(raw).
 * Empty strings are filtered out.
 */
function tagSlugSet(post: Post): Set<string> {
  return new Set(
    post.tags.map((raw) => slugifyTag(raw)).filter((s) => s.length > 0)
  );
}

/**
 * Counts shared members between two Sets.
 * Iterates the smaller Set for O(min(|a|,|b|)) lookups.
 */
function intersectionCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  // Iterate the smaller set for efficiency (js-set-map-lookups, js-length-check-first)
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of small) {
    if (large.has(v)) n++;
  }
  return n;
}

/**
 * Relatedness score between two posts.
 * Score = (shared category slugs × 2) + (shared tag slugs × 1).
 * Exported for unit testing.
 */
export function scorePost(current: Post, candidate: Post): number {
  const catShared = intersectionCount(
    categorySlugSet(current),
    categorySlugSet(candidate)
  );
  const tagShared = intersectionCount(
    tagSlugSet(current),
    tagSlugSet(candidate)
  );
  return catShared * 2 + tagShared;
}

/**
 * Returns the top-n most related posts to `current` from `allPosts`.
 *
 * Rules:
 * - Excludes the current post by slug.
 * - Excludes drafts (status !== "published") — defense-in-depth even when
 *   the caller passes an already-filtered list.
 * - Excludes candidates with score === 0.
 * - Sorts by score descending, then by date descending (YYYY-MM-DD lexicographic,
 *   no new Date() of current time).
 * - Returns at most n results (default 3).
 */
export function relatedPosts(current: Post, allPosts: Post[], n = 3): Post[] {
  return allPosts
    .filter((p) => p.slug !== current.slug && p.status === "published")
    .map((p) => ({ post: p, score: scorePost(current, p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : b.post.date.localeCompare(a.post.date) // tiebreak: more recent date first
    )
    .slice(0, n)
    .map((x) => x.post);
}

/**
 * Returns the chronological neighbors of `currentSlug` in `orderedPosts`.
 *
 * `orderedPosts` is expected to be date-DESC (newest first), as returned by
 * listPosts. Therefore:
 * - `prev` = the OLDER neighbor = orderedPosts[i + 1] (higher index)
 * - `next` = the NEWER neighbor = orderedPosts[i - 1] (lower index)
 *
 * Returns { prev: null, next: null } when currentSlug is not found.
 */
export function prevNextPosts(
  currentSlug: string,
  orderedPosts: Post[]
): { prev: Post | null; next: Post | null } {
  const i = orderedPosts.findIndex((p) => p.slug === currentSlug);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: orderedPosts[i + 1] ?? null, // older post = higher index
    next: orderedPosts[i - 1] ?? null, // newer post = lower index
  };
}
