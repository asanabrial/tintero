// site-config-writer.ts
// IMPORTANT: NO imports from 'next/cache' or 'next/headers'.
// Cache invalidation is the Server Action layer's responsibility (ADR-4).

import * as fs from "fs/promises";
import * as path from "path";
import { parse as parseYaml, stringify as yamlStringify } from "yaml";
import { SiteConfigSchema, NavItemSchema, NavLeafSchema } from "./schema";
import type { NavItem } from "./schema";
import type { ThemeFields as ThemeFieldsLocal } from "./theme";
import { isPermalinkStructure } from "./permalink";
import type { PermalinkStructure } from "./permalink";

// ============================================================
// Types
// ============================================================

export type SettingsFields = {
  title: string;
  description: string;
  baseUrl: string;
  language: string;
  timezone?: string;
  dateFormat?: "long" | "medium" | "short" | "iso";
  author: {
    name: string;
    email?: string;
  };
  reading: {
    homepage: "hero-recent" | "latest-posts" | "static-page";
    posts_per_page: number;
    static_page?: string;
  };
  comments: {
    enabled: boolean;
    moderation: "auto" | "manual";
    close_after_days?: number;
    max_depth?: number;
    per_page?: number;
  };
  writing?: {
    default_post_status: "published" | "draft";
    default_post_category?: string;
  };
  permalinks?: {
    structure: PermalinkStructure;
  };
};

// ============================================================
// Pure helpers (no fs, no next/*)
// ============================================================

/**
 * Validates a URL string using the URL constructor.
 * Returns true if the string is a valid URL, false otherwise.
 */
export function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates and coerces a raw (unknown) input object into typed SettingsFields.
 *
 * Shared validator consumed by both the admin Server Action and the API PUT route (ADR-7).
 * Mirrors the validation rules from settings/actions.ts lines 69–115:
 *   - title: required, non-empty
 *   - baseUrl: required, valid URL
 *   - language: required, non-empty
 *   - author.name: required, non-empty
 *   - author.email: optional; when present must contain @ and a dotted domain segment
 *   - reading.posts_per_page: positive integer 1–9999
 *   - reading.static_page: required when reading.homepage === "static-page"
 *   - reading.homepage: defaults to "hero-recent" if missing/invalid
 *   - comments.enabled: defaults to false if missing
 *   - comments.moderation: defaults to "manual" if missing/invalid
 *
 * Returns { ok: true; fields: SettingsFields } or { ok: false; fieldErrors: Record<string, string[]> }.
 * The fieldErrors values are string[] to match the API jsonError extra convention.
 */
export function validateSettingsFields(
  input: unknown
): { ok: true; fields: SettingsFields } | { ok: false; fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, fieldErrors: { _: ["Input must be an object"] } };
  }

  const raw = input as Record<string, unknown>;

  // ---- title ----
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) {
    fieldErrors["title"] = ["Title is required."];
  }

  // ---- description ----
  const description = typeof raw.description === "string" ? raw.description.trim() : "";

  // ---- baseUrl ----
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  if (!baseUrl) {
    fieldErrors["baseUrl"] = ["Base URL is required."];
  } else if (!isValidUrl(baseUrl)) {
    fieldErrors["baseUrl"] = ["Base URL must be a valid URL (e.g. https://example.com)."];
  }

  // ---- language ----
  const language = typeof raw.language === "string" ? raw.language.trim() : "";
  if (!language) {
    fieldErrors["language"] = ["Language is required."];
  }

  // ---- timezone ----
  const timezone = typeof raw.timezone === "string" ? raw.timezone.trim() : "UTC";
  const timezoneValue = timezone || "UTC";

  // ---- dateFormat ----
  const dateFormatRaw = typeof raw.dateFormat === "string" ? raw.dateFormat.trim() : "long";
  const dateFormat = (["long", "medium", "short", "iso"].includes(dateFormatRaw)
    ? dateFormatRaw
    : "long") as "long" | "medium" | "short" | "iso";

  // ---- author ----
  const rawAuthor = raw.author !== null && typeof raw.author === "object" && !Array.isArray(raw.author)
    ? (raw.author as Record<string, unknown>)
    : {};
  const authorName = typeof rawAuthor.name === "string" ? rawAuthor.name.trim() : "";
  if (!authorName) {
    fieldErrors["author.name"] = ["Author name is required."];
  }
  const authorEmailRaw = typeof rawAuthor.email === "string" ? rawAuthor.email.trim() : "";
  const authorEmail: string | undefined = authorEmailRaw === "" ? undefined : authorEmailRaw;
  if (authorEmail !== undefined) {
    const atIdx = authorEmail.indexOf("@");
    const hasDomain = atIdx > 0 && authorEmail.slice(atIdx + 1).includes(".");
    if (!hasDomain) {
      fieldErrors["author.email"] = ["Email must be a valid address (e.g. name@example.com)."];
    }
  }

  // ---- reading ----
  const rawReading = raw.reading !== null && typeof raw.reading === "object" && !Array.isArray(raw.reading)
    ? (raw.reading as Record<string, unknown>)
    : {};
  const homepageRaw = typeof rawReading.homepage === "string" ? rawReading.homepage.trim() : "hero-recent";
  const homepage = (["hero-recent", "latest-posts", "static-page"].includes(homepageRaw)
    ? homepageRaw
    : "hero-recent") as "hero-recent" | "latest-posts" | "static-page";
  const postsPerPageRaw = rawReading.posts_per_page;
  const postsPerPage = typeof postsPerPageRaw === "number"
    ? postsPerPageRaw
    : typeof postsPerPageRaw === "string"
    ? parseFloat(postsPerPageRaw)
    : NaN;
  if (
    isNaN(postsPerPage) ||
    !Number.isInteger(postsPerPage) ||
    postsPerPage < 1 ||
    postsPerPage > 9999
  ) {
    fieldErrors["reading.posts_per_page"] = [
      "Posts per page must be a whole number between 1 and 9999.",
    ];
  }
  const staticPageRaw = typeof rawReading.static_page === "string" ? rawReading.static_page.trim() : "";
  if (homepage === "static-page" && staticPageRaw === "") {
    fieldErrors["reading.static_page"] = [
      "A page slug is required when homepage is set to Static Page.",
    ];
  }

  // ---- comments ----
  const rawComments = raw.comments !== null && typeof raw.comments === "object" && !Array.isArray(raw.comments)
    ? (raw.comments as Record<string, unknown>)
    : {};
  const commentsEnabled = typeof rawComments.enabled === "boolean" ? rawComments.enabled : false;
  const moderationRaw = typeof rawComments.moderation === "string" ? rawComments.moderation.trim() : "manual";
  const moderation = (["auto", "manual"].includes(moderationRaw)
    ? moderationRaw
    : "manual") as "auto" | "manual";
  const closeAfterRaw = rawComments.close_after_days;
  const closeAfterParsed =
    typeof closeAfterRaw === "number"
      ? closeAfterRaw
      : typeof closeAfterRaw === "string"
        ? parseInt(closeAfterRaw, 10)
        : 0;
  const closeAfterDays = Number.isFinite(closeAfterParsed) && closeAfterParsed > 0
    ? Math.floor(closeAfterParsed)
    : 0;

  const maxDepthRaw = rawComments.max_depth;
  const maxDepthParsed =
    typeof maxDepthRaw === "number" ? maxDepthRaw
    : typeof maxDepthRaw === "string" ? parseInt(maxDepthRaw, 10)
    : 0;
  const maxDepth = Number.isFinite(maxDepthParsed) && maxDepthParsed > 0
    ? Math.floor(maxDepthParsed)
    : 0;

  const perPageRaw = rawComments.per_page;
  const perPageParsed =
    typeof perPageRaw === "number" ? perPageRaw
    : typeof perPageRaw === "string" ? parseInt(perPageRaw, 10)
    : 0;
  const perPage = Number.isFinite(perPageParsed) && perPageParsed > 0
    ? Math.floor(perPageParsed)
    : 0;

  // ---- writing ----
  const rawWriting = raw.writing !== null && typeof raw.writing === "object" && !Array.isArray(raw.writing)
    ? (raw.writing as Record<string, unknown>)
    : {};
  const statusRaw = typeof rawWriting.default_post_status === "string" ? rawWriting.default_post_status.trim() : "draft";
  if (statusRaw !== "published" && statusRaw !== "draft") {
    fieldErrors["writing.default_post_status"] = [
      'Default post status must be either "published" or "draft".',
    ];
  }
  const defaultPostStatus = (statusRaw === "published" ? "published" : "draft") as "published" | "draft";
  const categoryRaw = typeof rawWriting.default_post_category === "string" ? rawWriting.default_post_category.trim() : "";
  const defaultPostCategory: string | undefined = categoryRaw === "" ? undefined : categoryRaw;

  // ---- permalinks ----
  const rawPermalinks = raw.permalinks !== null && typeof raw.permalinks === "object" && !Array.isArray(raw.permalinks)
    ? (raw.permalinks as Record<string, unknown>)
    : {};
  const permalinkStructureRaw = typeof rawPermalinks.structure === "string" ? rawPermalinks.structure : "plain";
  const permalinkStructure: PermalinkStructure = isPermalinkStructure(permalinkStructureRaw)
    ? permalinkStructureRaw
    : "plain";

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const fields: SettingsFields = {
    title,
    description,
    baseUrl,
    language,
    timezone: timezoneValue,
    dateFormat,
    author: {
      name: authorName,
      email: authorEmail,
    },
    reading: {
      homepage,
      posts_per_page: postsPerPage,
      ...(homepage === "static-page" ? { static_page: staticPageRaw } : {}),
    },
    comments: {
      enabled: commentsEnabled,
      moderation,
      close_after_days: closeAfterDays,
      max_depth: maxDepth,
      per_page: perPage,
    },
    writing: {
      default_post_status: defaultPostStatus,
      ...(defaultPostCategory !== undefined ? { default_post_category: defaultPostCategory } : {}),
    },
    permalinks: {
      structure: permalinkStructure,
    },
  };

  return { ok: true, fields };
}

/**
 * Merges typed settings fields into the raw parsed YAML object (ADR-1).
 *
 * Starts from `{ ...rawObject }` (the RAW yaml.parse'd object, preserving ALL
 * unknown keys like `nav`, `social`, hand-authored keys) and overlays ONLY the
 * known editable fields via deep-merge for sub-objects.
 *
 * NEVER touches nav, social, or any other unknown key — they survive verbatim
 * from the `{ ...rawObject }` spread.
 */
export function mergeSiteConfig(
  rawObject: Record<string, unknown>,
  fields: SettingsFields
): Record<string, unknown> {
  // Start from raw — preserves nav, social, customKey, and any unknown key
  const merged: Record<string, unknown> = { ...rawObject };

  // Top-level scalars: shallow overwrite
  merged.title = fields.title;
  merged.description = fields.description;
  merged.baseUrl = fields.baseUrl;
  merged.language = fields.language;
  merged.timezone = fields.timezone ?? "UTC";
  merged.dateFormat = fields.dateFormat ?? "long";

  // author: deep-merge (preserve any extra author sub-keys from raw)
  const rawAuthor = (rawObject.author ?? {}) as Record<string, unknown>;
  merged.author = {
    ...rawAuthor,
    name: fields.author.name,
  };
  if (fields.author.email !== undefined && fields.author.email !== "") {
    (merged.author as Record<string, unknown>).email = fields.author.email;
  } else {
    delete (merged.author as Record<string, unknown>).email;
  }

  // reading: deep-merge (preserve extra reading sub-keys; uncomments block on first save)
  const rawReading = (rawObject.reading ?? {}) as Record<string, unknown>;
  merged.reading = {
    ...rawReading,
    homepage: fields.reading.homepage,
    posts_per_page: fields.reading.posts_per_page,
  };
  if (fields.reading.homepage === "static-page" && fields.reading.static_page !== undefined) {
    (merged.reading as Record<string, unknown>).static_page = fields.reading.static_page;
  } else {
    delete (merged.reading as Record<string, unknown>).static_page;
  }

  // comments: deep-merge (preserve extra comments sub-keys)
  const rawComments = (rawObject.comments ?? {}) as Record<string, unknown>;
  merged.comments = {
    ...rawComments,
    enabled: fields.comments.enabled,
    moderation: fields.comments.moderation,
    close_after_days: fields.comments.close_after_days ?? 0,
    max_depth: fields.comments.max_depth ?? 0,
    per_page: fields.comments.per_page ?? 0,
  };

  // writing: deep-merge (preserve extra writing sub-keys); mirrors comments block
  if (fields.writing) {
    const rawWriting = (rawObject.writing ?? {}) as Record<string, unknown>;
    const nextWriting: Record<string, unknown> = {
      ...rawWriting,
      default_post_status: fields.writing.default_post_status,
    };
    if (fields.writing.default_post_category !== undefined && fields.writing.default_post_category !== "") {
      nextWriting.default_post_category = fields.writing.default_post_category;
    } else {
      delete nextWriting.default_post_category;
    }
    merged.writing = nextWriting;
  }

  // permalinks: deep-merge (preserve extra permalinks sub-keys)
  if (fields.permalinks) {
    const rawPermalinks = (rawObject.permalinks ?? {}) as Record<string, unknown>;
    merged.permalinks = {
      ...rawPermalinks,
      structure: fields.permalinks.structure,
    };
  }

  return merged;
}

/**
 * Serializes a merged config object to a YAML string.
 * Wraps yaml.stringify — no new deps (yaml ^2.9 is already in the project).
 */
export function serializeSiteConfig(merged: Record<string, unknown>): string {
  return yamlStringify(merged);
}

/**
 * Parses the raw YAML string, merges with typed fields, runs the SiteConfigSchema
 * safeParse write-guard (output is DISCARDED — only used to gate the write),
 * then serializes the merged object.
 *
 * Returns { ok: true, yaml: string } or { ok: false, error: string }.
 *
 * The write-guard rejects the write if the merged result would fail schema validation,
 * but the WRITTEN content is the merged raw-derived object (NOT the Zod-parsed output),
 * ensuring unknown keys like `nav` are preserved byte-for-byte.
 */
export function roundTripSiteConfig(
  rawYaml: string,
  fields: SettingsFields
): { ok: true; yaml: string } | { ok: false; error: string } {
  // Parse raw YAML (empty string → empty object)
  let rawObject: Record<string, unknown>;
  try {
    const parsed = rawYaml.trim() ? parseYaml(rawYaml) : {};
    rawObject = (parsed ?? {}) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, error: `Failed to parse YAML: ${String(err)}` };
  }

  // Merge
  const merged = mergeSiteConfig(rawObject, fields);

  // Write-guard: SiteConfigSchema.safeParse on merged object.
  // If it fails, do NOT write. If it passes, DISCARD parsed output and serialize `merged`.
  const guard = SiteConfigSchema.safeParse(merged);
  if (!guard.success) {
    const issues = guard.error.issues
      .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Write-guard validation failed: ${issues}` };
  }

  // Serialize the RAW-derived merged object (NOT guard.data — that would strip unknown keys)
  const yaml = serializeSiteConfig(merged);
  return { ok: true, yaml };
}

// ============================================================
// Nav pure helpers (no fs, no next/*)
// ============================================================

/**
 * FormData-compatible interface so reconstructNav is testable without Next/browser APIs.
 * The return type accepts `string | File | null` to be compatible with the browser
 * FormData.get() return type (FormDataEntryValue | null). In reconstructNav we coerce
 * File values to "" (they should never appear for text inputs).
 */
type FormLike = { get(name: string): string | File | null };

/**
 * Returns a new array with the item at `index` swapped with its neighbor
 * in the given direction. Clamps at bounds: first-up and last-down are no-ops
 * returning an unchanged copy. Never mutates the input, never throws.
 */
export function moveItem<T>(arr: readonly T[], index: number, dir: "up" | "down"): T[] {
  const next = [...arr];
  const target = dir === "up" ? index - 1 : index + 1;
  // Clamp: out-of-range index or boundary no-op → return unchanged copy
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) {
    return next;
  }
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Reconstructs the ordered nav array from indexed FormData fields.
 * Reads `nav_count` (hidden input), then iterates 0..(count-1) reading
 * `nav[i][label]` and `nav[i][href]`. Keeps ALL rows (including those with
 * empty strings) — validation happens after reconstruction, not here.
 *
 * For nested items, reads `nav[i][children_count]` and
 * `nav[i][children][j][label]` / `nav[i][children][j][href]`.
 * Empty child rows (both label and href blank) are dropped.
 * If all child rows are blank, the `children` key is absent on the item.
 */
export function reconstructNav(form: FormLike): NavItem[] {
  const countRaw = form.get("nav_count");
  const countStr = typeof countRaw === "string" ? countRaw : "0";
  const count = parseInt(countStr, 10);
  const n = Number.isFinite(count) && count > 0 ? count : 0;
  const out: NavItem[] = [];
  const str = (v: string | File | null): string =>
    typeof v === "string" ? v : "";
  for (let i = 0; i < n; i++) {
    const label = str(form.get(`nav[${i}][label]`)).trim();
    const href = str(form.get(`nav[${i}][href]`)).trim();

    // Parse children
    const childCountRaw = form.get(`nav[${i}][children_count]`);
    const childCountStr =
      typeof childCountRaw === "string" ? childCountRaw : "0";
    const childCount = parseInt(childCountStr, 10);
    const cn =
      Number.isFinite(childCount) && childCount > 0 ? childCount : 0;

    const children: { label: string; href: string }[] = [];
    for (let j = 0; j < cn; j++) {
      const cLabel = str(
        form.get(`nav[${i}][children][${j}][label]`)
      ).trim();
      const cHref = str(
        form.get(`nav[${i}][children][${j}][href]`)
      ).trim();
      // Drop empty rows (both fields blank) — mirror top-level empty handling
      if (cLabel === "" && cHref === "") continue;
      children.push({ label: cLabel, href: cHref });
    }

    const item: NavItem = { label, href };
    if (children.length > 0) {
      item.children = children;
    }
    out.push(item);
  }
  return out;
}

/**
 * ADR-1 nav merge: spreads the raw parsed YAML object and replaces ONLY the
 * `nav` key. ALL other keys (title, description, social, comments, custom keys)
 * survive verbatim.
 */
export function mergeNavConfig(
  rawObject: Record<string, unknown>,
  nav: NavItem[]
): Record<string, unknown> {
  return { ...rawObject, nav };
}

/**
 * Pure round-trip for nav: parses rawYaml → mergeNavConfig → SiteConfigSchema
 * write-guard (output DISCARDED) → serializeSiteConfig(merged).
 *
 * Returns { ok: true, yaml: string } or { ok: false, error: string }.
 * The write-guard rejects if any nav item fails NavItemSchema (via SiteConfigSchema).
 * The WRITTEN content is the merged raw-derived object (NOT guard.data) so unknown
 * keys are preserved.
 */
export function roundTripNavConfig(
  rawYaml: string,
  nav: NavItem[]
): { ok: true; yaml: string } | { ok: false; error: string } {
  // Validate nav items first (fast-path before YAML parse)
  const itemErrors: string[] = [];
  for (let i = 0; i < nav.length; i++) {
    const parsed = NavItemSchema.safeParse(nav[i]);
    if (!parsed.success) {
      const msgs = parsed.error.issues.map((iss) => iss.message).join(", ");
      itemErrors.push(`nav[${i}]: ${msgs}`);
    }
    // Validate children as leaves (NavLeafSchema strips grandchildren by design)
    if (nav[i].children) {
      for (let j = 0; j < (nav[i].children?.length ?? 0); j++) {
        const cparsed = NavLeafSchema.safeParse(nav[i].children![j]);
        if (!cparsed.success) {
          const msgs = cparsed.error.issues.map((iss) => iss.message).join(", ");
          itemErrors.push(`nav[${i}].children[${j}]: ${msgs}`);
        }
      }
    }
  }
  if (itemErrors.length > 0) {
    return { ok: false, error: `Write-guard validation failed: ${itemErrors.join("; ")}` };
  }

  // Parse raw YAML (empty string → empty object)
  let rawObject: Record<string, unknown>;
  try {
    const parsed = rawYaml.trim() ? parseYaml(rawYaml) : {};
    rawObject = (parsed ?? {}) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, error: `Failed to parse YAML: ${String(err)}` };
  }

  // Merge: replace only nav
  const merged = mergeNavConfig(rawObject, nav);

  // Write-guard: SiteConfigSchema.safeParse on merged object.
  // If it fails, do NOT write. If it passes, DISCARD parsed output and serialize `merged`.
  const guard = SiteConfigSchema.safeParse(merged);
  if (!guard.success) {
    const issues = guard.error.issues
      .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Write-guard validation failed: ${issues}` };
  }

  // Serialize the RAW-derived merged object (NOT guard.data — that would strip unknown keys)
  const yaml = serializeSiteConfig(merged);
  return { ok: true, yaml };
}

/**
 * ADR-1 footer nav merge: spreads the raw parsed YAML object and replaces ONLY the
 * `footerNav` key. ALL other keys (nav, title, social, etc.) survive verbatim.
 * An empty footerNav array drops the key entirely (keeps site.yaml clean).
 */
export function mergeFooterNavConfig(
  rawObject: Record<string, unknown>,
  footerNav: NavItem[]
): Record<string, unknown> {
  const merged = { ...rawObject };
  if (footerNav.length === 0) {
    delete merged.footerNav;
  } else {
    merged.footerNav = footerNav;
  }
  return merged;
}

/**
 * Pure round-trip for footerNav: parses rawYaml → mergeFooterNavConfig → SiteConfigSchema
 * write-guard (output DISCARDED) → serializeSiteConfig(merged).
 * Same pattern as roundTripNavConfig. Empty footer nav drops the key.
 */
export function roundTripFooterNavConfig(
  rawYaml: string,
  footerNav: NavItem[]
): { ok: true; yaml: string } | { ok: false; error: string } {
  // Validate items first (fast-path)
  const itemErrors: string[] = [];
  for (let i = 0; i < footerNav.length; i++) {
    const parsed = NavItemSchema.safeParse(footerNav[i]);
    if (!parsed.success) {
      const msgs = parsed.error.issues.map((iss) => iss.message).join(", ");
      itemErrors.push(`footerNav[${i}]: ${msgs}`);
    }
    if (footerNav[i].children) {
      for (let j = 0; j < (footerNav[i].children?.length ?? 0); j++) {
        const cparsed = NavLeafSchema.safeParse(footerNav[i].children![j]);
        if (!cparsed.success) {
          const msgs = cparsed.error.issues.map((iss) => iss.message).join(", ");
          itemErrors.push(`footerNav[${i}].children[${j}]: ${msgs}`);
        }
      }
    }
  }
  if (itemErrors.length > 0) {
    return { ok: false, error: `Write-guard validation failed: ${itemErrors.join("; ")}` };
  }

  let rawObject: Record<string, unknown>;
  try {
    const parsed = rawYaml.trim() ? parseYaml(rawYaml) : {};
    rawObject = (parsed ?? {}) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, error: `Failed to parse YAML: ${String(err)}` };
  }

  const merged = mergeFooterNavConfig(rawObject, footerNav);

  const guard = SiteConfigSchema.safeParse(merged);
  if (!guard.success) {
    const issues = guard.error.issues
      .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Write-guard validation failed: ${issues}` };
  }

  return { ok: true, yaml: serializeSiteConfig(merged) };
}

// ============================================================
// Theme pure helpers (no fs, no next/*) — re-export the validator from theme.ts
// ============================================================
export { validateThemeFields } from "./theme";
export type { ThemeFields } from "./theme";

/**
 * ADR-1 theme merge: spreads the raw parsed YAML object and DEEP-merges the
 * `theme` block, replacing only the validated keys and DROPPING any color key
 * that is now unset (so clearing a field in the form removes the token).
 * customCss is replaced if present, dropped if unset. ALL other top-level keys
 * (title, nav, social, comments, custom keys) survive verbatim.
 */
export function mergeThemeConfig(
  rawObject: Record<string, unknown>,
  fields: ThemeFieldsLocal
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...rawObject };
  const nextTheme: Record<string, unknown> = {};
  const COLOR_KEYS = [
    "colorPrimary",
    "colorAccent",
    "colorHeaderBg",
    "colorHeaderText",
    "colorText",
    "colorBackground",
  ] as const;
  for (const k of COLOR_KEYS) {
    const v = fields[k];
    if (typeof v === "string" && v !== "") nextTheme[k] = v;
  }
  if (typeof fields.customCss === "string" && fields.customCss.trim() !== "") {
    nextTheme.customCss = fields.customCss;
  }
  if (typeof fields.logo === "string" && fields.logo.trim() !== "") {
    nextTheme.logo = fields.logo.trim();
  }
  if (typeof fields.favicon === "string" && fields.favicon.trim() !== "") {
    nextTheme.favicon = fields.favicon.trim();
  }
  if (typeof fields.fontBody === "string" && fields.fontBody.trim() !== "") {
    nextTheme.fontBody = fields.fontBody.trim();
  }
  if (typeof fields.fontHeading === "string" && fields.fontHeading.trim() !== "") {
    nextTheme.fontHeading = fields.fontHeading.trim();
  }
  if (typeof fields.headerImage === "string" && fields.headerImage.trim() !== "") {
    nextTheme.headerImage = fields.headerImage.trim();
  }
  if (typeof fields.backgroundImage === "string" && fields.backgroundImage.trim() !== "") {
    nextTheme.backgroundImage = fields.backgroundImage.trim();
  }
  // showTagline: only persist true; false is the default → drop
  if (fields.showTagline === true) {
    nextTheme.showTagline = true;
  }
  // headerLayout: only persist "center"; "left" is the default → drop
  if (fields.headerLayout === "center") {
    nextTheme.headerLayout = "center";
  }
  if (Object.keys(nextTheme).length === 0) {
    delete merged.theme; // fully-cleared theme → drop the block
  } else {
    merged.theme = nextTheme;
  }
  return merged;
}

/**
 * Pure round-trip for theme: parse rawYaml → mergeThemeConfig → SiteConfigSchema
 * write-guard (output DISCARDED) → serializeSiteConfig(merged).
 */
export function roundTripThemeConfig(
  rawYaml: string,
  fields: ThemeFieldsLocal
): { ok: true; yaml: string } | { ok: false; error: string } {
  let rawObject: Record<string, unknown>;
  try {
    const parsed = rawYaml.trim() ? parseYaml(rawYaml) : {};
    rawObject = (parsed ?? {}) as Record<string, unknown>;
  } catch (err) {
    return { ok: false, error: `Failed to parse YAML: ${String(err)}` };
  }
  const merged = mergeThemeConfig(rawObject, fields);
  const guard = SiteConfigSchema.safeParse(merged);
  if (!guard.success) {
    const issues = guard.error.issues
      .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Write-guard validation failed: ${issues}` };
  }
  return { ok: true, yaml: serializeSiteConfig(merged) };
}

// ============================================================
// FS Seam — FsSiteConfigWriter
// ============================================================

/**
 * FsSiteConfigWriter — injectable FS seam for writing config/site.yaml.
 *
 * Reads the raw file content, round-trips through mergeSiteConfig + safeParse guard,
 * then writes atomically via temp-file + rename (mirrors fs-writer.ts pattern).
 *
 * NO next/* imports here — cache invalidation is the action layer's job (ADR-4).
 */
export class FsSiteConfigWriter {
  constructor(private readonly configPath: string) {}

  async writeConfig(
    fields: SettingsFields
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    // Read existing file; missing file → empty raw (treated as {})
    let rawYaml: string;
    try {
      rawYaml = await fs.readFile(this.configPath, "utf-8");
    } catch {
      rawYaml = "";
    }

    // Round-trip: parse → merge → write-guard → serialize
    const result = roundTripSiteConfig(rawYaml, fields);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    const dir = path.dirname(this.configPath);
    const tmpPath = path.join(dir, ".site.yaml.tmp");

    try {
      await fs.writeFile(tmpPath, result.yaml, "utf-8");
      await fs.rename(tmpPath, this.configPath);
    } catch (err) {
      // Atomic write failed — clean up temp, leave original intact
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup error
      }
      return { ok: false, error: `Write failed: ${String(err)}` };
    }

    return { ok: true };
  }

  /**
   * Writes the theme block atomically to config/site.yaml via ADR-1 raw-merge.
   * Only the `theme` key is replaced — all other keys survive verbatim.
   * A fully-cleared theme (all fields empty) drops the `theme:` block entirely.
   * Returns { ok: false } without writing if validation fails.
   */
  async writeTheme(
    fields: ThemeFieldsLocal
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    let rawYaml: string;
    try {
      rawYaml = await fs.readFile(this.configPath, "utf-8");
    } catch {
      rawYaml = "";
    }
    const result = roundTripThemeConfig(rawYaml, fields);
    if (!result.ok) return { ok: false, error: result.error };

    const dir = path.dirname(this.configPath);
    const tmpPath = path.join(dir, ".site.yaml.tmp");
    try {
      await fs.writeFile(tmpPath, result.yaml, "utf-8");
      await fs.rename(tmpPath, this.configPath);
    } catch (err) {
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup error
      }
      return { ok: false, error: `Write failed: ${String(err)}` };
    }
    return { ok: true };
  }

  /**
   * Writes the nav array atomically to config/site.yaml via ADR-1 raw-merge.
   * Only the `nav` key is replaced — all other keys survive verbatim.
   * Returns { ok: false } without writing if validation fails.
   */
  async writeNav(
    nav: NavItem[]
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    // Read existing file; missing file → empty raw (treated as {})
    let rawYaml: string;
    try {
      rawYaml = await fs.readFile(this.configPath, "utf-8");
    } catch {
      rawYaml = "";
    }

    // Round-trip: validate + parse → merge → write-guard → serialize
    const result = roundTripNavConfig(rawYaml, nav);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    const dir = path.dirname(this.configPath);
    const tmpPath = path.join(dir, ".site.yaml.tmp");

    try {
      await fs.writeFile(tmpPath, result.yaml, "utf-8");
      await fs.rename(tmpPath, this.configPath);
    } catch (err) {
      // Atomic write failed — clean up temp, leave original intact
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup error
      }
      return { ok: false, error: `Write failed: ${String(err)}` };
    }

    return { ok: true };
  }

  /**
   * Writes the footerNav array atomically to config/site.yaml via ADR-1 raw-merge.
   * Only the `footerNav` key is replaced — all other keys survive verbatim.
   * An empty array removes the footerNav key from the file (keeps site.yaml clean).
   * Returns { ok: false } without writing if validation fails.
   */
  async writeFooterNav(
    footerNav: NavItem[]
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    let rawYaml: string;
    try {
      rawYaml = await fs.readFile(this.configPath, "utf-8");
    } catch {
      rawYaml = "";
    }

    const result = roundTripFooterNavConfig(rawYaml, footerNav);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    const dir = path.dirname(this.configPath);
    const tmpPath = path.join(dir, ".site.yaml.tmp");

    try {
      await fs.writeFile(tmpPath, result.yaml, "utf-8");
      await fs.rename(tmpPath, this.configPath);
    } catch (err) {
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup error
      }
      return { ok: false, error: `Write failed: ${String(err)}` };
    }

    return { ok: true };
  }
}

// ============================================================
// Factory
// ============================================================

/**
 * Returns a FsSiteConfigWriter pointing at the production config/site.yaml.
 * NOT cached, NOT wrapped in 'use cache'.
 */
export function getSiteConfigWriter(): FsSiteConfigWriter {
  return new FsSiteConfigWriter(path.join(process.cwd(), "config", "site.yaml"));
}
