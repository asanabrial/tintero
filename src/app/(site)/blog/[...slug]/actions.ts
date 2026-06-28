"use server";

import { getCommentRepository } from "@/lib/comments";
import { processSubmission } from "@/lib/comments/submission";
import { loadSiteConfig } from "@/lib/content/site-config";
import { getRepository } from "@/lib/content";
import { hashPostPassword } from "@/lib/content/post-password";

export type CommentActionState =
  | { status: "idle" }
  | { status: "success"; pending: boolean }
  | { status: "error"; message?: string; fieldErrors?: Record<string, string[]> };

/**
 * Thin 'use server' wrapper around processSubmission.
 * Responsibilities here: parse FormData, load config/post, call processSubmission, log generic errors.
 * All processing logic lives in src/lib/comments/submission.ts (pure, unit-testable).
 *
 * Processing order per REQ-ACTION-03 / REQ-SPAM-04:
 * 1. Honeypot check → fake success (no log, no persist)
 * 2. Min-time check → error
 * 3. Zod validation → field errors
 * 4. Comments-enabled gate (config + frontmatter)
 * 5. Determine moderation status
 * 6. DB write with depth guard (instanceof routing — no string matching)
 * 7. Generic catch → error state (never throws)
 */
export async function submitComment(
  prevState: CommentActionState,
  formData: FormData
): Promise<CommentActionState> {
  // Load config + post in parallel (needed for comments-enabled gate in processSubmission)
  const postSlug = String(formData.get("postSlug") ?? "");
  const [siteConfig, post] = await Promise.all([
    loadSiteConfig(),
    postSlug ? getRepository().getPost(postSlug) : Promise.resolve(null),
  ]);

  const result = await processSubmission(
    {
      honeypot: String(formData.get("website") ?? ""),
      formStartedAt: String(formData.get("form_started_at") ?? ""),
      rawData: {
        authorName: formData.get("authorName") as string | undefined,
        authorEmail: formData.get("authorEmail") as string | undefined,
        authorUrl: formData.get("authorUrl") as string | undefined,
        body: formData.get("body") as string | undefined,
        parentId: formData.get("parentId") as string | undefined | null,
        postSlug,
      },
    },
    {
      repo: getCommentRepository(),
      config: siteConfig.comments,
      postCommentsEnabled: post?.comments ?? false,
      now: Date.now,
    }
  );

  // Log unexpected errors to stderr (REQ-FAIL-04) — processSubmission never throws,
  // but we attach a log here at the wrapper layer for observability.
  if (
    result.status === "error" &&
    result.message === "Failed to save comment — please try again later."
  ) {
    console.error("[submitComment] DB error for slug:", postSlug);
  }

  return result;
}

export type UnlockPostState = { error?: string } | undefined;

export async function unlockPostAction(
  prevState: UnlockPostState,
  formData: FormData
): Promise<UnlockPostState> {
  const slug = (formData.get("slug") as string | null) ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  // Return stable error CODES (not English prose) so the client form can
  // localize them — mirrors the login action. Keys live under
  // common.passwordUnlock.* in the i18n catalogs.
  if (!slug) return { error: "invalidRequest" };

  const { getRepository } = await import("@/lib/content");
  const post = await getRepository().getPost(slug, { includeDrafts: true });

  if (!post || post.visibility !== "password") {
    return { error: "invalidRequest" };
  }

  if (!post.password || post.password !== password) {
    return { error: "incorrectPassword" };
  }

  // Scope the unlock cookie + post-unlock redirect to the post's canonical
  // permalink so it works under any configured structure.
  const { postPath } = await import("@/lib/content/permalink");
  const structure = (await loadSiteConfig()).permalinks?.structure ?? "plain";
  const path = postPath(post, structure);

  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.set(`pp_${slug}`, hashPostPassword(password), {
    httpOnly: true,
    path,
    sameSite: "lax",
  });

  const { redirect } = await import("next/navigation");
  redirect(path);
}
