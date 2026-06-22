// GET /api/v1/pages — list pages (always public; no draft concept for pages)
// POST /api/v1/pages — create page (auth required)
//
// NO 'export const dynamic' — connection() at request time makes this dynamic automatically.
// Cache invalidation via revalidateTag(tag, { expire: 0 }) — the Route Handler primitive.

import { connection } from "next/server";
import { revalidateTag } from "next/cache";
import { getRepository, getPageWriter } from "@/lib/content";
import { verifyApiAuth, getApiIdentity } from "@/lib/api/auth";
import { jsonOk, jsonError, writeErrorResponse } from "@/lib/api/errors";
import { toPageJsonFull, toPageListJson } from "@/lib/api/serialize";
import type { CreatePageInput } from "@/lib/content";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function clampInt(raw: string | null, fallback: number, max = 9999): number {
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request): Promise<Response> {
  await connection();

  const url = new URL(req.url);
  const page = clampInt(url.searchParams.get("page"), 1);
  const pageSize = clampInt(
    url.searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );

  // Pages list is always public — no auth gate
  const repo = getRepository();
  const { pages: pageSlice, total } = await repo.listPages({ page, pageSize });

  return jsonOk(toPageListJson(pageSlice, { total, page, pageSize }));
}

export async function POST(req: Request): Promise<Response> {
  if (!(await verifyApiAuth(req))) {
    return jsonError(401, "Authentication required");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const input: CreatePageInput = {
    title: typeof body.title === "string" ? body.title : "",
    slug: typeof body.slug === "string" && body.slug ? body.slug : undefined,
    date:
      typeof body.date === "string" && body.date ? body.date : todayUTC(),
    excerpt:
      typeof body.excerpt === "string" && body.excerpt
        ? body.excerpt
        : undefined,
    body: typeof body.body === "string" ? body.body : "",
  };

  const apiIdentity = await getApiIdentity(req);

  try {
    const result = await getPageWriter().createPage(input, {
      source: "api",
      authorLabel: apiIdentity ?? undefined,
    });
    if (!result.ok) {
      return writeErrorResponse(result.error);
    }

    // Revalidate cache tags BEFORE returning response (ADR-8)
    revalidateTag("pages", { expire: 0 });
    revalidateTag(`page:${result.slug}`, { expire: 0 });

    // Re-read to return PageJsonFull (ADR-D7)
    const raw = await getPageWriter().readRawPage(result.slug);
    const repo = getRepository();
    const createdPage = await repo.getPage(result.slug);

    if (!createdPage) {
      return jsonError(500, "Internal error");
    }

    return jsonOk(toPageJsonFull(createdPage, raw), 201);
  } catch {
    return jsonError(500, "Internal error");
  }
}
