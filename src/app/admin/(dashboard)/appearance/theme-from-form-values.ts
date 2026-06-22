import type { AppearanceFormInitial } from "./appearance-form";
import type { ThemeFields } from "@/lib/content/theme";

/**
 * themeFromFormValues — pure mapping from form state to ThemeFields.
 * Extracted into its own module so it can be unit-tested without pulling in
 * server-only dependencies (appearance-form imports server actions which
 * transitively import server-only).
 *
 * Rules:
 * - Color fields: empty string → omit
 * - logo/favicon/headerImage/backgroundImage: empty → omit
 * - fontBody/fontHeading: empty → omit
 * - showTagline: only include when true
 * - headerLayout: only include when not "left" (since "left" is the default)
 * - customCss: include when non-empty
 */
export function themeFromFormValues(values: AppearanceFormInitial): ThemeFields {
  const theme: ThemeFields = {};

  for (const key of [
    "colorPrimary",
    "colorAccent",
    "colorHeaderBg",
    "colorHeaderText",
    "colorText",
    "colorBackground",
  ] as const) {
    const v = values[key];
    if (v && v.trim() !== "") theme[key] = v.trim();
  }

  for (const key of [
    "logo",
    "favicon",
    "headerImage",
    "backgroundImage",
  ] as const) {
    const v = values[key];
    if (v && v.trim() !== "") theme[key] = v.trim();
  }

  for (const key of ["fontBody", "fontHeading"] as const) {
    const v = values[key];
    if (v && v.trim() !== "") theme[key] = v.trim();
  }

  if (values.showTagline === true) {
    theme.showTagline = true;
  }

  if (values.headerLayout && values.headerLayout !== "left") {
    theme.headerLayout = values.headerLayout as "left" | "center";
  }

  if (values.customCss && values.customCss.trim() !== "") {
    theme.customCss = values.customCss;
  }

  return theme;
}
