// CommentRepository port — the single interface the app layer depends on.
// ZERO imports from React, Next.js, pg, or @electric-sql/pglite.

import type { Comment, CommentInput, CommentStatus, CommentThread, PublicComment } from "./types";

/** Tab counts for the admin status filter strip. */
export interface CommentStatusCounts {
  all: number;
  pending: number;
  approved: number;
  spam: number;
  trash: number;
}

export interface CommentRepository {
  /** Returns approved comments for a post as threaded CommentThread[]. */
  listApproved(slug: string): Promise<CommentThread[]>;

  /** Returns count of approved comments for a post. */
  countApproved(slug: string): Promise<number>;

  /**
   * Returns approved-comment counts for many posts in a single round-trip.
   * The result is zero-filled: every requested slug is present, defaulting to 0.
   */
  countApprovedBySlugs(slugs: string[]): Promise<Record<string, number>>;

  /**
   * Inserts a comment with the provided status.
   * Enforces depth guard: parentId must reference an approved top-level comment.
   * Throws CommentDepthError on violation.
   */
  submit(input: CommentInput, status: CommentStatus): Promise<Comment>;

  /** Returns the comment with the given id, or null if not found. */
  getById(id: string): Promise<Comment | null>;

  /**
   * Returns the most recent approved comments site-wide as a flat newest-first list.
   * No email. No thread nesting.
   */
  listRecentApproved(limit: number): Promise<PublicComment[]>;

  /** Returns all pending comments across all slugs (CLI use). */
  listPending(): Promise<Comment[]>;

  /** Sets status to approved. Returns null if not found. */
  approve(id: string): Promise<Comment | null>;

  /** Sets status to spam. Returns null if not found. */
  setSpam(id: string): Promise<Comment | null>;

  /** Soft-deletes: sets status to trash. Returns null if not found. */
  setTrash(id: string): Promise<Comment | null>;

  /** Hard-deletes the row. Returns true if deleted, false if not found. */
  delete(id: string): Promise<boolean>;

  /**
   * Paginated list filtered by status (or "all" for no status filter).
   * Newest-first (createdAt DESC). page is 1-based; total/totalPages reflect the filter.
   */
  listByStatus(
    status: CommentStatus | "all",
    page: number,
    pageSize: number
  ): Promise<{ comments: Comment[]; total: number; totalPages: number }>;

  /** Returns counts per status in a single round-trip (zero-filled). */
  countsByStatus(): Promise<CommentStatusCounts>;

  /** Sets status back to pending (unapprove). Returns null if not found. */
  setPending(id: string): Promise<Comment | null>;

  /** Updates the body of an existing comment. Returns true if updated, false if not found. */
  updateBody(id: string, body: string): Promise<boolean>;
}
