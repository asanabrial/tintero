// GET /api/v1/export/wxr — download a full site bundle as WXR (WordPress eXtended RSS).
//
// Auth: verifyApiAuth (DB-free; session cookie OR Bearer API_TOKEN).
// NO 'export const dynamic' — connection() makes this route dynamic automatically.

import { connection } from "next/server";
import { getRepository } from "@/lib/content";
import { verifyApiAuth } from "@/lib/api/auth";
import { generateWxr } from "@/lib/content/wxr-export";

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

  const [{ posts }, { pages }, siteConfig] = await Promise.all([
    repo.listPosts({ includeDrafts: true, pageSize: 9999 }),
    repo.listPages({ includeDrafts: true, pageSize: Number.MAX_SAFE_INTEGER }),
    repo.getSiteConfig(),
  ]);

  const xml = generateWxr({
    posts,
    pages,
    site: {
      title: siteConfig.title,
      description: siteConfig.description,
      baseUrl: siteConfig.baseUrl,
      language: siteConfig.language,
    },
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tintero-export.wxr.xml"',
    },
  });
}
