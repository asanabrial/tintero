// Feed data-fetch helper and render functions.
// Imports the content repository but NEVER calls connection() or constructs framework
// objects — that stays in route handlers so this module is unit-testable.
// R1 lesson (rest-api-expansion): connection()/cacheLife() throw under bun:test.
// ADR-D2: lives in src/lib/rss/ (not route-local) so it is reused across 2 route trees.
// ADR-D3: renderRssResponse / renderAtomResponse extracted here so alias routes are
//         byte-identical to canonical routes via a single shared render function.

import { getRepository, hideFuturePosts } from "@/lib/content";
import type { ContentRepository, ListPostsOptions } from "@/lib/content";
import type { Post, SiteConfig } from "@/lib/content/types";
import { postPath, type PermalinkStructure } from "@/lib/content/permalink";
import {
  buildRssChannel,
  buildAtomFeed,
  toRfc822,
  toAtomDate,
  type RssItem,
  type AtomEntry,
  type AtomFeedMeta,
} from "@/lib/rss";

export const FEED_ITEM_LIMIT = 20;

/**
 * Deterministic epoch string used as the Atom feed-level <updated> fallback
 * when there are no entries. Spec §3 requires this constant (not new Date())
 * so empty feeds are reproducible and cache-stable.
 */
export const ATOM_EPOCH = "1970-01-01T00:00:00Z";

export interface FeedData {
  siteConfig: SiteConfig;
  /** baseUrl with trailing slash stripped. */
  base: string;
  /** Published, future-hidden, capped at FEED_ITEM_LIMIT, newest-first. */
  posts: Post[];
  /** Optional channel title override. Falls back to siteConfig.title when absent. */
  feedTitle?: string;
  /** Optional self-link override. Falls back to `${base}/feed.xml` when absent. */
  selfHref?: string;
  /** Permalink structure for post URLs. Defaults to "plain" when absent. */
  structure?: PermalinkStructure;
}

/**
 * Fetches site config + up to FEED_ITEM_LIMIT published, non-future posts.
 * Mirrors the original feed.xml pagination loop EXACTLY (behavior-preserving).
 * MUST NOT be called under bun:test — use renderRssResponse/renderAtomResponse
 * with hand-built FeedData fixtures instead.
 */
export async function getRecentFeedPosts(): Promise<FeedData> {
  const repo = getRepository();
  const [siteConfig, first] = await Promise.all([
    repo.getSiteConfig(),
    repo.listPosts({ page: 1 }),
  ]);
  const base = siteConfig.baseUrl.replace(/\/$/, "");

  const allPosts = [...first.posts];
  for (let page = 2; page <= first.totalPages && allPosts.length < FEED_ITEM_LIMIT; page++) {
    const result = await repo.listPosts({ page });
    allPosts.push(...result.posts);
  }
  const now = new Date().toISOString().slice(0, 10);
  const posts = hideFuturePosts(allPosts, now).slice(0, FEED_ITEM_LIMIT);

  return { siteConfig, base, posts, structure: siteConfig.permalinks?.structure };
}

/**
 * Renders a FeedData into an RSS 2.0 Response.
 * Post→RssItem mapping + buildRssChannel + RSS headers.
 * selfHref = canonical /feed.xml (ADR-D4: alias routes declare the canonical URL).
 * ADR-5: callers pass RAW text; buildRssChannel escapes internally.
 */
export function renderRssResponse(data: FeedData): Response {
  const { siteConfig, base, posts } = data;

  const items: RssItem[] = posts.map((post) => ({
    title: post.title,
    link: `${base}${postPath(post, data.structure ?? "plain")}`,
    guid: `${base}${postPath(post, data.structure ?? "plain")}`,
    description: post.excerpt,
    pubDate: toRfc822(post.date),
    categories: [...post.categories, ...post.tags],
  }));

  const xml = buildRssChannel(
    {
      title: data.feedTitle ?? siteConfig.title,
      link: `${base}/`,
      description: siteConfig.description,
      language: siteConfig.language,
      selfHref: data.selfHref ?? `${base}/feed.xml`,
    },
    items
  );

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

/**
 * Renders a FeedData into an Atom 1.0 Response.
 * Post→AtomEntry mapping + buildAtomFeed + Atom headers.
 * selfHref = canonical /feed.xml/atom (ADR-D4).
 * ADR-D1: callers pass RAW text; buildAtomFeed escapes internally.
 */
export function renderAtomResponse(data: FeedData): Response {
  const { siteConfig, base, posts } = data;

  const entries: AtomEntry[] = posts.map((post) => ({
    id: `${base}${postPath(post, data.structure ?? "plain")}`,
    title: post.title,
    updated: toAtomDate(post.date),
    summary: post.excerpt,
    content: post.html,
    author: post.author,
    categories: [...post.categories, ...post.tags],
  }));

  const updated =
    entries.length > 0 ? entries[0].updated : ATOM_EPOCH;

  const feedMeta: AtomFeedMeta = {
    id: `${base}/`,
    title: data.feedTitle ?? siteConfig.title,
    updated,
    link: `${base}/`,
    selfHref: data.selfHref ?? `${base}/feed.xml/atom`,
    description: siteConfig.description,
    language: siteConfig.language,
    authorName: siteConfig.author.name,
  };

  const xml = buildAtomFeed(feedMeta, entries);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

/**
 * Fetches published, future-hidden, capped posts for a filtered feed.
 * Pure of connection() — callable from route handlers AND unit tests
 * (pass a FilesystemContentAdapter instance for DI in tests).
 * Mirrors getRecentFeedPosts cap/hide logic.
 *
 * @param filter  - ListPostsOptions filters (category, tag, author, etc.)
 * @param repo    - Optional ContentRepository for DI (defaults to getRepository())
 */
export async function getFeedPostsFiltered(
  filter: ListPostsOptions,
  repo?: ContentRepository
): Promise<Post[]> {
  const repository = repo ?? getRepository();
  const { posts: rawPosts } = await repository.listPosts({ ...filter, pageSize: 9999 });
  const now = new Date().toISOString().slice(0, 10);
  return hideFuturePosts(rawPosts, now).slice(0, FEED_ITEM_LIMIT);
}
