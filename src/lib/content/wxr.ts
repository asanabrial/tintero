// WXR (WordPress eXtended RSS) parser — server-side only.
// Pure function: parseWxr NEVER throws; returns { posts, pages, warnings }.
// Deps: fast-xml-parser (XML), turndown + @joplin/turndown-plugin-gfm (HTML→MD).

import { XMLParser } from "fast-xml-parser";
import TurndownService from "turndown";
import { gfm } from "@joplin/turndown-plugin-gfm";
import { slugifyTitle, isSafeSlug, resolveCollisionSlug } from "./slug";

// ============================================================
// Public types
// ============================================================

export interface WxrItem {
  slug: string;
  frontmatter: Record<string, unknown>;
  raw: string;
}

export interface WxrResult {
  posts: WxrItem[];
  pages: WxrItem[];
  warnings: string[];
}

// ============================================================
// Module-level TurndownService (stateless converter — safe at module scope)
// ============================================================

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndown.use(gfm);

// ============================================================
// Module-level XMLParser (fast-xml-parser v5 config)
// ============================================================

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: false, // preserve "wp:post_name", "content:encoded", etc.
  parseTagValue: false,  // no number coercion on slugs/dates
  trimValues: true,
  cdataPropName: "#cdata", // CDATA captured; str() unwraps it
  isArray: (name: string) => name === "item" || name === "category",
});

// ============================================================
// Type-safety helpers (no `any`)
// ============================================================

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // fast-xml-parser CDATA / mixed node: { "#cdata": "...", "#text": "..." }
  const o = v as Record<string, unknown>;
  if (typeof o["#cdata"] === "string") return o["#cdata"] as string;
  if (typeof o["#text"] === "string") return o["#text"] as string;
  return "";
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

// ============================================================
// htmlToMarkdown — exported for testing
// ============================================================

export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  try {
    return turndown.turndown(html).trim();
  } catch {
    return html;
  }
}

// ============================================================
// Supported post types
// ============================================================

const SUPPORTED_TYPES = new Set(["post", "page"]);

// ============================================================
// parseWxr — main export
// ============================================================

export function parseWxr(xml: string): WxrResult {
  const posts: WxrItem[] = [];
  const pages: WxrItem[] = [];
  const warnings: string[] = [];
  const takenPost = new Set<string>();
  const takenPage = new Set<string>();

  // Outer try/catch — NEVER throws
  let tree: unknown;
  try {
    tree = parser.parse(xml);
  } catch (err) {
    return {
      posts,
      pages,
      warnings: [
        `XML parse error: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  const channel = rec(rec(rec(tree)["rss"])["channel"]);
  // isArray config forces item to always be an array; asArray is defensive backup
  const items = asArray(channel["item"]);

  if (items.length === 0) {
    warnings.push("No <item> elements found in WXR channel");
  }

  for (const rawItem of items) {
    const item = rec(rawItem);
    const postType = str(item["wp:post_type"]).trim() || "post";
    const title = str(item["title"]).trim();

    if (!SUPPORTED_TYPES.has(postType)) {
      warnings.push(
        `Skipped "${title || "(untitled)"}" — unsupported post_type "${postType}"`
      );
      continue;
    }

    if (!title) {
      warnings.push(`Skipped item with empty <title> (post_type "${postType}")`);
      continue;
    }

    // Slug derivation: wp:post_name if safe, else slugifyTitle
    const wpName = str(item["wp:post_name"]).trim();
    let desired = isSafeSlug(wpName) ? wpName : slugifyTitle(title);
    if (!isSafeSlug(desired)) {
      desired = slugifyTitle(title) || "untitled";
    }
    if (!isSafeSlug(desired)) {
      warnings.push(`Skipped "${title}" — could not derive a safe slug`);
      continue;
    }

    // Date — strict YYYY-MM-DD or fallback "1970-01-01"
    const rawDate = str(item["wp:post_date"]).slice(0, 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : "1970-01-01";

    // Body and excerpt
    const bodyHtml = str(item["content:encoded"]);
    const body = htmlToMarkdown(bodyHtml);
    const excerptHtml = str(item["excerpt:encoded"]);
    const excerpt = excerptHtml
      ? htmlToMarkdown(excerptHtml)
          .replace(/[#*_>`]/g, "")
          .trim()
      : undefined;

    if (postType === "page") {
      const slug = resolveCollisionSlug(desired, takenPage);
      takenPage.add(slug);

      // Warn about WP fields that pages cannot carry
      const dropped: string[] = [];
      if (str(item["wp:status"])) dropped.push("status");
      if (asArray(item["category"]).length > 0) dropped.push("tags/categories");
      if (str(item["dc:creator"])) dropped.push("author");
      if (str(item["wp:comment_status"])) dropped.push("comments");
      if (dropped.length > 0) {
        warnings.push(
          `Page "${title}": dropped WP fields not supported by pages — ${dropped.join(", ")}`
        );
      }

      const fm: Record<string, unknown> = { title, date };
      if (excerpt) fm.excerpt = excerpt;
      pages.push({ slug, frontmatter: fm, raw: body });
    } else {
      const slug = resolveCollisionSlug(desired, takenPost);
      takenPost.add(slug);

      // Split categories by @_domain
      const tags: string[] = [];
      const cats: string[] = [];
      for (const c of asArray(item["category"])) {
        const co = rec(c);
        const domain = str(co["@_domain"]);
        const label = str(co) || str(co["@_nicename"]);
        if (!label) continue;
        if (domain === "post_tag") {
          tags.push(label);
        } else if (domain === "category") {
          cats.push(label);
        }
      }

      const wpStatus = str(item["wp:status"]);
      const status = wpStatus === "publish" ? "published" : "draft";
      const author = str(item["dc:creator"]) || undefined;
      const comments = str(item["wp:comment_status"]) === "open";

      const fm: Record<string, unknown> = {
        title,
        date,
        status,
        tags,
        categories: cats.length > 0 ? cats : ["Uncategorized"],
        comments,
      };
      if (excerpt) fm.excerpt = excerpt;
      if (author) fm.author = author;

      posts.push({ slug, frontmatter: fm, raw: body });
    }
  }

  return { posts, pages, warnings };
}
