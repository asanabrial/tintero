"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { getUserRepository } from "@/lib/auth/factory";
import { canEditPost } from "@/lib/auth/capabilities";
import { getRevisionRepository } from "@/lib/revisions/factory";
import { getWriter } from "@/lib/content";
import { buildRestoreInput } from "@/lib/revisions/restore-input";

/**
 * Restore a past revision as the current version of the post.
 * verifySession() is the FIRST call — auth guard.
 *
 * - Ownership gate: reads existing post authorId, checks canEditPost before any mutation
 * - Fetches the revision snapshot by id
 * - Parses rawContent via gray-matter
 * - Writes via updatePost targeting CURRENT slug (not historic revision.slug)
 * - Captures a new revision row (source: admin) from the write
 * - Revalidates cache tags
 * - Redirects to the post edit page
 */
export async function restoreRevisionAction(
  currentSlug: string,
  id: string,
  _formData: FormData
): Promise<void> {
  const session = await verifySession();

  // Ownership gate: read authorId from existing post before any mutation (mirrors updatePostAction)
  const existing = await getWriter().readRaw(currentSlug);
  const postAuthorId = (existing?.frontmatter.authorId as string | undefined) ?? null;
  if (!canEditPost(session.role, postAuthorId, session.userId)) {
    redirect("/admin/posts");
    return;
  }

  // Resolve author label — best-effort
  let authorLabel: string | null = null;
  try {
    const user = await getUserRepository().findById(session.userId);
    authorLabel = user?.email ?? null;
  } catch {
    // DB may be unavailable; proceed without label
  }

  let rev;
  try {
    rev = await getRevisionRepository().getById(id);
  } catch {
    // DB unavailable — redirect back to the revisions list rather than crashing
    redirect(`/admin/posts/${currentSlug}/revisions`);
  }
  if (!rev) {
    notFound();
  }

  // Map rawContent → UpdatePostInput (behavior-preserving extraction)
  const input = buildRestoreInput(rev.rawContent);

  // Write to CURRENT slug (not historic revision.slug) — spec: Restore targets current slug
  await getWriter().updatePost(currentSlug, input, {
    source: "admin",
    authorId: session.userId,
    authorLabel,
  });

  // Revalidate cache tags BEFORE redirect (ADR-4 ordering rule)
  updateTag("posts");
  updateTag(`post:${currentSlug}`);
  updateTag("tags");
  updateTag("categories");

  redirect(`/admin/posts/${currentSlug}/edit`);
}
