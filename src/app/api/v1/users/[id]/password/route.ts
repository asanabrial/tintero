// POST /api/v1/users/[id]/password — change a user's password (auth required)
//
// Validation: ChangePasswordSchema (password: min length 1).
// getUserRepository() inside try → missing DATABASE_URL → 503.
// [id] param is Promise<{ id: string }> — await ctx.params.

import { getUserRepository, hashPassword, ChangePasswordSchema } from "@/lib/auth";
import { verifyApiAuth } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/errors";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  if (!(await verifyApiAuth(req))) return jsonError(401, "Authentication required");
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid request", {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }
  try {
    const newHash = await hashPassword(parsed.data.password);
    const repo = getUserRepository();
    const updated = await repo.updatePassword(id, newHash);
    if (!updated) return jsonError(404, "User not found");
    return new Response(null, { status: 204 });
  } catch {
    return jsonError(503, "Database unavailable");
  }
}
