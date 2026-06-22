// GET /api/v1/tags/[slug] — single tag by slug (public, markdown-derived, no DB needed)
//
// NO 'export const dynamic' — connection() at request time makes this dynamic automatically.
//
// R1 path: pure-helper — buildTagSingleJson() is testable directly (connection() excluded).

import * as path from "path";
import { connection } from "next/server";
import { FilesystemContentAdapter } from "@/lib/content/fs-adapter";
import { jsonOk, jsonError } from "@/lib/api/errors";
import { toTagJson, type TagJson } from "@/lib/api/serialize";

type Ctx = { params: Promise<{ slug: string }> };

function getAdapter(): FilesystemContentAdapter {
  return new FilesystemContentAdapter(path.join(process.cwd(), "content"));
}

/**
 * Looks up a tag by slug. Returns the TagJson if found, or null if not found.
 * Pure helper — no connection(), testable directly.
 */
export async function buildTagSingleJson(slug: string): Promise<TagJson | null> {
  const tags = await getAdapter().listTags();
  const found = tags.find((t) => t.slug === slug);
  return found ? toTagJson(found) : null;
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { slug } = await ctx.params;
  const result = await buildTagSingleJson(slug);
  if (!result) return jsonError(404, "Tag not found");
  return jsonOk(result);
}
