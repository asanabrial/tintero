// DELETE /api/v1/comments/[id] — hard-delete a comment (auth required)
//
// NO 'export const dynamic' — async ops make this dynamic automatically.
// getCommentRepository() MUST be called inside try — throws synchronously on missing DATABASE_URL.
// Coarse invalidation (posts only, no post:{slug}) per ADR-D3 — delete() returns boolean.

import { revalidateTag } from "next/cache";
import { getCommentRepository } from "@/lib/comments/factory";
import { verifyApiAuth } from "@/lib/api/auth";
import { jsonOk, jsonError } from "@/lib/api/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  if (!(await verifyApiAuth(req))) return jsonError(401, "Authentication required");

  const { id } = await ctx.params;

  try {
    const repo = getCommentRepository();
    const ok = await repo.delete(id);
    if (!ok) return jsonError(404, "Comment not found");
    revalidateTag("posts", { expire: 0 });
    return jsonOk({ id, deleted: true });
  } catch {
    return jsonError(503, "Database unavailable");
  }
}
