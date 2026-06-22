/**
 * processSubmission — pure, dependency-injected core of the submitComment server action.
 *
 * No imports from Next.js, React, pg, or any framework.
 * All I/O comes through injected deps; all config is passed explicitly.
 * This function is fully unit-testable with a stub repository.
 *
 * Processing order (REQ-ACTION-03 / REQ-SPAM-04):
 * 1. Honeypot → fake success WITHOUT calling repo.submit
 * 2. Min-time < 3000ms → error
 * 3. Zod validation → fieldErrors
 * 4. Comments-enabled gate (site-wide + per-post) → error
 * 5. Determine moderation status
 * 6. repo.submit (depth guard throws CommentDepthError subtypes)
 * 7. Generic catch → error (caller logs)
 */

import { CommentDepthError, CommentNotFoundError, CommentUnapprovedError } from "./types";
import type { CommentRepository } from "./ports";
import type { CommentsConfig } from "../../lib/content/types";
import { CommentSubmissionSchema } from "./validation";

const MIN_SUBMIT_MS = 3000;

// ────────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Raw form-field values as the action receives them.
 * All values are strings (from FormData) or undefined.
 */
export interface RawCommentData {
  authorName: string | undefined;
  authorEmail: string | undefined;
  authorUrl: string | undefined;
  body: string | undefined;
  parentId: string | undefined | null;
  postSlug: string | undefined;
}

/** Full input bundle passed to processSubmission. */
export interface SubmissionInput {
  /** Value of the honeypot field (empty string when not filled). */
  honeypot: string;
  /** ISO timestamp set server-side when the form was rendered. */
  formStartedAt: string;
  /** Raw form data fields to validate. */
  rawData: RawCommentData;
}

/** Dependencies injected by the server action wrapper. */
export interface SubmissionDeps {
  repo: CommentRepository;
  config: CommentsConfig;
  postCommentsEnabled: boolean;
  /** Injectable clock for unit tests. Defaults to Date.now in production. */
  now: () => number;
}

/** Return type — mirrors CommentActionState from the server action. */
export type SubmissionResult =
  | { status: "success"; pending: boolean }
  | { status: "error"; message?: string; fieldErrors?: Record<string, string[]> };

// ────────────────────────────────────────────────────────────────────────────────
// Core function
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Process a comment submission. Pure function — no side effects except repo.submit.
 * Returns a SubmissionResult; never throws.
 */
export async function processSubmission(
  input: SubmissionInput,
  deps: SubmissionDeps
): Promise<SubmissionResult> {
  const { honeypot, formStartedAt, rawData } = input;
  const { repo, config, postCommentsEnabled, now } = deps;

  // Step 1: Honeypot — silent fake success (REQ-SPAM-01 / REQ-SPAM-02 / S-10)
  if (honeypot !== "") {
    return { status: "success", pending: true };
  }

  // Step 2: Min-time check (REQ-SPAM-03 / S-11)
  if (formStartedAt.trim() !== "") {
    const startTime = Date.parse(formStartedAt);
    if (!isNaN(startTime) && now() - startTime < MIN_SUBMIT_MS) {
      return { status: "error", message: "Submission too fast — please try again." };
    }
  }

  // Step 3: Zod validation (REQ-VAL-01..05 / S-05..09)
  const parseResult = CommentSubmissionSchema.safeParse(rawData);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const key = String(issue.path[0] ?? "global");
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    return { status: "error", fieldErrors };
  }

  const { authorName, authorEmail, authorUrl, body, parentId } = parseResult.data;

  // postSlug is needed for DB write — validate presence separately
  const postSlug = typeof rawData.postSlug === "string" ? rawData.postSlug.trim() : "";
  if (!postSlug) {
    return { status: "error", message: "Failed to save comment — please try again later." };
  }

  // Step 4: Comments-enabled gate (REQ-CFG-05 / REQ-ACTION-04 / S-15 / S-16)
  if (!config.enabled || !postCommentsEnabled) {
    return { status: "error", message: "Comments are disabled for this post." };
  }

  // Step 5: Determine moderation status (REQ-MOD-01)
  const moderation = config.moderation;
  const commentStatus = moderation === "auto" ? "approved" : "pending";

  // Step 6: DB write + depth guard (REQ-ACTION-03 steps 6-7)
  try {
    await repo.submit(
      {
        postSlug,
        authorName,
        authorEmail,
        authorUrl,
        body,
        parentId: parentId ?? null,
      },
      commentStatus
    );

    // Step 7: Return success (REQ-MOD-02 / REQ-ACTION-05)
    return { status: "success", pending: moderation === "manual" };
  } catch (err) {
    // instanceof routing — no string matching (SG-02)
    if (err instanceof CommentNotFoundError) {
      return { status: "error", message: "The comment you are replying to does not exist." };
    }
    if (err instanceof CommentUnapprovedError) {
      return { status: "error", message: "The comment you are replying to is not available." };
    }
    if (err instanceof CommentDepthError) {
      return { status: "error", message: "Replies to replies are not allowed." };
    }
    // Generic DB error — caller (server action) logs to stderr (REQ-FAIL-04)
    return { status: "error", message: "Failed to save comment — please try again later." };
  }
}
