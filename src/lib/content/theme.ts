// theme.ts
// PURE core for theme customization. NO fs, NO next/* imports.
// Mirrors the validateSettingsFields testing surface in site-config-writer.ts.

import type { ThemeConfig } from "./types";

/**
 * True if `s` is a safe media URL for logo/favicon:
 * - empty/blank → false (caller treats as UNSET, not an error)
 * - starts with "/uploads/" → true (local media library)
 * - otherwise parseable as http(s) URL → true
 * - javascript:/data:/other protocols/relative non-uploads → false
 * Mirrors isNavHref in schema.ts.
 */
export function isSafeMediaUrl(s: string): boolean {
  if (!s || s.trim() === "") return false;
  const v = s.trim();
  if (v.startsWith("/uploads/")) return true;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// The 5 structured color tokens, in stable emit order.
const COLOR_FIELDS = [
  ["colorPrimary", "--color-primary"],
  ["colorAccent", "--color-accent"],
  ["colorHeaderBg", "--color-header-bg"],
  ["colorHeaderText", "--color-header-text"],
  ["colorText", "--color-text"],
  ["colorBackground", "--color-bg"],
] as const;

// 3-or-6-digit hex. Mirrored in ThemeConfigSchema (schema.ts).
export const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Expands a #abc / #aabbcc hex to a 6-digit lowercase string (no '#'). */
function expandHex(hex: string): string {
  const h = hex.replace(/^#/, "").toLowerCase();
  return h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
}

/**
 * True if a hex color reads as "light" (would carry dark text), using the
 * classic YIQ perceived-brightness formula with a 128 midpoint threshold.
 * Assumes `hex` already matches HEX_COLOR_RE.
 */
export function isLightHex(hex: string): boolean {
  const h = expandHex(hex.trim());
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128;
}

/**
 * Effective color scheme implied by an explicit page-background color.
 *
 * When the operator sets a page background, the site should adopt that scheme
 * for EVERY visitor (authoritative over their OS prefers-color-scheme): a light
 * background ⇒ "light", a dark background ⇒ "dark". Consumed by the layout as a
 * `data-color-scheme` attribute on <html>, which the redefined Tailwind `dark`
 * variant respects (see globals.css).
 *
 * Returns undefined when no valid page background is set — the site then follows
 * the visitor's OS preference exactly as before.
 */
export function themeColorScheme(
  theme?: { colorBackground?: string } | null
): "light" | "dark" | undefined {
  const bg = theme?.colorBackground?.trim();
  if (!bg || !HEX_COLOR_RE.test(bg)) return undefined;
  return isLightHex(bg) ? "light" : "dark";
}

// Curated, web-safe body-font stacks. Key is the only user-supplied value;
// the stack string is read from this static map → no font-family injection vector.
export const FONT_STACKS = {
  system:
    "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  sans: "Arial, Helvetica, 'Liberation Sans', sans-serif",
  serif: "Georgia, Cambria, 'Times New Roman', Times, serif",
  mono: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
  humanist: "'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif",
  rounded:
    "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, sans-serif",
  oldstyle:
    "'Palatino Linotype', Palatino, 'Book Antiqua', 'URW Palladio L', serif",
} as const;

export type FontBodyKey = keyof typeof FONT_STACKS;

/** True only for own keys of FONT_STACKS. hasOwnProperty guard rejects
 *  __proto__/toString/constructor and any unknown/empty value. */
export function isKnownFontKey(s: string): s is FontBodyKey {
  return Object.prototype.hasOwnProperty.call(FONT_STACKS, s);
}

export type ThemeFields = {
  colorPrimary?: string;
  colorAccent?: string;
  colorHeaderBg?: string;
  colorHeaderText?: string;
  colorText?: string;
  colorBackground?: string;
  customCss?: string;
  logo?: string;
  favicon?: string;
  fontBody?: string; // a FONT_STACKS key
  fontHeading?: string; // a FONT_STACKS key
  headerImage?: string; // banner background image for site header
  backgroundImage?: string; // page body background image
  showTagline?: boolean; // show site description under title in header
  headerLayout?: "left" | "center"; // header content alignment
};

/**
 * Escapes characters that could break out of a CSS url("...") context:
 * - `"` → `%22` (prevents premature quote-close)
 * - `)` → `%29` (prevents premature function-close)
 * - newline/carriage-return → `%0A`/`%0D` (prevents CSS rule injection)
 *
 * Values reaching here are already validated by isSafeMediaUrl (only /uploads/
 * paths and https:// URLs pass), so these characters should never appear in
 * practice — this is a defense-in-depth measure.
 */
function escapeCssUrlValue(v: string): string {
  return v
    .replace(/"/g, "%22")
    .replace(/\)/g, "%29")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

/**
 * Builds a ":root{...}" CSS string from ONLY the set color tokens.
 * undefined / {} / all-unset → "". Never emits customCss (that is render-sanitized separately).
 */
export function buildThemeCssVars(theme?: ThemeConfig): string {
  if (!theme) return "";
  const decls: string[] = [];
  for (const [key, cssVar] of COLOR_FIELDS) {
    const v = theme[key];
    if (typeof v === "string" && v.trim() !== "") {
      decls.push(`${cssVar}:${v.trim()}`);
    }
  }
  // Body font: emit --font-body (body rule) AND --font-sans (Tailwind font-sans
  // utilities incl. .prose) so the whole site follows the chosen stack.
  if (theme.fontBody && isKnownFontKey(theme.fontBody)) {
    const stack = FONT_STACKS[theme.fontBody];
    decls.push(`--font-body:${stack}`);
    decls.push(`--font-sans:${stack}`);
  }
  // Heading font: emit ONLY --font-heading (consumed by the h1-h6 globals rule).
  // Deliberately NOT --font-sans/--font-body so headings get a distinct face
  // while body text and Tailwind utilities stay on the body font.
  if (theme.fontHeading && isKnownFontKey(theme.fontHeading)) {
    decls.push(`--font-heading:${FONT_STACKS[theme.fontHeading]}`);
  }
  // Header image: emit --header-image as url("...") so the site-header can
  // consume it via CSS var. The value is already validated by isSafeMediaUrl at
  // write time, but we also escape defensively to prevent url("...") breakout.
  if (theme.headerImage && theme.headerImage.trim() !== "") {
    decls.push(`--header-image:url("${escapeCssUrlValue(theme.headerImage.trim())}")`);
  }
  // Background image: emit --bg-image as url("...") so it can be consumed via
  // CSS var directly in a background-image property. Validation is done at write
  // time (isSafeMediaUrl) so only safe values reach here.
  if (theme.backgroundImage && theme.backgroundImage.trim() !== "") {
    decls.push(`--bg-image:url("${escapeCssUrlValue(theme.backgroundImage.trim())}")`);
  }
  return decls.length ? `:root{${decls.join(";")}}` : "";
}

/**
 * Neutralizes the only real breakout vector when injecting admin CSS into a
 * <style> via dangerouslySetInnerHTML: a literal "</style" sequence that would
 * close the element and allow arbitrary HTML/JS after it. We escape the "<"
 * as the CSS hex escape "\3C " so the bytes stay inert inside CSS context.
 * Case-insensitive (</StYle> etc.). undefined → "".
 */
export function sanitizeCustomCss(css?: string): string {
  if (!css) return "";
  // Replace any "</style" (any case) so it can no longer terminate the element.
  // "\3C " is the CSS escape for "<"; the trailing space terminates the hex escape.
  return css.replace(/<\/style/gi, "\\3C /style");
}

/**
 * Validates raw (unknown) input into ThemeFields.
 * - The 5 color fields: optional; when present (non-empty) must match HEX_COLOR_RE.
 * - customCss: optional passthrough string (sanitized at RENDER time, not here).
 * Empty strings are treated as "unset" (dropped), so clearing a field removes the token.
 * Returns { ok:true, fields } | { ok:false, fieldErrors }.
 */
export function validateThemeFields(
  input: unknown
): { ok: true; fields: ThemeFields } | { ok: false; fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, fieldErrors: { _: ["Input must be an object"] } };
  }
  const raw = input as Record<string, unknown>;
  const fields: ThemeFields = {};

  for (const [key] of COLOR_FIELDS) {
    const v = typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
    if (v === "") continue; // unset → drop
    if (!HEX_COLOR_RE.test(v)) {
      fieldErrors[key] = ["Must be a valid hex color (e.g. #3b82f6 or #fff)."];
    } else {
      fields[key] = v;
    }
  }

  const customCss = typeof raw.customCss === "string" ? raw.customCss : "";
  if (customCss.trim() !== "") fields.customCss = customCss;

  for (const key of ["logo", "favicon", "headerImage", "backgroundImage"] as const) {
    const v = typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
    if (v === "") continue; // unset → drop
    if (!isSafeMediaUrl(v)) {
      fieldErrors[key] = ["Must be a /uploads/ path or an http(s) URL."];
    } else {
      fields[key] = v;
    }
  }

  const fontBody = typeof raw.fontBody === "string" ? raw.fontBody.trim() : "";
  if (fontBody !== "") {
    if (!isKnownFontKey(fontBody)) {
      fieldErrors.fontBody = [
        "Must be one of: system, sans, serif, mono, humanist, rounded, oldstyle.",
      ];
    } else {
      fields.fontBody = fontBody;
    }
  }

  const fontHeading =
    typeof raw.fontHeading === "string" ? raw.fontHeading.trim() : "";
  if (fontHeading !== "") {
    if (!isKnownFontKey(fontHeading)) {
      fieldErrors.fontHeading = [
        "Must be one of: system, sans, serif, mono, humanist, rounded, oldstyle.",
      ];
    } else {
      fields.fontHeading = fontHeading;
    }
  }

  // showTagline: optional boolean; absent or non-boolean → drop (not an error).
  // true → include; false → drop (it's the default, no need to persist).
  if (typeof raw.showTagline === "boolean" && raw.showTagline === true) {
    fields.showTagline = true;
  }

  // headerLayout: optional enum "left" | "center"; absent or "left" → drop (default).
  const headerLayout =
    typeof raw.headerLayout === "string" ? raw.headerLayout.trim() : "";
  if (headerLayout !== "") {
    if (headerLayout !== "left" && headerLayout !== "center") {
      fieldErrors.headerLayout = ['Must be "left" or "center".'];
    } else if (headerLayout === "center") {
      // "left" is the default → drop it; only persist "center"
      fields.headerLayout = "center";
    }
    // "left" → drop (it's the default)
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, fields };
}
