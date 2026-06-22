// Pure JSON-LD builder functions — no Next.js or React imports.
// These are called inside 'use cache' blocks (PostBody, RootLayout) so they
// must remain pure compute with no framework dependencies.

import type { Post, SiteConfig } from "@/lib/content/types";
import { postPath, type PermalinkStructure } from "@/lib/content/permalink";

/**
 * Builds a schema.org BlogPosting JSON-LD object for a blog post page.
 * Returns a plain Record — caller serializes with JSON.stringify for injection.
 *
 * Fields omitted intentionally:
 *  - image: Post type has no image field (no conditional needed)
 *  - dateModified: Post type has no updated/modified field
 *  - publisher: out of scope for this change
 */
export function buildArticleJsonLd(
  post: Post,
  siteConfig: SiteConfig,
  base: string,
  structure: PermalinkStructure = "plain"
): Record<string, unknown> {
  // Social/cover image promoted into the schema graph when available.
  const image = post.seo?.ogImage?.trim() || post.coverImage;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.seo?.title?.trim() || post.title,
    description: post.seo?.metaDescription?.trim() || post.excerpt,
    datePublished: post.date,
    // No separate modified field on Post — fall back to published (Yoast does the same).
    dateModified: post.date,
    author: { "@type": "Person", name: post.author },
    // Publisher node (Yoast's schema graph) — the site as an Organization.
    publisher: { "@type": "Organization", name: siteConfig.title, url: base },
    url: `${base}${postPath(post, structure)}`,
    mainEntityOfPage: `${base}${postPath(post, structure)}`,
    ...(image ? { image: [image] } : {}),
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

/**
 * Builds a schema.org BreadcrumbList JSON-LD object (Yoast-style breadcrumbs).
 * Positions are 1-based per the spec.
 */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Computes the breadcrumb trail for a blog post: Home › Blog › [Category] › Post.
 * The category level is included only when the post has a real category
 * (anything other than the default "Uncategorized").
 */
export function buildPostBreadcrumbItems(post: Post, base: string, structure: PermalinkStructure = "plain"): BreadcrumbItem[] {
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

/**
 * Builds a schema.org WebSite JSON-LD object for the root layout.
 * Returns a plain Record — caller serializes with JSON.stringify for injection.
 */
export function buildWebSiteJsonLd(
  siteConfig: SiteConfig,
  base: string
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.title,
    url: base,
    description: siteConfig.description,
  };
}
