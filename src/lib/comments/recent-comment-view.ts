// Pure safe-projection mapper for the Recent Comments widget.
// NO "use server" / "use cache" — plain module, unit-testable.
// ZERO React / Next.js imports — stays in the comments bounded context.

import type { Comment, CommentStatus } from "./types";

/**
 * Admin-safe comment view — structurally excludes authorEmail, authorUrl, and body.
 * Any field missing from this interface CANNOT leak into JSX via the type system.
 */
export interface RecentCommentView {
  id: string;
  postSlug: string;
  authorName: string;
  status: CommentStatus;
  excerpt: string;
  createdAt: Date;
}

/** Maximum excerpt length in characters before truncation. */
const EXCERPT_MAX = 140;

/**
 * Normalise and truncate a comment body into a safe display excerpt.
 * - Collapses all whitespace (newlines, multiple spaces, carriage returns) to single spaces.
 * - Trims leading/trailing whitespace.
 * - Caps at EXCERPT_MAX chars; appends "…" when truncated.
 */
function toExcerpt(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  if (collapsed.length <= EXCERPT_MAX) return collapsed;
  return collapsed.slice(0, EXCERPT_MAX) + "…";
}

/**
 * Projects a full internal Comment (which carries authorEmail) to a RecentCommentView
 * that structurally cannot carry that field. The type definition is the security boundary.
 */
export function toRecentCommentView(c: Comment): RecentCommentView {
  return {
    id: c.id,
    postSlug: c.postSlug,
    authorName: c.authorName,
    status: c.status,
    excerpt: toExcerpt(c.body),
    createdAt: c.createdAt,
  };
}
