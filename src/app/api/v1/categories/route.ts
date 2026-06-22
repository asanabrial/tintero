// GET /api/v1/categories — list all categories (public, markdown-derived, no DB needed)
//
// NO 'export const dynamic' — connection() at request time makes this dynamic automatically.
//
// R1 path: pure-helper — buildCategoriesListJson() is testable directly (connection() excluded).

import * as path from "path";
import { connection } from "next/server";
import { FilesystemContentAdapter } from "@/lib/content/fs-adapter";
import { jsonOk } from "@/lib/api/errors";
import { toCategoryListJson, type CategoryListJson } from "@/lib/api/serialize";

function getAdapter(): FilesystemContentAdapter {
  return new FilesystemContentAdapter(path.join(process.cwd(), "content"));
}

/**
 * Builds the categories list response body. Pure helper — no connection(), testable directly.
 */
export async function buildCategoriesListJson(): Promise<CategoryListJson> {
  const cats = await getAdapter().listCategories();
  return toCategoryListJson(cats, { total: cats.length, page: 1, pageSize: cats.length });
}

export async function GET(_req: Request): Promise<Response> {
  await connection();
  return jsonOk(await buildCategoriesListJson());
}
