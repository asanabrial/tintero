import type { Post } from "./types";

/**
 * Stable partition: returns sticky posts first (preserving their relative order),
 * followed by non-sticky posts (preserving their relative order).
 *
 * Pure — no I/O, no side effects. Used exclusively by the blog index pages;
 * archives, tags, categories, and feeds keep pure chronological order.
 */
export function floatStickyPosts(posts: Post[]): Post[] {
  const sticky: Post[] = [];
  const rest: Post[] = [];
  for (const post of posts) {
    if (post.sticky) {
      sticky.push(post);
    } else {
      rest.push(post);
    }
  }
  return [...sticky, ...rest];
}
