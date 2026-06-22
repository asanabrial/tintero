import { connection } from "next/server";
import { getRepository } from "@/lib/content";
import { postPath } from "@/lib/content/permalink";
import { getCommentRepository } from "@/lib/comments/factory";
import { buildRssChannel, toRfc822, type RssItem } from "@/lib/rss";

const COMMENT_FEED_LIMIT = 50;

// Per-post comment RSS feed. Lives at /comments/[slug]/feed.xml — a
// structure-independent URL, so it is unaffected by the configured post
// permalink structure (see lib/content/permalink.ts). The post's own canonical
// URL (built via postPath) is still used for the channel + comment links.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;

  // DB-backed feed: signal that this route must run at request time, not prerender.
  // connection() is the cacheComponents-compatible replacement for `export const dynamic = "force-dynamic"`.
  await connection();

  const content = getRepository();

  // FS-only lookup — returns 404 when the post does not exist (no DB).
  const post = await content.getPost(slug);
  if (!post) {
    return new Response(null, { status: 404 });
  }

  const site = await content.getSiteConfig();
  const base = site.baseUrl.replace(/\/$/, "");
  const structure = site.permalinks?.structure ?? "plain";
  const postUrl = `${base}${postPath(post, structure)}`;

  // DB access is entirely inside the try/catch — safe when DATABASE_URL is absent.
  let items: RssItem[] = [];
  try {
    const threads = await getCommentRepository().listApproved(slug);
    // Flatten BEFORE slice so replies are included in the cap (ADR-2).
    const flat = threads.flatMap((t) => [t.comment, ...t.replies]).slice(0, COMMENT_FEED_LIMIT);
    items = flat.map((c) => {
      const link = `${postUrl}#comment-${c.id}`;
      return {
        title: `Comment by ${c.authorName} on ${post.title}`,
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
      title: `Comments on ${post.title}`,
      link: postUrl,
      description: `Comments on ${post.title}`,
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
