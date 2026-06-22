import { connection } from "next/server";
import { getRepository } from "@/lib/content";
import { getFeedPostsFiltered, renderRssResponse } from "@/lib/rss/feed-data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ author: string }> }
): Promise<Response> {
  await connection();
  const { author } = await params;
  const siteConfig = await getRepository().getSiteConfig();
  const base = siteConfig.baseUrl.replace(/\/$/, "");
  const posts = await getFeedPostsFiltered({ author });
  return renderRssResponse({
    siteConfig,
    base,
    posts,
    feedTitle: `${siteConfig.title} — Posts by ${author}`,
    selfHref: `${base}/blog/author/${author}/feed.xml`,
    structure: siteConfig.permalinks?.structure,
  });
}
