"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import {
  getSiteConfigWriter,
  validateThemeFields,
} from "@/lib/content/site-config-writer";
import type { ThemeFields } from "@/lib/content/site-config-writer";

export type AppearanceFormState =
  | { ok: true }
  | { fieldErrors: Record<string, string>; values?: Partial<ThemeFields> }
  | { error: string }
  | undefined;

/**
 * Server Action: update site appearance / theme (writes config/site.yaml).
 * verifySession() is the FIRST call — auth guard.
 * Validate-before-write: any validation failure returns field errors WITHOUT writing.
 * On success: updateTag("site-config") BEFORE redirect() (ADR-4 ordering).
 */
export async function updateAppearanceAction(
  _prev: AppearanceFormState,
  formData: FormData
): Promise<AppearanceFormState> {
  // AUTH GUARD — must be first
  const session = await verifySession();

  if (!can(session.role, "appearance:manage")) {
    return { error: "admin.errors.noPermission" };
  }

  const str = (k: string) =>
    ((formData.get(k) as string | null) ?? "").trim();

  const rawInput = {
    colorPrimary: str("colorPrimary"),
    colorAccent: str("colorAccent"),
    colorHeaderBg: str("colorHeaderBg"),
    colorHeaderText: str("colorHeaderText"),
    colorText: str("colorText"),
    colorBackground: str("colorBackground"),
    customCss: (formData.get("customCss") as string | null) ?? "",
    logo: str("logo"),
    favicon: str("favicon"),
    fontBody: str("fontBody"),
    fontHeading: str("fontHeading"),
    headerImage: str("headerImage"),
    backgroundImage: str("backgroundImage"),
    // Checkbox: present in FormData as "on" when checked, absent when unchecked.
    showTagline: formData.get("showTagline") === "on",
    headerLayout: str("headerLayout"),
  };

  const validation = validateThemeFields(rawInput);
  if (!validation.ok) {
    const fieldErrors: Record<string, string> = {};
    for (const [key, msgs] of Object.entries(validation.fieldErrors)) {
      fieldErrors[key] = msgs[0] ?? "";
    }
    return { fieldErrors };
  }

  const fields: ThemeFields = validation.fields;
  const writeResult = await getSiteConfigWriter().writeTheme(fields);
  if (!writeResult.ok) return { error: `Write failed: ${writeResult.error}` };

  updateTag("site-config");
  redirect("/admin/appearance?saved=1");
}
