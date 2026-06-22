// Public API surface for the comments bounded context.

export { getCommentRepository } from "./factory";
export { DrizzleCommentAdapter } from "./drizzle-adapter";
export type { CommentRepository, CommentStatusCounts } from "./ports";
export type {
  Comment,
  PublicComment,
  CommentThread,
  CommentInput,
  CommentStatus,
} from "./types";
export { CommentDepthError, CommentNotFoundError, CommentUnapprovedError } from "./types";
export { CommentSubmissionSchema } from "./validation";
export type { CommentSubmission } from "./validation";
export { parseCommentStatus } from "./status";
