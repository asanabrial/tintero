// GET /api/v1/categories/[...slug] — single category by hierarchical slug (public, no DB needed)
//
// NO 'export const dynamic' — connection() at request time makes this dynamic automatically.
// Catch-all route: slug is string[] — join with "/" to form the lookup key (ADR-D7).
//
// R1 path: pure-helper — buildCategorySingleJson() is testable directly (connection() excluded).

import * as path from "path";
import { connection } from "next/server";
import { FilesystemContentAdapter } from "@/lib/content/fs-adapter";
import { jsonOk, jsonError } from "@/lib/api/errors";
import { toCategoryJson, type CategoryJson } from "@/lib/api/serialize";

type Ctx = { params: Promise<{ slug: string[] }> };

function getAdapter(): FilesystemContentAdapter {
  return new FilesystemContentAdapter(path.join(process.cwd(), "content"));
}

/**
 * Looks up a category by its path segments. Returns CategoryJson if found, null if not.
 * Pure helper — no connection(), testable directly.
 */
export async function buildCategorySingleJson(segments: string[]): Promise<CategoryJson | null> {
  const lookupPath = segments.join("/");
  const cats = await getAdapter().listCategories();
  const found = cats.find((c) => c.slug === lookupPath);
  return found ? toCategoryJson(found) : null;
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { slug } = await ctx.params;
  const result = await buildCategorySingleJson(slug);
  if (!result) return jsonError(404, "Category not found");
  return jsonOk(result);
}
