import { connection } from "next/server";
import { getRecentFeedPosts, renderRssResponse } from "@/lib/rss/feed-data";

export async function GET(): Promise<Response> {
  await connection();
  return renderRssResponse(await getRecentFeedPosts());
}
