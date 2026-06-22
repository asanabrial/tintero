// GET /api/v1/media — list all uploaded assets with sidecar metadata (auth required).
//
// connection() at request time makes this dynamic automatically (no 'export const dynamic').
// Auth required: enumerating uploaded filenames (UUIDs) is an admin concern.
// DB-free — reads the filesystem only.
//
// R1 path: connection() throws outside Next request scope in bun:test, so the
// testable logic is handleMediaGet(); GET is a thin connection() + helper wrapper.

import { connection } from "next/server";
import { listUploads } from "@/lib/media/fs-media";
import { getMediaMeta } from "@/lib/media/media-meta";
import { UPLOADS_DIR } from "@/lib/media/dir";
import { verifyApiAuth } from "@/lib/api/auth";
import { jsonOk, jsonError } from "@/lib/api/errors";
import { toMediaJson } from "@/lib/api/serialize";

export async function handleMediaGet(req: Request): Promise<Response> {
  if (!(await verifyApiAuth(req))) return jsonError(401, "Authentication required");

  const assets = await listUploads(UPLOADS_DIR);
  const media = await Promise.all(
    assets.map(async (asset) =>
      toMediaJson(asset, await getMediaMeta(UPLOADS_DIR, asset.filename))
    )
  );

  return jsonOk({ media, total: media.length });
}

export async function GET(req: Request): Promise<Response> {
  await connection();
  return handleMediaGet(req);
}
