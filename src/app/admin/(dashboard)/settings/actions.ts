"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { getSiteConfigWriter, validateSettingsFields } from "@/lib/content/site-config-writer";
import type { SettingsFields } from "@/lib/content/site-config-writer";

// ============================================================
// Types
// ============================================================

export type SettingsFormState =
  | { ok: true }
  | { fieldErrors: Record<string, string>; values?: Partial<SettingsFields> }
  | { error: string }
  | undefined;

// ============================================================
// updateSettingsAction
// ============================================================

/**
 * Server Action: update site settings (writes config/site.yaml).
 * verifySession() is the FIRST call — spec Authentication Guard.
 * Validate-before-write: any validation failure returns field errors WITHOUT writing.
 * On success: updateTag("site-config") BEFORE redirect() (ADR-4 ordering).
 */
export async function updateSettingsAction(
  _prev: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  // AUTH GUARD — must be first
  const session = await verifySession();

  if (!can(session.role, "settings:manage")) {
    return { error: "admin.errors.noPermission" };
  }

  // ============================================================
  // Parse FormData → raw object for validateSettingsFields
  // ============================================================

  const homepageRaw = ((formData.get("reading.homepage") as string | null) ?? "hero-recent").trim();
  const postsPerPageRaw = (formData.get("reading.posts_per_page") as string | null) ?? "";
  const postsPerPage = parseInt(postsPerPageRaw, 10);
  const staticPage = ((formData.get("reading.static_page") as string | null) ?? "").trim();
  const homepage = (["hero-recent", "latest-posts", "static-page"].includes(homepageRaw)
    ? homepageRaw
    : "hero-recent") as "hero-recent" | "latest-posts" | "static-page";

  const rawInput = {
    title: ((formData.get("title") as string | null) ?? "").trim(),
    description: ((formData.get("description") as string | null) ?? "").trim(),
    baseUrl: ((formData.get("baseUrl") as string | null) ?? "").trim(),
    language: ((formData.get("language") as string | null) ?? "").trim(),
    timezone: ((formData.get("timezone") as string | null) ?? "").trim() || "UTC",
    dateFormat: ((formData.get("dateFormat") as string | null) ?? "").trim() || "long",
    author: {
      name: ((formData.get("author.name") as string | null) ?? "").trim(),
      email: ((formData.get("author.email") as string | null) ?? "").trim() || undefined,
    },
    reading: {
      homepage,
      posts_per_page: isNaN(postsPerPage) ? undefined : postsPerPage,
      static_page: staticPage || undefined,
    },
    comments: {
      enabled: formData.get("comments_enabled") === "on",
      moderation: (["auto", "manual"].includes(
        ((formData.get("comments.moderation") as string | null) ?? "manual").trim()
      )
        ? ((formData.get("comments.moderation") as string | null) ?? "manual").trim()
        : "manual") as "auto" | "manual",
      close_after_days: ((formData.get("comments.close_after_days") as string | null) ?? "0").trim(),
      max_depth: ((formData.get("comments.max_depth") as string | null) ?? "0").trim(),
      per_page: ((formData.get("comments.per_page") as string | null) ?? "0").trim(),
    },
    writing: {
      default_post_status: ((formData.get("writing.default_post_status") as string | null) ?? "draft").trim(),
      default_post_category: ((formData.get("writing.default_post_category") as string | null) ?? "").trim() || undefined,
    },
    permalinks: {
      structure: ((formData.get("permalinks.structure") as string | null) ?? "plain").trim(),
    },
  };

  // ============================================================
  // Shared validation (ADR-7 — same validator as API PUT /settings)
  // ============================================================

  const validation = validateSettingsFields(rawInput);
  if (!validation.ok) {
    // Convert string[] errors to string (admin form state uses Record<string, string>)
    const fieldErrors: Record<string, string> = {};
    for (const [key, msgs] of Object.entries(validation.fieldErrors)) {
      fieldErrors[key] = msgs[0] ?? "";
    }
    return { fieldErrors };
  }

  const fields: SettingsFields = validation.fields;

  // ============================================================
  // Write config (validate-before-write; writer runs write-guard internally)
  // ============================================================

  const writeResult = await getSiteConfigWriter().writeConfig(fields);
  if (!writeResult.ok) {
    return { error: `Write failed: ${writeResult.error}` };
  }

  // ============================================================
  // Cache invalidation BEFORE redirect (ADR-4 ordering)
  // redirect() throws internally — code after it is unreachable
  // ============================================================

  updateTag("site-config");
  redirect("/admin/settings?saved=1");
}
