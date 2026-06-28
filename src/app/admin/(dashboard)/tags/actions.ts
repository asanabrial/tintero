"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getRepository, getWriter } from "@/lib/content";
import { buildTagIndex, slugifyTag } from "@/lib/content/tag";
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
 * Discriminated union for all tag taxonomy actions.
 * - { ok: true }  — success (action issues redirect; island never sees this)
 * - { ok: false } — validation error or partial write failure; island renders inline
 * - undefined     — initial state before first submission
 */
export type TaxonomyActionState =
  | { ok: true }
  | { ok: false; error?: string; report?: TaxonomyReport }
  | undefined;

// ============================================================
// createTagAction
// ============================================================

/**
 * Create a new standalone tag in the taxonomy registry.
 * verifySession() + can() guard first (ADR-4, spec Authentication Guard).
 * On success: updateTag("tags") BEFORE redirect (ADR-4 ordering).
 */
export async function createTagAction(
  _prev: TaxonomyCreateState,
  formData: FormData
): Promise<TaxonomyCreateState> {
  const session = await verifySession();
  if (!can(session.role, "tags:manage")) {
    return { ok: false, field: "general", error: "admin.errors.noPermission" };
  }

  const label = ((formData.get("label") as string | null) ?? "").trim();
  const description = ((formData.get("description") as string | null) ?? "").trim() || undefined;

  if (!label) {
    return { ok: false, field: "label", error: "admin.errors.labelRequired" };
  }

  const result = await getTaxonomyRegistryWriter().addTerm("tag", label, description);

  if (!result.ok) {
    if (result.error.kind === "duplicate") {
      return { ok: false, field: "label", error: "admin.errors.duplicateLabelTag" };
    }
    return { ok: false, field: "general", error: "admin.errors.createFailedTag" };
  }

  updateTag("tags");
  redirect("/admin/tags");
}

// ============================================================
// renameTagAction
// ============================================================

/**
 * Rename a tag term across all post frontmatter.
 * Validates: newValue must not be whitespace-only (D10).
 * On full success → redirect to /admin/tags.
 * On any failure → return { ok: false, report } inline.
 */
export async function renameTagAction(
  prevState: TaxonomyActionState,
  formData: FormData
): Promise<TaxonomyActionState> {
  const session = await verifySession();
  if (!can(session.role, "tags:manage")) {
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
    "tags",
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
    redirect("/admin/tags");
  }

  return { ok: false, report };
}

// ============================================================
// mergeTagAction
// ============================================================

/**
 * Merge a tag term into an existing target term.
 * Validates: target must exist in the current includeDrafts index (D6).
 * On full success → redirect to /admin/tags.
 * On any failure → return { ok: false, report } inline.
 */
export async function mergeTagAction(
  prevState: TaxonomyActionState,
  formData: FormData
): Promise<TaxonomyActionState> {
  const session = await verifySession();
  if (!can(session.role, "tags:manage")) {
    return { ok: false, error: "admin.errors.noPermission" };
  }

  const value = (formData.get("value") as string | null) ?? "";
  const target = (formData.get("target") as string | null) ?? "";

  const { posts } = await getRepository().listPosts({
    includeDrafts: true,
    pageSize: 9999,
  });

  // Validate target exists in the current index (D6)
  const tags = buildTagIndex(posts.map((p) => p.tags));
  const targetExists = tags.some(
    (t) => t.label.trim().toLowerCase() === target.trim().toLowerCase()
  );
  if (!targetExists) {
    return { ok: false, error: "admin.errors.targetNotFoundTag" };
  }

  const report = await applyTaxonomyOp(
    getWriter(),
    posts,
    "tags",
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
    redirect("/admin/tags");
  }

  return { ok: false, report };
}

// ============================================================
// deleteTagAction
// ============================================================

/**
 * Delete a tag term from all post frontmatter.
 * Plain server form action (no useActionState island).
 * Empty tags result → [] (D5 — handled automatically by removeFromArray).
 * Redirects to /admin/tags on all paths.
 */
export async function deleteTagAction(
  rawValue: string,
  _formData: FormData
): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "tags:manage")) {
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
    "tags",
    rawValue,
    { kind: "delete" }
  );

  // Also remove the registry entry if present — graceful no-op when absent.
  const registrySlug = slugifyTag(rawValue);
  await getTaxonomyRegistryWriter().removeTerm("tag", registrySlug);

  updateTag("posts");
  updateTag("tags");
  updateTag("categories");
  for (const slug of report.rewritten) {
    updateTag(`post:${slug}`);
  }

  redirect("/admin/tags");
}
