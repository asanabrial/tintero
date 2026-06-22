// Pure status helpers for the comments admin filter — no React/Next/DB imports.
import type { CommentStatus } from "./types";

/**
 * Validates a raw searchParam value into a CommentStatus.
 * undefined / unknown / arrays => undefined (meaning the "All" tab).
 */
export function parseCommentStatus(
  raw: string | string[] | undefined
): CommentStatus | undefined {
  return raw === "pending" || raw === "approved" || raw === "spam" || raw === "trash"
    ? raw
    : undefined;
}
