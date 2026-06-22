// NOTE: Next.js does not allow catch-all segments ([...slug]) to have child routes
// (catch-all must be terminal). This route uses a single [slug] parameter.
// For hierarchical categories (e.g. tech/javascript), URL-encode the slash:
// /blog/categories/tech%2Fjavascript/feed.xml
// The handler decodes the slug so listPosts receives the correct category path.
import { connection } from "next/server";
import { getRepository } from "@/lib/content";
import { getFeedPostsFiltered, renderRssResponse } from "@/lib/rss/feed-data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  await connection();
  const { slug } = await params;
  // Decode URL-encoded slashes for hierarchical categories (tech%2Fjavascript → tech/javascript)
  const category = decodeURIComponent(slug);
  const siteConfig = await getRepository().getSiteConfig();
  const base = siteConfig.baseUrl.replace(/\/$/, "");
  const posts = await getFeedPostsFiltered({ category });
  return renderRssResponse({
    siteConfig,
    base,
    posts,
    feedTitle: `${siteConfig.title} — Posts in ${category}`,
    selfHref: `${base}/blog/categories/${slug}/feed.xml`,
    structure: siteConfig.permalinks?.structure,
  });
}
