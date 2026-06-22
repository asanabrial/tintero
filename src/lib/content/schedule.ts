// Pure schedule helpers — no React/Next.js/DB imports.
// All helpers take an INJECTED now: string (YYYY-MM-DD, UTC date-level).
// NONE call new Date() internally — deterministic and unit-testable.
// Comparison is ISO-string lexicographic: for YYYY-MM-DD this equals date order.
// date === now is VISIBLE (post goes live at 00:00 UTC on its date).

import type { Post } from "./types";
import type { AdminStatus, StatusCounts } from "./ports";

/**
 * Returns true if the post is future-dated relative to `now`.
 * Strict greater-than: a post dated exactly `now` is NOT future (it is live today).
 */
export function isFuturePost(post: Post, now: string): boolean {
  return post.date > now;
}

/**
 * Filters out future-dated posts from `posts`.
 * Keeps posts whose date is less than or equal to `now` (today + past are visible).
 */
export function hideFuturePosts(posts: Post[], now: string): Post[] {
  return posts.filter((p) => p.date <= now);
}

/**
 * Derives the display label for a post in the admin interface.
 * - draft (any date)              → "Draft"
 * - published + date > now        → "Scheduled"
 * - published + date <= now       → "Published"
 */
export function derivePostDisplayStatus(
  post: Post,
  now: string
): "Scheduled" | "Published" | "Draft" {
  if (post.status === "draft") return "Draft";      // draft wins even if future-dated
  if (post.date > now) return "Scheduled";          // published + future
  return "Published";                               // published + today/past
}

/**
 * Pure predicate: does this post match the requested admin status tab?
 * undefined adminStatus = "All" tab → every post matches.
 * Reuses derivePostDisplayStatus so the date===now boundary (Published, not
 * Scheduled) is defined in exactly one place (ADR-D1).
 */
export function matchesAdminStatus(
  post: Post,
  adminStatus: AdminStatus | undefined,
  now: string
): boolean {
  if (adminStatus === undefined) return true;
  const display = derivePostDisplayStatus(post, now); // "Draft" | "Published" | "Scheduled"
  return display.toLowerCase() === adminStatus;        // "draft" | "published" | "scheduled"
}

/**
 * Pure: count posts per admin status tab over the FULL post set.
 * all = posts.length; the three buckets partition all exactly (disjoint, exhaustive).
 */
export function computeStatusCounts(posts: Post[], now: string): StatusCounts {
  const counts: StatusCounts = { all: posts.length, published: 0, draft: 0, scheduled: 0 };
  for (const post of posts) {
    const display = derivePostDisplayStatus(post, now);
    if (display === "Draft") counts.draft += 1;
    else if (display === "Scheduled") counts.scheduled += 1;
    else counts.published += 1;
  }
  return counts;
}

/**
 * Pure: clamp a requested page number into [1, max(totalPages, 1)].
 * NaN/<=0 → 1; above range → totalPages (or 1 when totalPages===0).
 */
export function clampPage(page: number, totalPages: number): number {
  const max = totalPages < 1 ? 1 : totalPages;
  if (!Number.isFinite(page) || page < 1) return 1;
  if (page > max) return max;
  return Math.floor(page);
}
