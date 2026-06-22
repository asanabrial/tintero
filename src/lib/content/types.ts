// Domain types for the content layer.
// No imports from Next.js or React — this module must remain framework-agnostic.

export interface ReadingConfig {
  homepage: "hero-recent" | "latest-posts" | "static-page";
  static_page?: string;
  posts_per_page: number;
}

export interface CommentsConfig {
  enabled: boolean;
  moderation: "auto" | "manual";
  /** Close the comment form on posts older than N days (0/absent = never close). */
  close_after_days?: number;
  /** Cap reply nesting (0 = unlimited). */
  max_depth?: number;
  /** Paginate top-level comments (0 = show all). */
  per_page?: number;
}

export interface WritingConfig {
  default_post_status: "published" | "draft";
  default_post_category?: string;
}

export interface Tag {
  slug: string;
  label: string;
  count: number;
  description?: string; // optional human-readable description from the taxonomy registry
}

export interface Category {
  segments: string[]; // e.g. ["tech", "javascript"]
  slug: string; // segments joined with "/" → "tech/javascript"
  label: string; // display label of the last segment, first-occurrence-wins
  count: number; // distinct posts under this prefix (no parent/child double-count)
  depth: number; // segments.length, for indentation in the index
  description?: string; // optional human-readable description from the taxonomy registry
}

export interface ArchivePeriod {
  year: number;
  month: number;
  count: number;
}

export interface NavItem {
  label: string;
  href: string;
  // children is optional; present only at top level.
  // The schema enforces leaf-only at validation time — children cannot have grandchildren.
  children?: NavItem[];
}

export interface ThemeConfig {
  colorPrimary?: string;
  colorAccent?: string;
  colorHeaderBg?: string;
  colorHeaderText?: string;
  colorText?: string;
  colorBackground?: string;
  customCss?: string;
  logo?: string;
  favicon?: string;
  fontBody?: string; // a FONT_STACKS key (validated; see theme.ts)
  fontHeading?: string; // a FONT_STACKS key (validated; see theme.ts)
  headerImage?: string; // banner background image for site header (/uploads/ or https://)
  backgroundImage?: string; // page body background image (/uploads/ or https://)
  showTagline?: boolean; // when true, show site description below title in header
  headerLayout?: "left" | "center"; // header content alignment
}

export interface SiteConfig {
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
  nav: NavItem[];
  footerNav: NavItem[];
  social?: Record<string, string>;
  reading: ReadingConfig;
  comments: CommentsConfig;
  writing?: WritingConfig;
  permalinks?: PermalinksConfig;
  theme?: ThemeConfig;
}

/** Post URL structure (see lib/content/permalink.ts). */
export interface PermalinksConfig {
  structure: "plain" | "month-and-name" | "day-and-name";
}

export interface Post {
  slug: string;
  title: string;
  date: string;
  status: "published" | "draft";
  tags: string[];
  categories: string[];
  excerpt: string;
  html: string;
  comments: boolean;
  sticky: boolean;
  author: string;
  /** UUID of the creating user. Written at create time; absent on pre-RBAC posts. */
  authorId?: string;
  /** Optional featured/cover image URL. A /uploads/ path or an http(s) URL. */
  coverImage?: string;
  visibility: "public" | "private" | "password";
  /** Only present when visibility === "password". */
  password?: string;
  /** Per-content SEO overrides (Yoast-style). Absent fields fall back to title/excerpt. */
  seo?: PostSeo;
}

/** Per-content SEO overrides (mirrors SeoFrontmatter). */
export interface PostSeo {
  title?: string;
  metaDescription?: string;
  focusKeyphrase?: string;
  canonical?: string;
  noindex?: boolean;
  ogImage?: string;
  cornerstone?: boolean;
}

export interface Page {
  slug: string;
  title: string;
  date: string;
  /** Per-content SEO overrides (Yoast-style). Absent fields fall back to title/excerpt. */
  seo?: PostSeo;
  status: "published" | "draft";
  excerpt: string;
  html: string;
  parent?: string;
  menuOrder: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
}
