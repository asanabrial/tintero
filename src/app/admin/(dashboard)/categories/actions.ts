"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getRepository, getWriter } from "@/lib/content";
import { buildCategoryIndex, slugifyCategory, joinSlug } from "@/lib/content/category";
import { applyTaxonomyOp } from "@/lib/content/taxonomy-apply";
import type { TaxonomyReport } from "@/lib/content/taxonomy-apply";
import { getTaxonomyRegistryWriter } from "@/lib/content/taxonomy-registry-writer";

// ============================================================
// Types
// ============================================================

export type TaxonomyCreateState =
  | { ok: true }
  | { ok: false; field: "label" | "general"; error: string }
  | undefined;

/**
 * Discriminated union for all category taxonomy actions.
 * - { ok: true }  — success (action issues redirect; island never sees this)
 * - { ok: false } — validation error or partial write failure; island renders inline
 * - undefined     — initial state before first submission
 */
export type TaxonomyActionState =
  | { ok: true }
  | { ok: false; error?: string; report?: TaxonomyReport }
  | undefined;

// ============================================================
// createCategoryAction
// ============================================================

/**
 * Create a new standalone category in the taxonomy registry.
 * verifySession() + can() guard first (ADR-4, spec Authentication Guard).
 * On success: updateTag("categories") BEFORE redirect (ADR-4 ordering).
 */
export async function createCategoryAction(
  _prev: TaxonomyCreateState,
  formData: FormData
): Promise<TaxonomyCreateState> {
  const session = await verifySession();
  if (!can(session.role, "categories:manage")) {
    return { ok: false, field: "general", error: "admin.errors.noPermission" };
  }

  const label = ((formData.get("label") as string | null) ?? "").trim();
  const description = ((formData.get("description") as string | null) ?? "").trim() || undefined;

  if (!label) {
    return { ok: false, field: "label", error: "admin.errors.labelRequired" };
  }

  const result = await getTaxonomyRegistryWriter().addTerm("category", label, description);

  if (!result.ok) {
    if (result.error.kind === "duplicate") {
      return { ok: false, field: "label", error: "admin.errors.duplicateLabelCategory" };
    }
    return { ok: false, field: "general", error: "admin.errors.createFailedCategory" };
  }

  updateTag("categories");
  redirect("/admin/categories");
}

// ============================================================
// renameCategoryAction
// ============================================================

/**
 * Rename a category term across all post frontmatter.
 * Validates: newValue must not be whitespace-only (D10).
 * On full success → redirect to /admin/categories.
 * On any failure → return { ok: false, report } inline.
 */
export async function renameCategoryAction(
  prevState: TaxonomyActionState,
  formData: FormData
): Promise<TaxonomyActionState> {
  const session = await verifySession();
  if (!can(session.role, "categories:manage")) {
    return { ok: false, error: "admin.errors.noPermission" };
  }

  const value = (formData.get("value") as string | null) ?? "";
  const newValue = (formData.get("newValue") as string | null) ?? "";

  if (!newValue.trim()) {
    return { ok: false, error: "admin.errors.nameEmpty" };
  }

  const { posts } = await getRepository().listPosts({
    includeDrafts: true,
    pageSize: 9999,
  });

  const report = await applyTaxonomyOp(
    getWriter(),
    posts,
    "categories",
    value,
    { kind: "rename", newValue }
  );

  // Cache invalidation BEFORE redirect (ADR-4/D8) — redirect throws internally
  updateTag("posts");
  updateTag("tags");
  updateTag("categories");
  for (const slug of report.rewritten) {
    updateTag(`post:${slug}`);
  }

  if (report.failed.length === 0) {
    redirect("/admin/categories");
  }

  return { ok: false, report };
}

// ============================================================
// mergeCategoryAction
// ============================================================

/**
 * Merge a category term into an existing target term.
 * Validates: target must exist in the current includeDrafts index (D6).
 * On full success → redirect to /admin/categories.
 * On any failure → return { ok: false, report } inline.
 */
export async function mergeCategoryAction(
  prevState: TaxonomyActionState,
  formData: FormData
): Promise<TaxonomyActionState> {
  const session = await verifySession();
  if (!can(session.role, "categories:manage")) {
    return { ok: false, error: "admin.errors.noPermission" };
  }

  const value = (formData.get("value") as string | null) ?? "";
  const target = (formData.get("target") as string | null) ?? "";

  const { posts } = await getRepository().listPosts({
    includeDrafts: true,
    pageSize: 9999,
  });

  // Validate target exists in the current index (D6)
  const categories = buildCategoryIndex(posts.map((p) => p.categories));
  const targetExists = categories.some(
    (c) => c.label.trim().toLowerCase() === target.trim().toLowerCase()
  );
  if (!targetExists) {
    return { ok: false, error: "admin.errors.targetNotFoundCategory" };
  }

  const report = await applyTaxonomyOp(
    getWriter(),
    posts,
    "categories",
    value,
    { kind: "merge", target }
  );

  updateTag("posts");
  updateTag("tags");
  updateTag("categories");
  for (const slug of report.rewritten) {
    updateTag(`post:${slug}`);
  }

  if (report.failed.length === 0) {
    redirect("/admin/categories");
  }

  return { ok: false, report };
}

// ============================================================
// deleteCategoryAction
// ============================================================

/**
 * Delete a category term from all post frontmatter.
 * Plain server form action (no useActionState island).
 * Redirects to /admin/categories on all paths — partial failure is visible
 * because the term count will drop (admin can re-run).
 */
export async function deleteCategoryAction(
  rawValue: string,
  _formData: FormData
): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "categories:manage")) {
    redirect("/admin");
    return;
  }

  const { posts } = await getRepository().listPosts({
    includeDrafts: true,
    pageSize: 9999,
  });

  const report = await applyTaxonomyOp(
    getWriter(),
    posts,
    "categories",
    rawValue,
    { kind: "delete" }
  );

  // Also remove the registry entry if present — graceful no-op when absent.
  // Derives the slug from the rawValue label to match the registry key.
  const registrySlug = joinSlug(slugifyCategory(rawValue));
  await getTaxonomyRegistryWriter().removeTerm("category", registrySlug);

  updateTag("posts");
  updateTag("tags");
  updateTag("categories");
  for (const slug of report.rewritten) {
    updateTag(`post:${slug}`);
  }

  redirect("/admin/categories");
}
