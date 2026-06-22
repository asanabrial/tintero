import { connection } from "next/server";
import { getRepository } from "@/lib/content";
import { getCommentRepository } from "@/lib/comments/factory";
import { buildRssChannel, toRfc822, type RssItem } from "@/lib/rss";

const COMMENT_FEED_LIMIT = 50;

export async function GET(): Promise<Response> {
  // DB-backed feed: signal that this route must run at request time, not prerender.
  // connection() is the cacheComponents-compatible replacement for `export const dynamic = "force-dynamic"`.
  await connection();

  const content = getRepository();

  // Both FS reads are independent — run in parallel (async-parallel, Vercel best-practice).
  const [site, list] = await Promise.all([
    content.getSiteConfig(),
    content.listPosts({ pageSize: 9999 }),
  ]);

  const base = site.baseUrl.replace(/\/$/, "");
  // ADR-3: build slug→title Map from a single cached listPosts call
  const titleBySlug = new Map(list.posts.map((p) => [p.slug, p.title]));

  // DB access is entirely inside the try/catch — safe when DATABASE_URL is absent.
  let items: RssItem[] = [];
  try {
    const recent = await getCommentRepository().listRecentApproved(COMMENT_FEED_LIMIT);
    items = recent.map((c) => {
      const postTitle = titleBySlug.get(c.postSlug) ?? c.postSlug;
      const link = `${base}/blog/${c.postSlug}#comment-${c.id}`;
      return {
        title: `Comment by ${c.authorName} on ${postTitle}`,
        link,
        description: c.body, // raw — buildRssChannel escapes (ADR-5)
        pubDate: toRfc822(c.createdAt),
        guid: link,
      };
    });
  } catch {
    // DB unavailable or DATABASE_URL missing → empty feed (ADR-1)
    items = [];
  }

  const xml = buildRssChannel(
    {
      title: `Comments on ${site.title}`,
      link: `${base}/`,
      description: `Recent comments on ${site.title}`,
    },
    items
  );

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=600",
    },
  });
}
