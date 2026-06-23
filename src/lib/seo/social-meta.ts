// Pure builders for Open Graph / Twitter Card metadata fragments.
// Mirrors the JSON-LD module's design: no runtime framework imports (only the
// Metadata *type*), so these stay unit-testable and side-effect free.
//
// These close the gap with Yoast SEO's social output, which emits a complete set
// of og:* / article:* / twitter:* tags on every post — site name, locale,
// author, section, tags, modified time, and the site/author Twitter handles.

import type { Metadata } from "next";
import type { Page, Post, SiteConfig } from "@/lib/content/types";
import { postPath, type PermalinkStructure } from "@/lib/content/permalink";

/**
 * Normalizes a configured Twitter/X handle into the `@handle` form Twitter Cards
 * expect. Accepts a bare handle, a leading `@`, or a full profile URL
 * (twitter.com / x.com). Returns undefined when no usable handle is configured.
 */
export function twitterHandle(social: SiteConfig["social"]): string | undefined {
  const raw = social?.twitter?.trim();
  if (!raw) return undefined;
  const handle = raw
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/\/+$/, "")
    .trim();
  return handle ? `@${handle}` : undefined;
}

/**
 * Builds the Open Graph + Twitter Card metadata fragment for a single blog post.
 * Next.js resolves relative image URLs against `metadataBase` and emits the
 * corresponding og:* / article:* / twitter:* meta tags from these fields.
 *
 * The og:section is the post's first real category (anything other than the
 * default "Uncategorized"), matching Yoast's article:section behavior.
 */
export function buildPostSocialMetadata(
  post: Post,
  siteConfig: SiteConfig,
  structure: PermalinkStructure = "plain"
): Pick<Metadata, "openGraph" | "twitter"> {
  const seoTitle = post.seo?.title?.trim() || post.title;
  const seoDescription = post.seo?.metaDescription?.trim() || post.excerpt;
  const ogImage = post.seo?.ogImage?.trim() || post.coverImage;
  const url = postPath(post, structure);
  const section = post.categories.find(
    (c) => c && c.toLowerCase() !== "uncategorized"
  );
  const handle = twitterHandle(siteConfig.social);

  return {
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      type: "article",
      siteName: siteConfig.title,
      locale: siteConfig.language,
      url,
      publishedTime: post.date,
      // Post has no separate modified field — mirror datePublished (Yoast does the
      // same when no modified date exists), so article:modified_time is present.
      modifiedTime: post.date,
      authors: post.author ? [post.author] : undefined,
      section: section || undefined,
      tags: post.tags.length > 0 ? post.tags : undefined,
      images: ogImage ? [ogImage] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: seoTitle,
      description: seoDescription,
      site: handle,
      creator: handle,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

/**
 * Builds the Open Graph + Twitter Card fragment for a static page. Unlike a post
 * it is an og:type "website" with no article facets, but still carries the site
 * name, locale, and the site/author Twitter handle for full social parity.
 */
export function buildPageSocialMetadata(
  page: Page,
  siteConfig: SiteConfig,
  urlPath: string
): Pick<Metadata, "openGraph" | "twitter"> {
  const seoTitle = page.seo?.title?.trim() || page.title;
  const seoDescription = page.seo?.metaDescription?.trim() || page.excerpt;
  const ogImage = page.seo?.ogImage?.trim();
  const handle = twitterHandle(siteConfig.social);

  return {
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      type: "website",
      siteName: siteConfig.title,
      locale: siteConfig.language,
      url: urlPath,
      images: ogImage ? [ogImage] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: seoTitle,
      description: seoDescription,
      site: handle,
      creator: handle,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}
