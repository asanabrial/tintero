import type { CommentThread } from "./types";

/**
 * Caps the nesting depth of a thread tree. Returns a new array — never mutates input.
 * maxDepth 0 = unlimited (no cap applied). Replies are at depth 1.
 * With the current flat CommentThread structure (comment + replies[]), this function
 * is primarily future-proofing for deeper nesting support.
 */
export function capThreadDepth(threads: CommentThread[], maxDepth: number): CommentThread[] {
  if (!maxDepth || maxDepth <= 0) return threads;
  return threads.map(({ comment, replies }) => ({
    comment,
    // At depth 1, keep replies only if maxDepth >= 1 (which it always is here)
    replies: maxDepth >= 1 ? replies : [],
  }));
}

/**
 * Paginates top-level threads (replies stay with their parent).
 * perPage 0 = show all (no paging). page is 1-based, clamped to valid range.
 * Returns { items: CommentThread[], totalPages: number }.
 */
export function paginateThreads(
  threads: CommentThread[],
  page: number,
  perPage: number
): { items: CommentThread[]; totalPages: number } {
  if (!perPage || perPage <= 0) {
    return { items: threads, totalPages: 1 };
  }
  const totalPages = Math.max(1, Math.ceil(threads.length / perPage));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * perPage;
  const items = threads.slice(start, start + perPage);
  return { items, totalPages };
}
