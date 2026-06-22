// GET /api/v1/comments  — list approved comments by postSlug (public)
//                       — list pending comments (auth required: ?status=pending)
// POST /api/v1/comments — submit a comment (public)
//
// NO 'export const dynamic' — connection() at request time makes this dynamic automatically.
// getCommentRepository() MUST be called inside try — it throws synchronously on missing DATABASE_URL.
//
// R1 path: pure-helper — connection() throws outside Next request scope in bun:test.
// handleCommentsGet() is the testable logic; GET is a thin connection() + helper wrapper.

import { connection } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getCommentRepository } from "@/lib/comments/factory";
import { CommentDepthError } from "@/lib/comments/types";
import { verifyApiAuth } from "@/lib/api/auth";
import { jsonOk, jsonError } from "@/lib/api/errors";
import { toCommentJson, toCommentListJson } from "@/lib/api/serialize";

const submitSchema = z.object({
  postSlug: z.string().min(1),
  authorName: z.string().min(1),
  authorEmail: z.string().email().optional(),
  authorUrl: z.string().url().optional(),
  body: z.string().min(1),
  parentId: z.string().uuid().optional(),
});

/**
 * Core GET logic — no connection() call, testable directly.
 */
export async function handleCommentsGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const postSlug = url.searchParams.get("postSlug");

  if (status === "pending") {
    if (!(await verifyApiAuth(req))) return jsonError(401, "Authentication required");
    try {
      const repo = getCommentRepository();
      const pending = await repo.listPending();
      return jsonOk(
        toCommentListJson(pending, { total: pending.length, page: 1, pageSize: pending.length })
      );
    } catch {
      return jsonError(503, "Database unavailable");
    }
  }

  // Public: approved comments by postSlug — postSlug is required
  if (!postSlug) return jsonError(400, "postSlug is required");

  try {
    const repo = getCommentRepository();
    const threads = await repo.listApproved(postSlug);
    const flat = threads.flatMap((t) => [t.comment, ...t.replies]);
    return jsonOk(
      toCommentListJson(flat, { total: flat.length, page: 1, pageSize: flat.length })
    );
  } catch {
    return jsonError(503, "Database unavailable");
  }
}

export async function GET(req: Request): Promise<Response> {
  await connection();
  return handleCommentsGet(req);
}

export async function POST(req: Request): Promise<Response> {
  // Public submit — no auth required
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid request", { issues: parsed.error.issues });
  }

  try {
    const repo = getCommentRepository();
    const created = await repo.submit(
      {
        postSlug: parsed.data.postSlug,
        authorName: parsed.data.authorName,
        authorEmail: parsed.data.authorEmail ?? "",
        authorUrl: parsed.data.authorUrl,
        body: parsed.data.body,
        parentId: parsed.data.parentId ?? null,
      },
      "pending"
    );
    revalidateTag("posts", { expire: 0 });
    revalidateTag(`post:${created.postSlug}`, { expire: 0 });
    return jsonOk(toCommentJson(created), 201);
  } catch (e) {
    if (e instanceof CommentDepthError) return jsonError(400, (e as Error).message);
    return jsonError(503, "Database unavailable");
  }
}
