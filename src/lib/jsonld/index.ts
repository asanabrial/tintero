// Pure JSON-LD builder functions — no Next.js or React imports.
// These are called inside 'use cache' blocks (PostBody, RootLayout) so they
// must remain pure compute with no framework dependencies.
//
// The output mirrors Yoast SEO's connected schema graph: nodes are emitted in a
// single `@graph` array and cross-reference each other by `@id`. The root layout
// emits the site-level graph (WebSite + Organization) on every page; the post
// page emits the page-level graph (WebPage + BreadcrumbList + BlogPosting +
// Person), whose `@id` references resolve against the layout's nodes.

import type { Post, SiteConfig } from "@/lib/content/types";
import { postPath, type PermalinkStructure } from "@/lib/content/permalink";
import { slugifyAuthor } from "@/lib/content/author";

const SCHEMA_CONTEXT = "https://schema.org";

/**
 * Resolves a possibly site-relative URL against the site base.
 * Absolute http(s) URLs pass through unchanged. Structured-data URLs must be
 * absolute and crawlable (Google's guidelines) — unlike OG/Twitter tags, JSON-LD
 * is not resolved against Next's metadataBase.
 */
function toAbsolute(base: string, raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

// ---------------------------------------------------------------------------
// Stable @id helpers — the anchors the graph references resolve against.
// ---------------------------------------------------------------------------

const websiteId = (base: string) => `${base}/#website`;
const organizationId = (base: string) => `${base}/#organization`;
const logoId = (base: string) => `${base}/#logo`;
const personId = (base: string, author: string) =>
  `${base}/#/schema/person/${slugifyAuthor(author)}`;
const webPageId = (pageUrl: string) => `${pageUrl}#webpage`;
const breadcrumbId = (pageUrl: string) => `${pageUrl}#breadcrumb`;
const articleId = (pageUrl: string) => `${pageUrl}#article`;
const primaryImageId = (pageUrl: string) => `${pageUrl}#primaryimage`;

// ---------------------------------------------------------------------------
// Social identity (sameAs)
// ---------------------------------------------------------------------------

// Known social networks whose profile URL can be derived from a bare handle.
// Networks omitted here (e.g. Mastodon — instance-dependent) are only emitted
// when the config value is already a full URL.
const SOCIAL_PROFILE_BASE: Record<string, string> = {
  twitter: "https://x.com/",
  x: "https://x.com/",
  github: "https://github.com/",
  linkedin: "https://www.linkedin.com/in/",
  youtube: "https://www.youtube.com/@",
  instagram: "https://www.instagram.com/",
  facebook: "https://www.facebook.com/",
  bluesky: "https://bsky.app/profile/",
};

/**
 * Builds the schema.org `sameAs` array (absolute social-profile URLs) from the
 * site's configured social handles — the Organization identity links Yoast
 * emits. A value that is already a full URL is used verbatim; a bare handle is
 * expanded only for known networks.
 */
export function socialProfileUrls(social: SiteConfig["social"]): string[] {
  if (!social) return [];
  const urls: string[] = [];
  for (const [key, rawValue] of Object.entries(social)) {
    const value = rawValue?.trim();
    if (!value) continue;
    if (/^https?:\/\//i.test(value)) {
      urls.push(value);
      continue;
    }
    const profileBase = SOCIAL_PROFILE_BASE[key.toLowerCase()];
    if (profileBase) urls.push(`${profileBase}${value.replace(/^@+/, "")}`);
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/**
 * Computes the breadcrumb trail for a blog post: Home › Blog › [Category] › Post.
 * The category level is included only when the post has a real category
 * (anything other than the default "Uncategorized"). Reused by the visible
 * breadcrumb <nav> as well as the BreadcrumbList graph node.
 */
export function buildPostBreadcrumbItems(
  post: Post,
  base: string,
  structure: PermalinkStructure = "plain"
): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [
    { name: "Home", url: base },
    { name: "Blog", url: `${base}/blog` },
  ];
  const category = post.categories.find(
    (c) => c && c.toLowerCase() !== "uncategorized"
  );
  if (category) {
    items.push({
      name: category,
      url: `${base}/blog/categories/${category.toLowerCase()}`,
    });
  }
  items.push({ name: post.title, url: `${base}${postPath(post, structure)}` });
  return items;
}

function breadcrumbNode(items: BreadcrumbItem[], id: string): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    "@id": id,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ---------------------------------------------------------------------------
// Site-level graph nodes (Organization + WebSite)
// ---------------------------------------------------------------------------

function organizationNode(siteConfig: SiteConfig, base: string): Record<string, unknown> {
  const logo = siteConfig.theme?.logo?.trim();
  const sameAs = socialProfileUrls(siteConfig.social);
  return {
    "@type": "Organization",
    "@id": organizationId(base),
    name: siteConfig.title,
    url: base,
    ...(logo
      ? {
          logo: {
            "@type": "ImageObject",
            "@id": logoId(base),
            url: toAbsolute(base, logo),
          },
          image: { "@id": logoId(base) },
        }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

function webSiteNode(siteConfig: SiteConfig, base: string): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": websiteId(base),
    url: base,
    name: siteConfig.title,
    description: siteConfig.description,
    inLanguage: siteConfig.language,
    publisher: { "@id": organizationId(base) },
    // Sitelinks Searchbox (Yoast parity) — points at the site search route, which
    // reads the `s` query parameter. Enables Google to surface a search box.
    potentialAction: [
      {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${base}/blog/search?s={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    ],
  };
}

/**
 * Builds the site-level schema graph (WebSite + Organization) emitted on every
 * page by the root layout. Page-level graphs reference these nodes by `@id`.
 */
export function buildSiteGraph(siteConfig: SiteConfig, base: string): Record<string, unknown> {
  return {
    "@context": SCHEMA_CONTEXT,
    "@graph": [webSiteNode(siteConfig, base), organizationNode(siteConfig, base)],
  };
}

// ---------------------------------------------------------------------------
// Post-level graph (WebPage + BreadcrumbList + BlogPosting + Person)
// ---------------------------------------------------------------------------

/**
 * Builds the connected schema graph for a single blog post page. The WebPage is
 * `isPartOf` the site's WebSite, the BlogPosting is `isPartOf` the WebPage and
 * authored by a Person, and both reference the site Organization as publisher —
 * all by `@id`, matching Yoast's graph topology.
 */
export function buildPostGraph(
  post: Post,
  siteConfig: SiteConfig,
  base: string,
  structure: PermalinkStructure = "plain"
): Record<string, unknown> {
  const pageUrl = `${base}${postPath(post, structure)}`;
  const seoTitle = post.seo?.title?.trim() || post.title;
  const seoDescription = post.seo?.metaDescription?.trim() || post.excerpt;
  const rawImage = post.seo?.ogImage?.trim() || post.coverImage;
  const image = rawImage ? toAbsolute(base, rawImage) : undefined;
  const section = post.categories.find(
    (c) => c && c.toLowerCase() !== "uncategorized"
  );
  const breadcrumbItems = buildPostBreadcrumbItems(post, base, structure);

  const webPage: Record<string, unknown> = {
    "@type": "WebPage",
    "@id": webPageId(pageUrl),
    url: pageUrl,
    name: seoTitle,
    description: seoDescription,
    isPartOf: { "@id": websiteId(base) },
    inLanguage: siteConfig.language,
    datePublished: post.date,
    dateModified: post.date,
    breadcrumb: { "@id": breadcrumbId(pageUrl) },
    ...(image ? { primaryImageOfPage: { "@id": primaryImageId(pageUrl) } } : {}),
  };

  const article: Record<string, unknown> = {
    "@type": "BlogPosting",
    "@id": articleId(pageUrl),
    isPartOf: { "@id": webPageId(pageUrl) },
    mainEntityOfPage: { "@id": webPageId(pageUrl) },
    headline: seoTitle,
    description: seoDescription,
    datePublished: post.date,
    // No separate modified field on Post — fall back to published (Yoast does the same).
    dateModified: post.date,
    author: { "@id": personId(base, post.author) },
    publisher: { "@id": organizationId(base) },
    inLanguage: siteConfig.language,
    ...(section ? { articleSection: section } : {}),
    ...(post.tags.length > 0 ? { keywords: post.tags.join(", ") } : {}),
    ...(image
      ? {
          image: {
            "@type": "ImageObject",
            "@id": primaryImageId(pageUrl),
            url: image,
          },
        }
      : {}),
  };

  const person: Record<string, unknown> = {
    "@type": "Person",
    "@id": personId(base, post.author),
    name: post.author,
    url: `${base}/blog/author/${slugifyAuthor(post.author)}`,
  };

  return {
    "@context": SCHEMA_CONTEXT,
    "@graph": [
      webPage,
      breadcrumbNode(breadcrumbItems, breadcrumbId(pageUrl)),
      article,
      person,
    ],
  };
}

// ---------------------------------------------------------------------------
// Generic page/collection graph (WebPage or CollectionPage + BreadcrumbList)
// ---------------------------------------------------------------------------

export interface PageGraphOptions {
  base: string;
  /** Absolute canonical URL of the page. */
  url: string;
  name: string;
  description?: string;
  language: string;
  /** "WebPage" for content pages, "CollectionPage" for archives/taxonomies. */
  pageType?: "WebPage" | "CollectionPage";
  datePublished?: string;
  dateModified?: string;
  /** Primary image (absolute or site-relative); emitted as a standalone ImageObject. */
  image?: string;
  breadcrumbItems: BreadcrumbItem[];
}

/**
 * Builds a connected graph for any non-article page: a WebPage (or
 * CollectionPage for archives) that `isPartOf` the site WebSite and references
 * its BreadcrumbList by `@id`. Mirrors Yoast's output for pages and term/date
 * archive listings.
 */
export function buildPageGraph(opts: PageGraphOptions): Record<string, unknown> {
  const {
    base,
    url,
    name,
    description,
    language,
    pageType = "WebPage",
    datePublished,
    dateModified,
    image,
    breadcrumbItems,
  } = opts;
  const absImage = image ? toAbsolute(base, image) : undefined;

  const webPage: Record<string, unknown> = {
    "@type": pageType,
    "@id": webPageId(url),
    url,
    name,
    ...(description ? { description } : {}),
    isPartOf: { "@id": websiteId(base) },
    inLanguage: language,
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    breadcrumb: { "@id": breadcrumbId(url) },
    ...(absImage ? { primaryImageOfPage: { "@id": primaryImageId(url) } } : {}),
  };

  const nodes: Array<Record<string, unknown>> = [
    webPage,
    breadcrumbNode(breadcrumbItems, breadcrumbId(url)),
  ];
  if (absImage) {
    nodes.push({ "@type": "ImageObject", "@id": primaryImageId(url), url: absImage });
  }

  return { "@context": SCHEMA_CONTEXT, "@graph": nodes };
}
