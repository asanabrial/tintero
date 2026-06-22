// Domain types for the comments bounded context.
// No imports from Next.js, React, pg, or pglite — stays ORM-agnostic.

export type CommentStatus = "pending" | "approved" | "spam" | "trash";

/** Full comment row — includes authorEmail (internal use only). */
export interface Comment {
  id: string;
  postSlug: string;
  authorName: string;
  authorEmail: string;
  authorUrl: string | null;
  body: string;
  status: CommentStatus;
  parentId: string | null;
  createdAt: Date;
}

/** Public-facing comment — authorEmail is NEVER included. */
export interface PublicComment {
  id: string;
  postSlug: string;
  authorName: string;
  authorUrl: string | null;
  body: string;
  status: CommentStatus;
  parentId: string | null;
  createdAt: Date;
}

/** Input for creating a new comment. */
export interface CommentInput {
  postSlug: string;
  authorName: string;
  authorEmail: string;
  authorUrl?: string;
  body: string;
  parentId?: string | null;
}

/** A top-level comment with its approved replies. */
export interface CommentThread {
  comment: PublicComment;
  replies: PublicComment[];
}

/** Thrown when a reply depth rule is violated (reply to a reply). */
export class CommentDepthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentDepthError";
  }
}

/** Thrown when the target parent comment does not exist. */
export class CommentNotFoundError extends CommentDepthError {
  constructor(message: string) {
    super(message);
    this.name = "CommentNotFoundError";
  }
}

/** Thrown when the target parent comment exists but is not approved. */
export class CommentUnapprovedError extends CommentDepthError {
  constructor(message: string) {
    super(message);
    this.name = "CommentUnapprovedError";
  }
}
