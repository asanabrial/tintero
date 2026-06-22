import * as path from "path";

const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/;

/**
 * Convert a title string to a URL-safe slug.
 * Mirrors slugifyTag body shape: trim, lowercase, replace non-alphanumeric runs with "-", strip leading/trailing hyphens.
 */
export function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Returns true if the slug matches the safe charset: lowercase alphanumeric segments separated by single hyphens.
 * Rejects empty strings, uppercase, path separators, double-hyphens, and leading/trailing hyphens.
 */
export function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * Resolves a desired slug against a set of existing slugs.
 * If `desired` is not in `existing`, returns it unchanged.
 * Otherwise appends -2, -3, ... until a free variant is found.
 * Pure function — no filesystem access.
 */
export function resolveCollisionSlug(desired: string, existing: Set<string>): string {
  if (!existing.has(desired)) return desired;
  let counter = 2;
  while (existing.has(`${desired}-${counter}`)) {
    counter++;
  }
  return `${desired}-${counter}`;
}

/**
 * Derive a URL slug from a file path relative to the content root.
 *
 * Rules (in priority order):
 * 1. If frontmatterSlug is provided, use it verbatim.
 * 2. If the path ends in /index.md, use the parent directory name.
 * 3. Strip the .md extension from the filename.
 * 4. Strip a leading YYYY-MM-DD- date prefix.
 */
export function deriveSlug(filePath: string, frontmatterSlug?: string): string {
  if (frontmatterSlug) {
    return frontmatterSlug;
  }

  const normalized = filePath.replace(/\\/g, "/");

  // Folder-based post: path ends with /index.md or is exactly index.md
  if (normalized === "index.md" || normalized.endsWith("/index.md")) {
    const parts = normalized.split("/");
    // The second-to-last part is the folder name
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
    // Fallback (shouldn't happen for well-formed paths)
    return "index";
  }

  const basename = path.basename(normalized, ".md");
  return basename.replace(DATE_PREFIX_RE, "");
}
