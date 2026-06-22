// DELETE /api/v1/users/[id] — hard-delete a user (auth required)
//
// Last-admin guard: countAdmins() <= 1 → 409 BEFORE delete.
// getUserRepository() inside try → missing DATABASE_URL → 503 (ADR-6).
// [id] param is Promise<{ id: string }> — await ctx.params.

import { getUserRepository } from "@/lib/auth";
import { verifyApiAuth } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/errors";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  if (!(await verifyApiAuth(req))) return jsonError(401, "Authentication required");
  const { id } = await ctx.params;
  try {
    const repo = getUserRepository();
    const count = await repo.countAdmins();
    if (count <= 1) {
      return jsonError(409, "Cannot delete the last administrator");
    }
    const deleted = await repo.deleteUser(id);
    if (!deleted) return jsonError(404, "User not found");
    return new Response(null, { status: 204 });
  } catch {
    return jsonError(503, "Database unavailable");
  }
}
