// GET /api/v1/posts/[slug]  — single post (public for published; draft → 404 if unauth)
// PUT /api/v1/posts/[slug]  — update post (auth required)
// DELETE /api/v1/posts/[slug] — delete post (auth required)
//
// NO 'export const dynamic' — async FS ops make this dynamic automatically.
// Cache invalidation via revalidateTag(tag, { expire: 0 }) — Route Handler primitive.

import { connection } from "next/server";
import { revalidateTag } from "next/cache";
import { getRepository, getWriter, isFuturePost } from "@/lib/content";
import { verifyApiAuth, getApiIdentity } from "@/lib/api/auth";
import { jsonOk, jsonError, writeErrorResponse } from "@/lib/api/errors";
import { toPostJsonFull } from "@/lib/api/serialize";
import type { UpdatePostInput } from "@/lib/content";

type Ctx = { params: Promise<{ slug: string }> };

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  await connection();
  const { slug } = await ctx.params;

  const repo = getRepository();

  // Fetch post including drafts so we can decide visibility (ADR-D3)
  const post = await repo.getPost(slug, { includeDrafts: true });

  if (!post) {
    return jsonError(404, "Post not found");
  }

  const now = todayUTC();
  const isAuth = await verifyApiAuth(req);
  const isHidden = post.status === "draft" || isFuturePost(post, now) || post.visibility === "private";

  // ADR-D3: non-disclosure — hidden resources return 404, not 401/403
  if (isHidden && !isAuth) {
    return jsonError(404, "Post not found");
  }

  // Password posts: require auth or return 403 with hint
  if (post.visibility === "password" && !isAuth) {
    return jsonError(403, "Password required");
  }

  const raw = await getWriter().readRaw(slug); // null → omit raw (ADR-3)
  return jsonOk(toPostJsonFull(post, raw));
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

  const input: UpdatePostInput = {
    title: typeof body.title === "string" ? body.title : "",
    slug: typeof body.slug === "string" && body.slug ? body.slug : undefined,
    date: typeof body.date === "string" && body.date ? body.date : todayUTC(),
    status:
      body.status === "published" || body.status === "draft"
        ? body.status
        : "draft",
    excerpt:
      typeof body.excerpt === "string" && body.excerpt ? body.excerpt : undefined,
    tags,
    categories,
    comments: typeof body.comments === "boolean" ? body.comments : true,
    body: typeof body.body === "string" ? body.body : "",
  };

  const apiIdentity = await getApiIdentity(req);

  try {
    const result = await getWriter().updatePost(slug, input, {
      source: "api",
      authorLabel: apiIdentity ?? undefined,
    });
    if (!result.ok) {
      return writeErrorResponse(result.error);
    }

    // Revalidate slug tags — both old and new on rename (ADR-8)
    if (result.slug !== slug) {
      revalidateTag(`post:${slug}`, { expire: 0 });
      revalidateTag(`post:${result.slug}`, { expire: 0 });
    } else {
      revalidateTag(`post:${result.slug}`, { expire: 0 });
    }
    revalidateTag("posts", { expire: 0 });
    revalidateTag("tags", { expire: 0 });
    revalidateTag("categories", { expire: 0 });

    // Re-read to return updated PostJsonFull (ADR-D7)
    const raw = await getWriter().readRaw(result.slug);
    const repo = getRepository();
    const updated = await repo
      .listPosts({ includeDrafts: true, pageSize: 9999 })
      .then((r) => r.posts.find((p) => p.slug === result.slug) ?? null);

    if (!updated) {
      return jsonError(500, "Internal error");
    }

    return jsonOk(toPostJsonFull(updated, raw));
  } catch {
    return jsonError(500, "Internal error");
  }
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  if (!(await verifyApiAuth(req))) {
    return jsonError(401, "Authentication required");
  }

  const { slug } = await ctx.params;

  // ADR-D6: pre-check existence since writer deletePost is graceful on missing files
  const repo = getRepository();
  const exists = await repo
    .listPosts({ includeDrafts: true, pageSize: 9999 })
    .then((r) => r.posts.find((p) => p.slug === slug) ?? null);

  if (!exists) {
    return jsonError(404, "Post not found");
  }

  try {
    const result = await getWriter().deletePost(slug);
    if (!result.ok) {
      return writeErrorResponse(result.error);
    }

    // Revalidate before returning response
    revalidateTag("posts", { expire: 0 });
    revalidateTag(`post:${slug}`, { expire: 0 });
    revalidateTag("tags", { expire: 0 });
    revalidateTag("categories", { expire: 0 });

    return jsonOk({ slug, deleted: true });
  } catch {
    return jsonError(500, "Internal error");
  }
}
