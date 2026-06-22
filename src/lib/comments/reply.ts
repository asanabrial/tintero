// Pure helper: builds the CommentInput for an admin reply to a parent comment.
// No DB, no Next.js — unit-testable in isolation.

import type { Comment, CommentInput } from "./types";

export function buildReplyInput(
  parent: Comment,
  adminName: string,
  adminEmail: string,
  body: string
): CommentInput {
  return {
    postSlug: parent.postSlug,
    authorName: adminName,
    authorEmail: adminEmail,
    authorUrl: undefined,
    body,
    parentId: parent.id,
  };
}
