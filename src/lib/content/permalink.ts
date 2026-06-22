// Configurable post permalinks (WordPress-style). Single source of truth for
// building a post's URL path from its date + slug under the chosen structure.
//
// Slugs are globally unique (see slug.ts / resolveCollisionSlug), so the date
// segments are purely decorative: a post is always resolvable by its slug
// alone. The catch-all route resolves by the last segment and redirects to the
// canonical path computed here.

/** Supported permalink presets. The `/blog` prefix is kept for every preset. */
export const PERMALINK_STRUCTURES = [
  "plain", // /blog/{slug}
  "month-and-name", // /blog/{YYYY}/{MM}/{slug}
  "day-and-name", // /blog/{YYYY}/{MM}/{DD}/{slug}
] as const;

export type PermalinkStructure = (typeof PERMALINK_STRUCTURES)[number];

export const DEFAULT_PERMALINK_STRUCTURE: PermalinkStructure = "plain";

/** Type guard for an untrusted value (config input, frontmatter). */
export function isPermalinkStructure(value: unknown): value is PermalinkStructure {
  return (
    typeof value === "string" &&
    (PERMALINK_STRUCTURES as readonly string[]).includes(value)
  );
}

/** The minimal post shape postPath needs — date (ISO) + slug. */
interface PermalinkPost {
  slug: string;
  date: string;
}

// Matches a leading ISO date ("YYYY-MM-DD", optionally followed by a time).
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Build a post's URL path for the given structure.
 * Always begins with `/blog`. Falls back to the plain `/blog/{slug}` shape when
 * the date is missing or malformed (so a bad date never yields a broken URL).
 */
export function postPath(
  post: PermalinkPost,
  structure: PermalinkStructure
): string {
  const slug = post.slug;
  if (structure === "plain") return `/blog/${slug}`;

  const m = ISO_DATE.exec(post.date ?? "");
  if (!m) return `/blog/${slug}`; // malformed date → plain fallback
  const [, year, month, day] = m;

  switch (structure) {
    case "month-and-name":
      return `/blog/${year}/${month}/${slug}`;
    case "day-and-name":
      return `/blog/${year}/${month}/${day}/${slug}`;
    default:
      return `/blog/${slug}`;
  }
}

/**
 * Extract the post slug from catch-all route segments (everything after /blog).
 * The slug is always the last non-empty segment, independent of structure.
 * Returns null when there is no usable segment.
 */
export function permalinkSlug(segments: string[]): string | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && seg.length > 0) return seg;
  }
  return null;
}
