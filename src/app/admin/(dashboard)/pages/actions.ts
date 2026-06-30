"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getUserRepository } from "@/lib/auth/factory";
import { getPageWriter } from "@/lib/content";
import { parseSelectedSlugs } from "./_components/parse-selected-slugs";

export type PageFormState =
  | { error?: string }
  | undefined;

/** Read the Yoast-style SEO override fields from the page editor form. */
function readSeoFromForm(formData: FormData): {
  title?: string;
  metaDescription?: string;
  focusKeyphrase?: string;
  canonical?: string;
  noindex?: boolean;
  ogImage?: string;
  cornerstone?: boolean;
} {
  const title = ((formData.get("seoTitle") as string | null) ?? "").trim();
  const metaDescription = ((formData.get("metaDescription") as string | null) ?? "").trim();
  const focusKeyphrase = ((formData.get("focusKeyphrase") as string | null) ?? "").trim();
  const canonical = ((formData.get("canonical") as string | null) ?? "").trim();
  const noindex = formData.get("noindex") === "on";
  const ogImage = ((formData.get("ogImage") as string | null) ?? "").trim();
  const cornerstone = formData.get("cornerstone") === "on";
  return {
    title: title || undefined,
    metaDescription: metaDescription || undefined,
    focusKeyphrase: focusKeyphrase || undefined,
    canonical: canonical || undefined,
    noindex: noindex || undefined,
    ogImage: ogImage || undefined,
    cornerstone: cornerstone || undefined,
  };
}

// ============================================================
// createPageAction
// ============================================================

/**
 * Server Action: create a new page.
 * verifySession() is the FIRST call — spec Authentication Guard.
 */
export async function createPageAction(
  prevState: PageFormState,
  formData: FormData
): Promise<PageFormState> {
  const session = await verifySession();

  if (!can(session.role, "pages:create")) {
    return { error: "admin.errors.noPermission" };
  }

  // Resolve author label for revision context — best-effort, DB may be unavailable
  let authorLabel: string | null = null;
  try {
    const user = await getUserRepository().findById(session.userId);
    authorLabel = user?.email ?? null;
  } catch {
    // DB unavailable — proceed without author label
  }

  const title = (formData.get("title") as string | null) ?? "";
  const slug = (formData.get("slug") as string | null) ?? "";
  const excerpt = (formData.get("excerpt") as string | null) ?? "";
  const body = (formData.get("body") as string | null) ?? "";
  const statusRaw = (formData.get("status") as string | null) ?? "published";
  const status = (statusRaw === "draft" || statusRaw === "published") ? statusRaw : "published";
  const parentRaw = (formData.get("parent") as string | null) ?? "";
  const menuOrderRaw = (formData.get("menuOrder") as string | null) ?? "0";
  const menuOrder = parseInt(menuOrderRaw, 10) || 0;

  // Default date is computed at REQUEST TIME — NOT at module scope.
  // Per spec: default date is the request-time date; must not be hoisted/cached.
  // (server-no-shared-module-state: request-time date must live inside the async fn)
  const dateRaw = (formData.get("date") as string | null) ?? "";
  const date = dateRaw || new Date().toISOString().slice(0, 10);

  const result = await getPageWriter().createPage({
    title,
    slug: slug || undefined,
    date,
    status,
    excerpt: excerpt || undefined,
    body,
    parent: parentRaw || undefined,
    menuOrder,
    seo: readSeoFromForm(formData),
  }, { source: "admin", authorId: session.userId, authorLabel });

  if (!result.ok) {
    const { kind } = result.error;
    const messages: Record<string, string> = {
      invalid_frontmatter: `Validation failed: ${"issues" in result.error ? result.error.issues : "invalid input"}`,
      invalid_slug: "Invalid slug — use only lowercase letters, numbers, and hyphens.",
      slug_collision: "That slug is already taken. Please choose a different one.",
      page_not_found: "Page not found.",
      post_not_found: "Post not found.",
    };
    return { error: messages[kind] ?? "An unexpected error occurred." };
  }

  const { slug: newSlug } = result;

  // ALL updateTag calls MUST precede redirect() — redirect() throws internally
  // and any code after it is unreachable. (ADR-4 ordering rule)
  updateTag("pages");
  updateTag(`page:${newSlug}`);
  redirect("/admin/pages");
}

// ============================================================
// updatePageAction
// ============================================================

/**
 * Server Action: update an existing page.
 * verifySession() is the FIRST call — spec Authentication Guard.
 * currentSlug is bound via .bind(null, slug) at the call site.
 */
export async function updatePageAction(
  currentSlug: string,
  prevState: PageFormState,
  formData: FormData
): Promise<PageFormState> {
  const session = await verifySession();

  if (!can(session.role, "pages:edit")) {
    return { error: "admin.errors.noPermission" };
  }

  // Resolve author label for revision context — best-effort, DB may be unavailable
  let authorLabel: string | null = null;
  try {
    const user = await getUserRepository().findById(session.userId);
    authorLabel = user?.email ?? null;
  } catch {
    // DB unavailable — proceed without author label
  }

  if (!currentSlug) {
    return { error: "admin.errors.missingSlug" };
  }

  const title = (formData.get("title") as string | null) ?? "";
  const slug = (formData.get("slug") as string | null) ?? "";
  const date = (formData.get("date") as string | null) ?? "";
  const excerpt = (formData.get("excerpt") as string | null) ?? "";
  const body = (formData.get("body") as string | null) ?? "";
  const statusRaw = (formData.get("status") as string | null) ?? "published";
  const status = (statusRaw === "draft" || statusRaw === "published") ? statusRaw : "published";
  const parentRaw = (formData.get("parent") as string | null) ?? "";
  const menuOrderRaw = (formData.get("menuOrder") as string | null) ?? "0";
  const menuOrder = parseInt(menuOrderRaw, 10) || 0;

  const result = await getPageWriter().updatePage(currentSlug, {
    title,
    slug: slug || undefined,
    date,
    status,
    excerpt: excerpt || undefined,
    body,
    parent: parentRaw || undefined,
    menuOrder,
    seo: readSeoFromForm(formData),
  }, { source: "admin", authorId: session.userId, authorLabel });

  if (!result.ok) {
    const { kind } = result.error;
    const messages: Record<string, string> = {
      invalid_frontmatter: `Validation failed: ${"issues" in result.error ? result.error.issues : "invalid input"}`,
      invalid_slug: "Invalid slug — use only lowercase letters, numbers, and hyphens.",
      slug_collision: "That slug is already taken. Please choose a different one.",
      page_not_found: "Page not found.",
      post_not_found: "Post not found.",
    };
    return { error: messages[kind] ?? "An unexpected error occurred." };
  }

  const { slug: newSlug } = result;

  // ALL updateTag calls MUST precede redirect() — redirect() throws internally
  // and any code after it is unreachable. (ADR-4 ordering rule)
  if (newSlug !== currentSlug) {
    // Slug rename: invalidate BOTH old and new slug tags
    updateTag(`page:${currentSlug}`);
    updateTag(`page:${newSlug}`);
  } else {
    updateTag(`page:${newSlug}`);
  }
  updateTag("pages");
  redirect("/admin/pages");
}

// ============================================================
// quickUpdatePageAction
// ============================================================

/**
 * Server Action: WordPress-style "Quick Edit" for pages — update only Title,
 * Slug, Date, Status, and Order inline, PRESERVING excerpt, body, and parent.
 *
 * Read-merge-write (same reasoning as quickUpdatePostAction): updatePageAction
 * reads `body` from the form and would blank the page content when the quick
 * form omits it, so Quick Edit needs its own action that reconstructs the
 * non-quick fields from the existing page.
 */
export async function quickUpdatePageAction(formData: FormData): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "pages:edit")) return;

  const currentSlug = (formData.get("currentSlug") as string | null) ?? "";
  if (!currentSlug) return;

  const existing = await getPageWriter().readRawPage(currentSlug);
  if (!existing) return;

  const { frontmatter, body } = existing;

  // Resolve author label for revision context — best-effort.
  let authorLabel: string | null = null;
  try {
    const user = await getUserRepository().findById(session.userId);
    authorLabel = user?.email ?? null;
  } catch {
    // DB unavailable — proceed without author label
  }

  // Quick fields.
  const title = (formData.get("title") as string | null)?.trim() || "";
  const slug = (formData.get("slug") as string | null)?.trim() || "";
  const date = (formData.get("date") as string | null) ?? "";
  const statusRaw = (formData.get("status") as string | null) ?? "published";
  const status = statusRaw === "draft" ? "draft" : "published";
  const menuOrder = parseInt((formData.get("menuOrder") as string | null) ?? "", 10) || 0;

  // Preserved fields reconstructed from existing frontmatter.
  const result = await getPageWriter().updatePage(
    currentSlug,
    {
      title,
      slug: slug || undefined,
      date,
      status,
      excerpt: typeof frontmatter.excerpt === "string" ? frontmatter.excerpt : undefined,
      body,
      parent: typeof frontmatter.parent === "string" ? frontmatter.parent : undefined,
      menuOrder,
    },
    { source: "admin", authorId: session.userId, authorLabel }
  );

  if (!result.ok) return;

  const { slug: newSlug } = result;
  if (newSlug !== currentSlug) {
    updateTag(`page:${currentSlug}`);
    updateTag(`page:${newSlug}`);
  } else {
    updateTag(`page:${newSlug}`);
  }
  updateTag("pages");
  redirect("/admin/pages");
}

// ============================================================
// deletePageAction
// ============================================================

/**
 * Server Action: delete a page.
 * verifySession() is the FIRST call — spec Authentication Guard.
 * slug is bound via .bind(null, slug) at the call site.
 */
export async function deletePageAction(slug: string): Promise<void> {
  const session = await verifySession();

  if (!can(session.role, "pages:delete")) {
    redirect("/admin");
    return;
  }

  // Soft-delete: move to trash instead of permanent deletion
  await getPageWriter().trashPage(slug);

  // ALL updateTag calls MUST precede redirect() — redirect() throws internally
  // and any code after it is unreachable. (ADR-4 ordering rule)
  updateTag("pages");
  updateTag(`page:${slug}`);
  redirect("/admin/pages");
}

// ============================================================
// bulkSetPageStatusAction
// ============================================================

/**
 * Server Action: bulk-set page status (published/draft).
 * Fail-closed on pages:edit. ADR-4: all updateTag before redirect.
 */
export async function bulkSetPageStatusAction(formData: FormData): Promise<void> {
  const session = await verifySession();

  if (!can(session.role, "pages:edit")) {
    redirect("/admin");
    return;
  }

  const slugs = parseSelectedSlugs(formData);
  const statusRaw = formData.get("status");
  const status = statusRaw === "published" ? "published" : "draft";

  if (slugs.length > 0) {
    const writer = getPageWriter();
    await Promise.allSettled(slugs.map((s) => writer.setPageStatus(s, status)));
    for (const s of slugs) updateTag(`page:${s}`);
  }

  updateTag("pages");
  redirect("/admin/pages");
}

// ============================================================
// bulkDeletePagesAction
// ============================================================

/**
 * Server Action: bulk-delete pages by slug. Best-effort (Promise.allSettled):
 * partial failures do not block remaining deletions.
 * verifySession() is FIRST (auth guard). Fail-closed on pages:delete.
 * All updateTag calls precede redirect() (ADR-4).
 */
export async function bulkDeletePagesAction(formData: FormData): Promise<void> {
  const session = await verifySession();

  if (!can(session.role, "pages:delete")) {
    redirect("/admin");
    return;
  }

  const slugs = parseSelectedSlugs(formData);

  if (slugs.length > 0) {
    const writer = getPageWriter();
    await Promise.allSettled(slugs.map((s) => writer.trashPage(s)));
    for (const s of slugs) updateTag(`page:${s}`);
  }

  // ALL updateTag calls MUST precede redirect() — redirect() throws internally
  // and any code after it is unreachable. (ADR-4 ordering rule)
  updateTag("pages");
  redirect("/admin/pages");
}

// ============================================================
// restorePageAction
// ============================================================

export async function restorePageAction(slug: string): Promise<void> {
  const session = await verifySession();

  if (!can(session.role, "pages:delete")) {
    redirect("/admin");
    return;
  }

  await getPageWriter().restorePage(slug);

  updateTag("pages");
  updateTag(`page:${slug}`);
  redirect("/admin/pages/trash");
}

// ============================================================
// permanentlyDeletePageAction
// ============================================================

export async function permanentlyDeletePageAction(slug: string): Promise<void> {
  const session = await verifySession();

  if (!can(session.role, "pages:delete")) {
    redirect("/admin");
    return;
  }

  await getPageWriter().permanentlyDeletePage(slug);

  updateTag("pages");
  updateTag(`page:${slug}`);
  redirect("/admin/pages/trash");
}
