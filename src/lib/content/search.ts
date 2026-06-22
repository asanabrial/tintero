// Pure search module — no imports from Next.js, React, or any IO package.
// This module is framework-agnostic and fully unit-testable in isolation.
import type { Post } from "./types";

/**
 * A post paired with its raw markdown body. The body is NOT part of Post
 * (by design — Post never exposes raw markdown). This transient type is
 * built inside the adapter during the listPosts parse loop, where body is
 * in scope, and passed into applySearch.
 */
export interface SearchableEntry {
  post: Post;
  body: string;
}

/**
 * Build the lowercased haystack string for a single post.
 * Fields searched: title, excerpt, raw markdown body, tags (joined), categories (joined).
 */
function buildHaystack(post: Post, body: string): string {
  return [
    post.title,
    post.excerpt,
    body,
    post.tags.join(" "),
    post.categories.join(" "),
  ]
    .join("\n")
    .toLowerCase();
}

/**
 * Returns true when the needle (already normalised: trimmed + lowercased)
 * is a literal substring of the haystack (already lowercased).
 * Multi-word needle is treated as a single exact phrase — no tokenisation.
 */
export function matchesQuery(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

/**
 * Returns true when the post title (case-insensitive) contains the needle.
 * needle must be pre-normalised (trimmed + lowercased).
 */
export function isTitleMatch(title: string, needle: string): boolean {
  return title.toLowerCase().includes(needle);
}

/**
 * Filter and rank a list of SearchableEntry objects against a raw query string.
 *
 * Semantics:
 * - rawQuery is trimmed and lowercased; empty/whitespace-only → returns [].
 * - Posts are partitioned into two tiers:
 *   Tier 0 (title match): title.toLowerCase().includes(needle)
 *   Tier 1 (other match): body, excerpt, tags, or categories contain the needle
 * - Tier 0 precedes Tier 1 in the result (REQ-RK-03, REQ-RK-04).
 * - Within each tier, the original input order is preserved (stable partition).
 *   Because the adapter feeds entries in date-desc order, this naturally preserves
 *   date-desc within each tier (REQ-RK-02).
 *
 * Assumes input entries are already date-desc sorted (caller's responsibility).
 * Returns Post[] (body stripped — callers only need Post).
 */
export function applySearch(entries: SearchableEntry[], rawQuery: string): Post[] {
  const needle = rawQuery.trim().toLowerCase();
  if (needle === "") return []; // empty/whitespace → empty result set (NOT all posts)

  const titleTier: Post[] = [];
  const otherTier: Post[] = [];

  for (const { post, body } of entries) {
    const haystack = buildHaystack(post, body);
    if (!matchesQuery(haystack, needle)) continue;

    if (isTitleMatch(post.title, needle)) {
      titleTier.push(post);
    } else {
      otherTier.push(post);
    }
  }

  // Stable partition: Tier 0 before Tier 1; date-desc preserved within each tier
  return [...titleTier, ...otherTier];
}
