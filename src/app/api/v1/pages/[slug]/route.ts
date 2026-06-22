// GET /api/v1/pages/[slug]    — single page (always public; pages have no draft concept)
// PUT /api/v1/pages/[slug]    — update page (auth required)
// DELETE /api/v1/pages/[slug] — delete page (auth required)
//
// NO 'export const dynamic' — async FS ops make this dynamic automatically.
// Cache invalidation via revalidateTag(tag, { expire: 0 }) — Route Handler primitive.

import { connection } from "next/server";
import { revalidateTag } from "next/cache";
import { getRepository, getPageWriter } from "@/lib/content";
import { verifyApiAuth, getApiIdentity } from "@/lib/api/auth";
import { jsonOk, jsonError, writeErrorResponse } from "@/lib/api/errors";
import { toPageJsonFull } from "@/lib/api/serialize";
import type { UpdatePageInput } from "@/lib/content";

type Ctx = { params: Promise<{ slug: string }> };

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { slug } = await ctx.params;

  // Pages are always public — no auth gate (spec: Get Single Page Always Public)
  const repo = getRepository();
  const page = await repo.getPage(slug);

  if (!page) {
    return jsonError(404, "Page not found");
  }

  const raw = await getPageWriter().readRawPage(slug);
  return jsonOk(toPageJsonFull(page, raw));
}

export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  if (!(await verifyApiAuth(req))) {
    return jsonError(401, "Authentication required");
  }

  const { slug } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const input: UpdatePageInput = {
    title: typeof body.title === "string" ? body.title : "",
    slug: typeof body.slug === "string" && body.slug ? body.slug : undefined,
    date: typeof body.date === "string" && body.date ? body.date : todayUTC(),
    excerpt:
      typeof body.excerpt === "string" && body.excerpt ? body.excerpt : undefined,
    body: typeof body.body === "string" ? body.body : "",
  };

  const apiIdentity = await getApiIdentity(req);

  try {
    const result = await getPageWriter().updatePage(slug, input, {
      source: "api",
      authorLabel: apiIdentity ?? undefined,
    });
    if (!result.ok) {
      return writeErrorResponse(result.error);
    }

    // Revalidate slug tags — both old and new on rename (ADR-8)
    if (result.slug !== slug) {
      revalidateTag(`page:${slug}`, { expire: 0 });
      revalidateTag(`page:${result.slug}`, { expire: 0 });
    } else {
      revalidateTag(`page:${result.slug}`, { expire: 0 });
    }
    revalidateTag("pages", { expire: 0 });

    // Re-read to return updated PageJsonFull (ADR-D7)
    const raw = await getPageWriter().readRawPage(result.slug);
    const repo = getRepository();
    const updated = await repo.getPage(result.slug);

    if (!updated) {
      return jsonError(500, "Internal error");
    }

    return jsonOk(toPageJsonFull(updated, raw));
  } catch {
    return jsonError(500, "Internal error");
  }
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  if (!(await verifyApiAuth(req))) {
    return jsonError(401, "Authentication required");
  }

  const { slug } = await ctx.params;

  // ADR-D6: pre-check existence since writer deletePage is graceful on missing files
  const repo = getRepository();
  const exists = await repo.getPage(slug);

  if (!exists) {
    return jsonError(404, "Page not found");
  }

  try {
    const result = await getPageWriter().deletePage(slug);
    if (!result.ok) {
      return writeErrorResponse(result.error);
    }

    // Revalidate before returning response
    revalidateTag("pages", { expire: 0 });
    revalidateTag(`page:${slug}`, { expire: 0 });

    return jsonOk({ slug, deleted: true });
  } catch {
    return jsonError(500, "Internal error");
  }
}
