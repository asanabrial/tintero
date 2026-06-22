// Pure dashboard helpers — no React/Next.js/DB imports.

import type { Post } from "./types";

/**
 * Partition posts by display status in a single pass.
 * `now` (YYYY-MM-DD) is injected by the caller — not computed here.
 * - published + date > now  → scheduled (not yet visible publicly)
 * - published + date <= now → published
 * - draft (any date)        → draft
 * Posts with any other status are excluded from all counts.
 * A post MUST NOT appear in both published and scheduled.
 */
export function splitPostsByStatus(
  posts: Post[],
  now: string
): { published: number; draft: number; scheduled: number } {
  let published = 0;
  let draft = 0;
  let scheduled = 0;

  for (const p of posts) {
    if (p.status === "published") {
      if (p.date > now) {
        scheduled++;  // published + future = scheduled (NOT in published)
      } else {
        published++;  // published + today/past
      }
    } else if (p.status === "draft") {
      draft++;
    }
    // Other values silently ignored (future-proof against widened union)
  }

  return { published, draft, scheduled };
}
