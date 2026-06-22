import { z } from "zod";
import { isSafeMediaUrl, type FontBodyKey } from "./theme";

// The enum literals MUST equal the FONT_STACKS keys. This tuple is the single
// source for z.enum; the satisfies assertion makes drift a COMPILE error.
const FONT_BODY_KEYS = [
  "system",
  "sans",
  "serif",
  "mono",
  "humanist",
  "rounded",
  "oldstyle",
] as const satisfies readonly FontBodyKey[];
// Reverse guard: every FontBodyKey must be present in the tuple above.
type _AllKeysCovered = Exclude<
  FontBodyKey,
  (typeof FONT_BODY_KEYS)[number]
> extends never
  ? true
  : ["FONT_BODY_KEYS is missing a FONT_STACKS key"];
const _allKeysCovered: _AllKeysCovered = true;
void _allKeysCovered;

// Per-content SEO overrides (Yoast-style). All optional — absent fields fall
// back to the post's title/excerpt at render time.
export const SeoFrontmatterSchema = z.object({
  /** Overrides the <title> / og:title when set. */
  title: z.string().optional(),
  /** Overrides the meta description / og:description when set. */
  metaDescription: z.string().optional(),
  /** The focus keyphrase the content is optimized for (drives SEO analysis). */
  focusKeyphrase: z.string().optional(),
  /** Canonical URL override (absolute or path). Absent ⇒ self-canonical. */
  canonical: z.string().optional(),
  /** When true, emit robots noindex/nofollow to keep this content out of search. */
  noindex: z.boolean().optional(),
  /** Social share image (og:image / twitter:image). Falls back to the cover image. */
  ogImage: z.string().optional(),
  /** Cornerstone content — held to stricter SEO analysis thresholds. */
  cornerstone: z.boolean().optional(),
});
export type SeoFrontmatter = z.infer<typeof SeoFrontmatterSchema>;

// Zod schema for post frontmatter. Unknown keys are stripped (not an error).
export const PostFrontmatterSchema = z.object({
  title: z.string().min(1),
  date: z.string().date(),
  status: z.enum(["published", "draft"]).default("published"),
  tags: z.array(z.string()).default([]),
  categories: z
    .array(z.string())
    .default(["Uncategorized"])
    .transform((arr) => {
      const trimmed = arr.map((s) => s.trim()).filter((s) => s.length > 0);
      return trimmed.length === 0 ? ["Uncategorized"] : trimmed;
    }),
  excerpt: z.string().optional(),
  coverImage: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(
      z
        .string()
        .refine(isSafeMediaUrl, "Must be a /uploads/ path or an http(s) URL.")
        .optional()
    ),
  slug: z.string().optional(),
  comments: z.boolean().default(true),
  sticky: z.boolean().default(false),
  author: z.string().optional(),
  /** UUID of the creating user. Written at create time; absent on pre-RBAC posts. */
  authorId: z.string().uuid().optional(),
  visibility: z.enum(["public", "private", "password"]).default("public"),
  password: z.string().optional(),
  seo: SeoFrontmatterSchema.optional(),
});

export type PostFrontmatter = z.infer<typeof PostFrontmatterSchema>;

// Zod schema for the reading sub-configuration block.
// Every field is independently defaulted so an absent reading block is backward-compatible.
export const ReadingConfigSchema = z
  .object({
    homepage: z
      .enum(["hero-recent", "latest-posts", "static-page"])
      .default("hero-recent"),
    static_page: z.string().optional(),
    posts_per_page: z.number().int().positive().default(10),
  })
  .refine(
    (r) =>
      r.homepage !== "static-page" ||
      (typeof r.static_page === "string" && r.static_page.trim().length > 0),
    {
      message:
        'reading.static_page is required when reading.homepage is "static-page"',
      path: ["static_page"],
    }
  );

export type ReadingConfigData = z.infer<typeof ReadingConfigSchema>;

// Zod schema for the comments sub-configuration block.
// An absent comments block is backward-compatible (null/undefined treated as {}).
// An invalid comments block yields a validation error (caller handles warn+fallback).
export const CommentsConfigSchema = z.preprocess(
  (v) => v ?? {},
  z.object({
    enabled: z.boolean().default(true),
    moderation: z.enum(["auto", "manual"]).default("manual"),
    // Close the comment form on posts older than N days (0 = never close).
    // Existing comments stay visible; only new submissions are blocked.
    close_after_days: z.coerce.number().int().min(0).default(0),
    max_depth: z.coerce.number().int().min(0).default(0),
    per_page: z.coerce.number().int().min(0).default(0),
  })
);

export type CommentsConfigData = z.infer<typeof CommentsConfigSchema>;

// Zod schema for the writing sub-configuration block.
// An absent writing block is backward-compatible (null/undefined treated as {}).
export const WritingConfigSchema = z.preprocess(
  (v) => v ?? {},
  z.object({
    default_post_status: z.enum(["published", "draft"]).default("draft"),
    default_post_category: z.string().optional(),
  })
);

export type WritingConfigData = z.infer<typeof WritingConfigSchema>;

// Zod schema for the permalinks sub-configuration block.
// `structure` selects the post URL shape (see permalink.ts). An absent block
// is backward-compatible (null/undefined treated as {}) and defaults to "plain".
export const PermalinksConfigSchema = z.preprocess(
  (v) => v ?? {},
  z.object({
    structure: z
      .enum(["plain", "month-and-name", "day-and-name"])
      .default("plain"),
  })
);

export type PermalinksConfigData = z.infer<typeof PermalinksConfigSchema>;

/**
 * Returns true if the string is a valid navigation href:
 * - A site-relative path starting with "/"
 * - An absolute http or https URL
 *
 * Inlined here (not imported from site-config-writer.ts) to avoid a circular dependency.
 */
export function isNavHref(s: string): boolean {
  if (!s) return false;
  if (s.startsWith("/")) return true;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * NavLeafSchema: a leaf nav item with no children.
 * Children in parsed objects are stripped because Zod drops unknown keys by default.
 * This is intentional — grandchildren are not supported.
 */
export const NavLeafSchema = z.object({
  label: z.string().trim().min(1, "Label is required."),
  href: z
    .string()
    .trim()
    .refine(isNavHref, "Href must start with / or be an http(s) URL."),
});

export type NavLeaf = z.infer<typeof NavLeafSchema>;

export const NavItemSchema = z.object({
  label: z.string().trim().min(1, "Label is required."),
  href: z
    .string()
    .trim()
    .refine(isNavHref, "Href must start with / or be an http(s) URL."),
  children: z.array(NavLeafSchema).optional(),
});

export type NavItem = z.infer<typeof NavItemSchema>;

// Zod schema for the optional theme block. All fields optional; an absent block
// is backward-compatible. Color fields validated against the 3/6-digit hex regex.
const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a valid hex color.");

export const ThemeConfigSchema = z.object({
  colorPrimary: hexColor.optional(),
  colorAccent: hexColor.optional(),
  colorHeaderBg: hexColor.optional(),
  colorHeaderText: hexColor.optional(),
  colorText: hexColor.optional(),
  colorBackground: hexColor.optional(),
  customCss: z.string().optional(),
  logo: z
    .string()
    .refine(isSafeMediaUrl, "Must be a /uploads/ path or an http(s) URL.")
    .optional(),
  favicon: z
    .string()
    .refine(isSafeMediaUrl, "Must be a /uploads/ path or an http(s) URL.")
    .optional(),
  fontBody: z.enum(FONT_BODY_KEYS).optional(),
  fontHeading: z.enum(FONT_BODY_KEYS).optional(),
  headerImage: z
    .string()
    .refine(isSafeMediaUrl, "Must be a /uploads/ path or an http(s) URL.")
    .optional(),
  backgroundImage: z
    .string()
    .refine(isSafeMediaUrl, "Must be a /uploads/ path or an http(s) URL.")
    .optional(),
  showTagline: z.boolean().optional(),
  headerLayout: z.enum(["left", "center"]).optional(),
});

export type ThemeConfigData = z.infer<typeof ThemeConfigSchema>;

// Zod schema for site.yaml
export const SiteConfigSchema = z.object({
  title: z.string().default("My Blog"),
  description: z.string().default(""),
  baseUrl: z.string().default("http://localhost:3000"),
  language: z.string().default("en"),
  timezone: z.string().default("UTC"),
  dateFormat: z.enum(["long", "medium", "short", "iso"]).default("long"),
  author: z
    .object({
      name: z.string().default("Author"),
      email: z.string().optional(),
    })
    .default({ name: "Author" }),
  nav: z.array(NavItemSchema).default([]),
  footerNav: z.array(NavItemSchema).default([]),
  social: z.record(z.string(), z.string()).optional(),
  reading: z.preprocess((v) => v ?? {}, ReadingConfigSchema),
  comments: z.preprocess((v) => v ?? {}, CommentsConfigSchema),
  writing: WritingConfigSchema.optional(),
  permalinks: PermalinksConfigSchema.optional(),
  theme: ThemeConfigSchema.optional(),
});

export type SiteConfigData = z.infer<typeof SiteConfigSchema>;

// Zod schema for page frontmatter.
// status defaults to "published" (backward-compatible: old pages without status field parse fine).
// parent and menu_order enable page hierarchy.
export const PageFrontmatterSchema = z.object({
  title: z.string().min(1),
  date: z.string().date(),
  status: z.enum(["published", "draft"]).default("published"),
  excerpt: z.string().optional(),
  slug: z.string().optional(),
  parent: z.string().optional(),
  menu_order: z.number().int().default(0),
  seo: SeoFrontmatterSchema.optional(),
});

export type PageFrontmatter = z.infer<typeof PageFrontmatterSchema>;

/**
 * Parse raw frontmatter data from gray-matter into a validated PageFrontmatter.
 * Returns null and warns to stderr if validation fails — never throws.
 */
export function parsePageFrontmatter(
  raw: unknown,
  filePath: string
): PageFrontmatter | null {
  const result = PageFrontmatterSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
      .join("; ");
    console.warn(`[blog] Skipping "${filePath}": invalid page frontmatter — ${issues}`);
    return null;
  }

  return result.data;
}

/**
 * Parse raw frontmatter data from gray-matter into a validated PostFrontmatter.
 * Returns null and warns to stderr if validation fails — never throws.
 */
export function parsePostFrontmatter(
  raw: unknown,
  filePath: string
): PostFrontmatter | null {
  const result = PostFrontmatterSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
      .join("; ");
    console.warn(`[blog] Skipping "${filePath}": invalid frontmatter — ${issues}`);
    return null;
  }

  return result.data;
}
