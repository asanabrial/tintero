// GET /api/v1/posts — list posts (public, published + non-future; drafts require auth)
// POST /api/v1/posts — create post (auth required)
//
// NO 'export const dynamic' — connection() at request time makes this dynamic automatically.
// Cache invalidation via revalidateTag(tag, { expire: 0 }) — the Route Handler primitive.

import { connection } from "next/server";
import { revalidateTag } from "next/cache";
import { getRepository, getWriter, hideFuturePosts } from "@/lib/content";
import { verifyApiAuth, getApiIdentity } from "@/lib/api/auth";
import { jsonOk, jsonError, writeErrorResponse } from "@/lib/api/errors";
import { toPostJsonFull, toPostListJson } from "@/lib/api/serialize";
import type { CreatePostInput } from "@/lib/content";

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
  const tag = url.searchParams.get("tag") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const author = url.searchParams.get("author") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const wantDrafts = url.searchParams.get("includeDrafts") === "true";

  // ADR-5: auth gate BEFORE forwarding includeDrafts to the repository
  if (wantDrafts && !(await verifyApiAuth(req))) {
    return jsonError(401, "Authentication required");
  }

  const repo = getRepository();
  const now = todayUTC();

  if (wantDrafts) {
    // Authed path: admin sees drafts + future — use repo pagination as-is
    const result = await repo.listPosts({
      page,
      pageSize,
      tag,
      category,
      author,
      query: q,
      includeDrafts: true,
    });
    return jsonOk(toPostListJson(result.posts, { total: result.total, page, pageSize }));
  }

  // Public path: fetch all published, filter future, then paginate in-handler
  // so that `total` reflects only actually-visible posts (WARNING-1 fix).
  const all = await repo.listPosts({
    tag,
    category,
    author,
    query: q,
    pageSize: 9999,
    includeDrafts: false,
  });
  const visible = hideFuturePosts(all.posts, now);
  const total = visible.length;
  const start = (page - 1) * pageSize;
  const posts = visible.slice(start, start + pageSize);

  return jsonOk(toPostListJson(posts, { total, page, pageSize }));
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

  // Map body → CreatePostInput; let the writer be the validation source (ADR-D5)
  const tags = Array.isArray(body.tags)
    ? (body.tags as string[])
    : typeof body.tags === "string"
      ? (body.tags as string).split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  const categories = Array.isArray(body.categories)
    ? (body.categories as string[])
    : typeof body.categories === "string"
      ? (body.categories as string).split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const input: CreatePostInput = {
    title: typeof body.title === "string" ? body.title : "",
    slug: typeof body.slug === "string" && body.slug ? body.slug : undefined,
    date:
      typeof body.date === "string" && body.date
        ? body.date
        : todayUTC(),
    status:
      body.status === "published" || body.status === "draft"
        ? body.status
        : "draft",
    excerpt:
      typeof body.excerpt === "string" && body.excerpt
        ? body.excerpt
        : undefined,
    tags,
    categories,
    comments: typeof body.comments === "boolean" ? body.comments : true,
    body: typeof body.body === "string" ? body.body : "",
  };

  const apiIdentity = await getApiIdentity(req);

  try {
    const result = await getWriter().createPost(input, {
      source: "api",
      authorLabel: apiIdentity ?? undefined,
    });
    if (!result.ok) {
      return writeErrorResponse(result.error);
    }

    // Revalidate cache tags BEFORE returning response (ADR-8)
    revalidateTag("posts", { expire: 0 });
    revalidateTag(`post:${result.slug}`, { expire: 0 });
    revalidateTag("tags", { expire: 0 });
    revalidateTag("categories", { expire: 0 });

    // Re-read to return PostJsonFull (ADR-D7)
    const raw = await getWriter().readRaw(result.slug);
    const repo = getRepository();
    const post = await repo.listPosts({
      includeDrafts: true,
      pageSize: 9999,
    }).then((r) => r.posts.find((p) => p.slug === result.slug) ?? null);

    if (!post) {
      return jsonError(500, "Internal error");
    }

    return jsonOk(toPostJsonFull(post, raw), 201);
  } catch {
    return jsonError(500, "Internal error");
  }
}
