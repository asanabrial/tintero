"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { notFound } from "next/navigation";
import { verifySession } from "@/lib/auth/dal";
import { getUserRepository } from "@/lib/auth/factory";
import { can } from "@/lib/auth/capabilities";
import { getRevisionRepository } from "@/lib/revisions/factory";
import { getPageWriter } from "@/lib/content";
import { buildRestorePageInput } from "@/lib/revisions/restore-input";

/**
 * Restore a past revision as the current version of the page.
 * verifySession() is the FIRST call — auth guard.
 *
 * - Capability gate: requires pages:edit (authors cannot access pages at all)
 * - Fetches the revision snapshot by id
 * - Maps rawContent via buildRestorePageInput
 * - Writes via updatePage targeting CURRENT slug (not historic revision.slug)
 * - Captures a new revision row (source: admin) from the write
 * - Revalidates cache tags
 * - Redirects to the page edit page
 */
export async function restoreRevisionAction(
  currentSlug: string,
  id: string,
  _formData: FormData
): Promise<void> {
  const session = await verifySession();

  // Capability gate: pages have no author ownership; gate on pages:edit (authors cannot edit pages)
  if (!can(session.role, "pages:edit")) {
    redirect("/admin");
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
    redirect(`/admin/pages/${currentSlug}/revisions`);
  }
  if (!rev) {
    notFound();
  }

  // Map rawContent → UpdatePageInput
  const input = buildRestorePageInput(rev.rawContent);

  // Write to CURRENT slug (not historic revision.slug) — spec: Restore targets current slug
  await getPageWriter().updatePage(currentSlug, input, {
    source: "admin",
    authorId: session.userId,
    authorLabel,
  });

  // Revalidate cache tags BEFORE redirect
  updateTag("pages");
  updateTag(`page:${currentSlug}`);

  redirect(`/admin/pages/${currentSlug}/edit`);
}
