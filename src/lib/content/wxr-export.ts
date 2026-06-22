// WXR (WordPress eXtended RSS) exporter — server-side only.
// Pure function: generateWxr takes posts, pages, and site config; returns a WXR 1.2 XML string.
// No I/O, no Date() calls — all dates come from post/page fields.

import type { Post, Page } from "./types";
import { slugifyTag } from "./tag";

// ============================================================
// Public types
// ============================================================

export interface WxrSite {
  title: string;
  description: string;
  baseUrl: string;
  language: string;
}

export interface GenerateWxrInput {
  posts: Post[];
  pages: Page[];
  site: WxrSite;
}

// ============================================================
// XML escaping helpers
// ============================================================

/**
 * Escapes a string for use in an XML text node or attribute value.
 * Replaces & < > " ' with their XML entity references.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wraps text in a CDATA section, neutralizing any embedded `]]>` sequence so it
 * cannot terminate the section early. The standard trick splits `]]>` across two
 * CDATA blocks: `]]]]><![CDATA[>`. Without this, a post body containing `]]>`
 * (e.g. a code block with XML) would corrupt the whole WXR document.
 */
function cdata(text: string): string {
  return `<![CDATA[${text.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/**
 * Formats a YYYY-MM-DD date string into WXR's "YYYY-MM-DD HH:MM:SS" format.
 * The time portion defaults to "00:00:00" when only a date is provided.
 */
function formatWxrDate(date: string): string {
  // Accepts both "YYYY-MM-DD" and "YYYY-MM-DD HH:MM:SS"
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return `${date} 00:00:00`;
  }
  return date;
}

// ============================================================
// Item builders
// ============================================================

function buildPostItem(post: Post, baseUrl: string): string {
  const wpStatus = post.status === "published" ? "publish" : "draft";
  const link = `${baseUrl}/${post.slug}`;

  // Build category and tag nodes
  const catNodes = post.categories
    .map(
      (cat) =>
        `    <category domain="category" nicename="${escapeXml(slugifyTag(cat))}">${cdata(cat)}</category>`
    )
    .join("\n");
  const tagNodes = post.tags
    .map(
      (tag) =>
        `    <category domain="post_tag" nicename="${escapeXml(slugifyTag(tag))}">${cdata(tag)}</category>`
    )
    .join("\n");

  const categoryBlock = [catNodes, tagNodes].filter(Boolean).join("\n");

  return `  <item>
    <title>${escapeXml(post.title)}</title>
    <link>${escapeXml(link)}</link>
    <dc:creator>${escapeXml(post.author ?? "")}</dc:creator>
    <content:encoded>${cdata(post.html)}</content:encoded>
    <excerpt:encoded>${cdata(post.excerpt ?? "")}</excerpt:encoded>
    <wp:post_name>${escapeXml(post.slug)}</wp:post_name>
    <wp:post_type>post</wp:post_type>
    <wp:status>${wpStatus}</wp:status>
    <wp:post_date>${escapeXml(formatWxrDate(post.date))}</wp:post_date>
${categoryBlock ? categoryBlock + "\n" : ""}  </item>`;
}

function buildPageItem(page: Page, baseUrl: string): string {
  const wpStatus = page.status === "published" ? "publish" : "draft";
  const link = `${baseUrl}/${page.slug}`;

  return `  <item>
    <title>${escapeXml(page.title)}</title>
    <link>${escapeXml(link)}</link>
    <dc:creator></dc:creator>
    <content:encoded>${cdata(page.html)}</content:encoded>
    <excerpt:encoded>${cdata(page.excerpt ?? "")}</excerpt:encoded>
    <wp:post_name>${escapeXml(page.slug)}</wp:post_name>
    <wp:post_type>page</wp:post_type>
    <wp:status>${wpStatus}</wp:status>
    <wp:post_date>${escapeXml(formatWxrDate(page.date))}</wp:post_date>
  </item>`;
}

// ============================================================
// generateWxr — main export
// ============================================================

/**
 * Generates a WXR 1.2 XML document from posts, pages, and site metadata.
 *
 * - Pure and deterministic: no I/O, no new Date() calls.
 * - All text nodes are XML-escaped; HTML bodies are wrapped in CDATA.
 * - The output is round-trip compatible with parseWxr().
 */
export function generateWxr(input: GenerateWxrInput): string {
  const { posts, pages, site } = input;

  const postItems = posts.map((p) => buildPostItem(p, site.baseUrl)).join("\n");
  const pageItems = pages.map((p) => buildPageItem(p, site.baseUrl)).join("\n");

  const allItems = [postItems, pageItems].filter(Boolean).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:wp="http://wordpress.org/export/1.2/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/">
  <channel>
    <title>${escapeXml(site.title)}</title>
    <link>${escapeXml(site.baseUrl)}</link>
    <description>${escapeXml(site.description)}</description>
    <language>${escapeXml(site.language)}</language>
    <wp:wxr_version>1.2</wp:wxr_version>
${allItems ? allItems + "\n" : ""}  </channel>
</rss>`;
}
