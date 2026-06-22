// GET /api/v1/export — download a full site bundle as JSON.
//
// Auth: verifyApiAuth (DB-free; session cookie OR Bearer API_TOKEN).
// NO 'export const dynamic' — connection() makes this route dynamic automatically.

import { connection } from "next/server";
import { getRepository, getWriter, getPageWriter } from "@/lib/content";
import { verifyApiAuth } from "@/lib/api/auth";
import { buildExportBundle } from "@/lib/content/export";

export async function GET(req: Request): Promise<Response> {
  // connection() FIRST — makes this route dynamic; no static analysis at build time
  await connection();

  if (!(await verifyApiAuth(req))) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const repo = getRepository();
  const writer = getWriter();
  const pageWriter = getPageWriter();

  const [{ posts }, pagesResult, siteConfig] = await Promise.all([
    repo.listPosts({ includeDrafts: true, pageSize: 9999 }),
    repo.listPages({ pageSize: Number.MAX_SAFE_INTEGER }),
    repo.getSiteConfig(),
  ]);
  const pages = pagesResult.pages;

  const postItems = await Promise.all(
    posts.map(async (post) => ({ post, raw: await writer.readRaw(post.slug) }))
  );
  const pageItems = await Promise.all(
    pages.map(async (page) => ({ page, raw: await pageWriter.readRawPage(page.slug) }))
  );

  // exportedAt computed at request time, AFTER connection()
  const exportedAt = new Date().toISOString();

  const bundle = buildExportBundle({
    posts: postItems,
    pages: pageItems,
    siteConfig,
    exportedAt,
  });

  const date = exportedAt.slice(0, 10); // YYYY-MM-DD

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tintero-export-${date}.json"`,
    },
  });
}
