"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getCommentRepository } from "@/lib/comments";
import { buildReplyInput } from "@/lib/comments/reply";
import { EditCommentBodySchema } from "@/lib/comments/edit-validation";
import { getUserRepository } from "@/lib/auth";
import { loadSiteConfig } from "@/lib/content/site-config";

/** Invalidate the admin comments view AND any post pages that render comment counts. */
function invalidateComments(): void {
  updateTag("comments");
  updateTag("posts");
}

/**
 * Server Action: approve a pending comment.
 * Calls verifySession() FIRST — spec Domain 5 (DAL Authoritative Check).
 */
export async function approveComment(id: string): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "comments:moderate")) {
    redirect("/admin");
    return;
  }
  try {
    await getCommentRepository().approve(id);
    invalidateComments();
  } catch {
    // DB unavailable — spec Domain 6 (DB Unavailable Graceful Handling)
    return;
  }
}

/**
 * Server Action: unapprove (set back to pending).
 * Calls verifySession() FIRST — spec Domain 5 (DAL Authoritative Check).
 */
export async function setPendingComment(id: string): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "comments:moderate")) {
    redirect("/admin");
    return;
  }
  try {
    await getCommentRepository().setPending(id);
    invalidateComments();
  } catch {
    return;
  }
}

/**
 * Server Action: mark a comment as spam.
 * Calls verifySession() FIRST — spec Domain 5 (DAL Authoritative Check).
 */
export async function spamComment(id: string): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "comments:moderate")) {
    redirect("/admin");
    return;
  }
  try {
    await getCommentRepository().setSpam(id);
    invalidateComments();
  } catch {
    return;
  }
}

/**
 * Server Action: hard-delete a comment (Delete Permanently).
 * Only reachable from the Trash view. Calls verifySession() FIRST — spec Domain 5.
 */
export async function deleteComment(id: string): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "comments:moderate")) {
    redirect("/admin");
    return;
  }
  try {
    await getCommentRepository().delete(id);
    invalidateComments();
  } catch {
    return;
  }
}

/**
 * Server Action: soft-delete (move to Trash).
 * Calls verifySession() FIRST — spec Domain 5 (DAL Authoritative Check).
 */
export async function trashComment(id: string): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "comments:moderate")) {
    redirect("/admin");
    return;
  }
  try {
    await getCommentRepository().setTrash(id);
    invalidateComments();
  } catch {
    return;
  }
}

/**
 * Bulk moderation. Mirrors bulkDeletePostsAction:
 * verifySession FIRST -> read action + ids -> Promise.allSettled dispatch ->
 * updateTag (BEFORE redirect, ADR-4) -> redirect.
 */
export async function bulkCommentAction(formData: FormData): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "comments:moderate")) {
    redirect("/admin");
    return;
  }
  const action = formData.get("action");
  const ids = formData
    .getAll("id")
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (ids.length > 0) {
    try {
      const repo = getCommentRepository();
      const run = (id: string): Promise<unknown> => {
        switch (action) {
          case "approve":
            return repo.approve(id);
          case "pending":
            return repo.setPending(id);
          case "spam":
            return repo.setSpam(id);
          case "trash":
            return repo.setTrash(id);
          case "restore":
            return repo.setPending(id);
          case "delete-permanently":
            return repo.delete(id);
          default:
            return Promise.resolve();
        }
      };
      await Promise.allSettled(ids.map(run));
    } catch {
      // DB unavailable — fall through to redirect (graceful)
    }
  }

  // ALL updateTag calls precede redirect() (ADR-4). redirect() throws internally.
  updateTag("comments");
  updateTag("posts");
  redirect("/admin/comments");
}

export type EditCommentActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * Server Action: edit the body of a comment.
 * Bound as editCommentAction.bind(null, comment.id) -> (prevState, formData).
 * verifySession FIRST, then RBAC gate (mirrors replyToCommentAction).
 */
export async function editCommentAction(
  commentId: string,
  _prevState: EditCommentActionState,
  formData: FormData
): Promise<EditCommentActionState> {
  const session = await verifySession();
  if (!can(session.role, "comments:moderate")) {
    redirect("/admin");
  }

  const raw = String(formData.get("body") ?? "").trim();
  // Reuse the edit validation schema
  const parsed = EditCommentBodySchema.safeParse({ body: raw });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid body.";
    return { status: "error", message: msg };
  }

  try {
    const updated = await getCommentRepository().updateBody(commentId, parsed.data.body);
    if (!updated) {
      return { status: "error", message: "Comment not found." };
    }
    invalidateComments();
    return { status: "success" };
  } catch {
    return { status: "error", message: "Could not save the edit — please try again." };
  }
}

export type ReplyActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * Server Action: post an admin reply to an approved top-level comment.
 * Bound as replyToCommentAction.bind(null, comment.id) -> (prevState, formData).
 * verifySession FIRST, then RBAC gate (mirrors spamComment).
 */
export async function replyToCommentAction(
  parentId: string,
  _prevState: ReplyActionState,
  formData: FormData
): Promise<ReplyActionState> {
  const session = await verifySession();
  if (!can(session.role, "comments:moderate")) {
    redirect("/admin");
  }

  const body = String(formData.get("body") ?? "").trim();
  if (body.length < 1) {
    return { status: "error", message: "Reply cannot be empty." };
  }
  if (body.length > 5000) {
    return { status: "error", message: "Reply is too long (max 5000 characters)." };
  }

  try {
    const repo = getCommentRepository();
    const parent = await repo.getById(parentId);
    if (!parent || parent.status !== "approved" || parent.parentId !== null) {
      return {
        status: "error",
        message: "You can only reply to an approved top-level comment.",
      };
    }

    const [siteConfig, adminUser] = await Promise.all([
      loadSiteConfig(),
      getUserRepository().findById(session.userId),
    ]);
    const adminEmail = adminUser?.email ?? "";
    const adminName = siteConfig.author.name?.trim() || adminEmail;

    await repo.submit(buildReplyInput(parent, adminName, adminEmail, body), "approved");

    updateTag("comments");
    updateTag("posts");
    updateTag(`post:${parent.postSlug}`);

    return { status: "success" };
  } catch {
    // DB unavailable or guard violation between read and submit — friendly state, never crash.
    return {
      status: "error",
      message: "Could not post the reply — please try again.",
    };
  }
}
