// DELETE /api/v1/media/[filename] — delete an asset + its sidecar (auth required).
//
// [filename] param is Promise<{ filename: string }> — await ctx.params.
// REST semantics: 404 when the asset does NOT exist (unlike deleteUpload's ENOENT
// tolerance), so we check existence BEFORE deleting.
// Traversal guard via resolveUploadPath -> 400 on an unsafe filename.

import { revalidateTag } from "next/cache";
import * as fs from "node:fs/promises";
import { deleteUpload } from "@/lib/media/fs-media";
import { deleteMediaMeta } from "@/lib/media/media-meta";
import { resolveUploadPath } from "@/lib/media/allowlist";
import { UPLOADS_DIR } from "@/lib/media/dir";
import { verifyApiAuth } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/errors";

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ filename: string }> }
): Promise<Response> {
  if (!(await verifyApiAuth(req))) return jsonError(401, "Authentication required");

  const { filename } = await ctx.params;

  // Traversal guard -> 400 on unsafe filename.
  const resolved = resolveUploadPath(UPLOADS_DIR, filename);
  if (!resolved.ok) return jsonError(400, "Invalid filename");

  // Existence check BEFORE delete -> 404 if missing (REST semantics).
  try {
    await fs.access(resolved.path);
  } catch {
    return jsonError(404, "Media not found");
  }

  await deleteUpload(UPLOADS_DIR, filename);
  await deleteMediaMeta(UPLOADS_DIR, filename);
  revalidateTag("media", { expire: 0 });

  return new Response(null, { status: 204 });
}
