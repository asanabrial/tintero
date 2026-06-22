// Public file-serving Route Handler for uploaded media.
// NO authentication required — UUID-prefixed filenames are unguessable.
// NO 'export const dynamic' — async readFile makes this handler dynamic automatically
// (Next.js route-handlers.md §124: async FS ops terminate prerendering).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { EXT_TO_CONTENT_TYPE, resolveUploadPath } from "@/lib/media/allowlist";
import { UPLOADS_DIR } from "@/lib/media/dir";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await ctx.params;
  const filename = segments.join("/");

  // Path-traversal guard
  const resolved = resolveUploadPath(UPLOADS_DIR, filename);
  if (!resolved.ok) {
    return new Response("Not found", { status: 404 });
  }

  // Only serve allowlisted extensions — never serve arbitrary content types
  const ext = path.extname(resolved.path).toLowerCase();
  const contentType = EXT_TO_CONTENT_TYPE[ext];
  if (!contentType) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await readFile(resolved.path);
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }
}
