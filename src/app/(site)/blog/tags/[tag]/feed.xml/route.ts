import { connection } from "next/server";
import { getRepository } from "@/lib/content";
import { getFeedPostsFiltered, renderRssResponse } from "@/lib/rss/feed-data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tag: string }> }
): Promise<Response> {
  await connection();
  const { tag } = await params;
  const siteConfig = await getRepository().getSiteConfig();
  const base = siteConfig.baseUrl.replace(/\/$/, "");
  const posts = await getFeedPostsFiltered({ tag });
  return renderRssResponse({
    siteConfig,
    base,
    posts,
    feedTitle: `${siteConfig.title} — Posts tagged ${tag}`,
    selfHref: `${base}/blog/tags/${tag}/feed.xml`,
    structure: siteConfig.permalinks?.structure,
  });
}
