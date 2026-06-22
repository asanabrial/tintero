import { connection } from "next/server";
import { getRecentFeedPosts, renderAtomResponse } from "@/lib/rss/feed-data";

export async function GET(): Promise<Response> {
  await connection();
  return renderAtomResponse(await getRecentFeedPosts());
}
