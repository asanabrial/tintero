// GET /api/v1/search?q= — public, file-based markdown search (env-free)
//
// NO 'export const dynamic' — connection() at request time makes GET dynamic.
// Uses FilesystemContentAdapter DIRECTLY (not getRepository — avoids 'use cache' bun:test break).
// buildSearchJson is a pure helper testable without connection().

import * as path from "path";
import { connection } from "next/server";
import { FilesystemContentAdapter } from "@/lib/content/fs-adapter";
import { hideFuturePosts } from "@/lib/content/schedule";
import { jsonOk } from "@/lib/api/errors";
import { toPostListJson, type PostListJson } from "@/lib/api/serialize";

function getAdapter(): FilesystemContentAdapter {
  return new FilesystemContentAdapter(path.join(process.cwd(), "content"));
}

/**
 * Builds the search response body. Pure helper — no connection(), testable directly.
 * Empty/whitespace q → empty envelope. Non-empty → filesystem search + hideFuturePosts.
 */
export async function buildSearchJson(q: string): Promise<PostListJson> {
  const query = q.trim();
  if (query === "") {
    return toPostListJson([], { total: 0, page: 1, pageSize: 0 });
  }
  const { posts: raw } = await getAdapter().listPosts({ query, pageSize: 9999 });
  const now = new Date().toISOString().slice(0, 10);
  const posts = hideFuturePosts(raw, now);
  return toPostListJson(posts, { total: posts.length, page: 1, pageSize: posts.length });
}

export async function GET(req: Request): Promise<Response> {
  await connection();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return jsonOk(await buildSearchJson(q));
}
