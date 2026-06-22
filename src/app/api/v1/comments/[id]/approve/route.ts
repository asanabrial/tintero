// POST /api/v1/comments/[id]/approve — approve a comment (auth required)
//
// NO 'export const dynamic' — async ops make this dynamic automatically.
// getCommentRepository() MUST be called inside try — throws synchronously on missing DATABASE_URL.

import { revalidateTag } from "next/cache";
import { getCommentRepository } from "@/lib/comments/factory";
import { verifyApiAuth } from "@/lib/api/auth";
import { jsonOk, jsonError } from "@/lib/api/errors";
import { toCommentJson } from "@/lib/api/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  if (!(await verifyApiAuth(req))) return jsonError(401, "Authentication required");

  const { id } = await ctx.params;

  try {
    const repo = getCommentRepository();
    const comment = await repo.approve(id);
    if (!comment) return jsonError(404, "Comment not found");
    revalidateTag("posts", { expire: 0 });
    revalidateTag(`post:${comment.postSlug}`, { expire: 0 });
    return jsonOk(toCommentJson(comment));
  } catch {
    return jsonError(503, "Database unavailable");
  }
}
