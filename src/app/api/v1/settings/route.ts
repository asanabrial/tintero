// GET /api/v1/settings — public, file-based (works without DATABASE_URL)
// PUT /api/v1/settings — auth required; validate writable subset → writeConfig → revalidateTag
//
// NO 'export const dynamic' — connection() at request time makes GET dynamic.
// GET is file-based and never needs DATABASE_URL.
// PUT: validateSettingsFields (ADR-7 shared validator); revalidateTag("site-config", { expire: 0 })
// after successful write (SAME tag as admin updateTag("site-config")).

import { connection } from "next/server";
import { revalidateTag } from "next/cache";
import { loadSiteConfig } from "@/lib/content/site-config";
import { getSiteConfigWriter, validateSettingsFields } from "@/lib/content/site-config-writer";
import { verifyApiAuth } from "@/lib/api/auth";
import { jsonOk, jsonError } from "@/lib/api/errors";
import { toSiteConfigJson } from "@/lib/api/serialize";

/**
 * Core GET logic — no connection() call, testable directly.
 * Reads config/site.yaml (file-based, never throws, env-free).
 */
export async function handleSettingsGet(): Promise<Response> {
  const config = await loadSiteConfig();
  return jsonOk(toSiteConfigJson(config));
}

export async function GET(_req: Request): Promise<Response> {
  await connection();
  return handleSettingsGet();
}

export async function PUT(req: Request): Promise<Response> {
  if (!(await verifyApiAuth(req))) return jsonError(401, "Authentication required");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const v = validateSettingsFields(body);
  if (!v.ok) {
    return jsonError(400, "Invalid settings", { fieldErrors: v.fieldErrors });
  }
  const writeResult = await getSiteConfigWriter().writeConfig(v.fields);
  if (!writeResult.ok) {
    return jsonError(500, "Failed to write settings");
  }
  // SAME tag as admin updateTag("site-config"); Route Handler form uses revalidateTag + expire:0
  revalidateTag("site-config", { expire: 0 });
  const config = await loadSiteConfig();
  return jsonOk(toSiteConfigJson(config));
}
