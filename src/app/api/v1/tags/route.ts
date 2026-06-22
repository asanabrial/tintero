// GET /api/v1/tags — list all tags (public, markdown-derived, no DB needed)
//
// NO 'export const dynamic' — connection() at request time makes this dynamic automatically.
//
// R1 path: pure-helper — connection() throws outside Next request scope in bun:test,
// and getRepository() uses 'use cache' which also requires Next runtime.
// List-building logic is extracted into buildTagsListJson() using FilesystemContentAdapter
// directly for unit testing. The route handler is a thin wrapper: connection() + helper.

import * as path from "path";
import { connection } from "next/server";
import { FilesystemContentAdapter } from "@/lib/content/fs-adapter";
import { jsonOk } from "@/lib/api/errors";
import { toTagListJson, type TagListJson } from "@/lib/api/serialize";

function getAdapter(): FilesystemContentAdapter {
  return new FilesystemContentAdapter(path.join(process.cwd(), "content"));
}

/**
 * Builds the tags list response body. Pure helper — no connection(), testable directly.
 */
export async function buildTagsListJson(): Promise<TagListJson> {
  const tags = await getAdapter().listTags();
  return toTagListJson(tags, { total: tags.length, page: 1, pageSize: tags.length });
}

export async function GET(_req: Request): Promise<Response> {
  await connection();
  return jsonOk(await buildTagsListJson());
}
