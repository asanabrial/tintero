"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/capabilities";
import { writeUpload, deleteUpload, listUploads } from "@/lib/media/fs-media";
import { setMediaMeta, deleteMediaMeta, getMediaMeta } from "@/lib/media/media-meta";
import { UPLOADS_DIR } from "@/lib/media/dir";
import type { MediaError, MediaFormState } from "@/lib/media/types";
import { parseSelectedMediaFilenames } from "./_components/parse-selected-media-filenames";

// ============================================================
// Error message map
// ============================================================

function friendlyError(error: MediaError): string {
  switch (error.kind) {
    case "no_file":
      return "No file selected.";
    case "invalid_extension":
      return `File type not allowed: ${error.ext || "(unknown)"}`;
    case "invalid_mime":
      return "MIME type not allowed.";
    case "too_large":
      return "File exceeds 5 MB limit.";
    case "invalid_filename":
      return "Invalid filename.";
    case "write_failed":
      return "Upload failed, please try again.";
  }
}

// ============================================================
// uploadMediaAction
// ============================================================

/**
 * Server action: validates and writes an uploaded image.
 * - verifySession() FIRST
 * - Reads the 'file' field from formData (Web File API)
 * - Delegates to writeUpload (fs-media seam)
 * - On success: updateTag("media") + return { ok: true }
 * - On failure: return { error: friendlyMessage }
 */
export async function uploadMediaAction(
  _prev: MediaFormState,
  formData: FormData
): Promise<MediaFormState> {
  const session = await verifySession();

  if (!can(session.role, "media:upload")) {
    return { error: "You do not have permission to perform this action." };
  }

  const file = formData.get("file") as File | null;
  const result = await writeUpload(UPLOADS_DIR, file);

  if (!result.ok) {
    return { error: friendlyError(result.error) };
  }

  updateTag("media");
  return { ok: true };
}

// ============================================================
// deleteMediaAction
// ============================================================

/**
 * Server action: deletes an uploaded image and its sidecar metadata by filename.
 * - verifySession() FIRST
 * - Traversal guard is handled inside deleteUpload (fs-media seam)
 * - ENOENT tolerated (already gone = fine)
 * - deleteMediaMeta also ENOENT-tolerant
 * - updateTag("media") after deletion
 */
export async function deleteMediaAction(filename: string): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "media:delete")) {
    redirect("/admin");
    return;
  }
  await deleteUpload(UPLOADS_DIR, filename);
  await deleteMediaMeta(UPLOADS_DIR, filename);
  updateTag("media");
}

// ============================================================
// updateMediaMetaAction
// ============================================================

/** useActionState shape for the metadata edit island. */
export type MediaMetaFormState = { ok: true } | { error: string } | undefined;

/**
 * Server action: updates the alt/caption sidecar for a media asset.
 * - verifySession() FIRST
 * - Reads alt + caption from FormData
 * - setMediaMeta handles empty/whitespace -> sidecar deletion
 * - updateTag("media") to invalidate the tag
 */
export async function updateMediaMetaAction(
  filename: string,
  _prev: MediaMetaFormState,
  formData: FormData
): Promise<MediaMetaFormState> {
  const session = await verifySession();
  if (!can(session.role, "media:upload")) {
    return { error: "You do not have permission to perform this action." };
  }
  const alt = (formData.get("alt") as string | null) ?? undefined;
  const caption = (formData.get("caption") as string | null) ?? undefined;
  await setMediaMeta(UPLOADS_DIR, filename, { alt, caption });
  updateTag("media");
  return { ok: true };
}

// ============================================================
// listMediaAction
// ============================================================

/**
 * Server action: lists uploaded media assets for the editor image picker.
 * - verifySession() FIRST (redirects on failure)
 * - Returns {url, filename, alt?}[] — alt sourced from sidecar (forward-compat)
 * - Empty array when uploads dir is empty
 */
export async function listMediaAction(): Promise<
  { url: string; filename: string; alt?: string }[]
> {
  await verifySession();
  const assets = await listUploads(UPLOADS_DIR);
  return Promise.all(
    assets.map(async (a) => {
      const meta = await getMediaMeta(UPLOADS_DIR, a.filename);
      return meta.alt !== undefined
        ? { url: a.url, filename: a.filename, alt: meta.alt }
        : { url: a.url, filename: a.filename };
    })
  );
}

// ============================================================
// bulkDeleteMediaAction
// ============================================================

/**
 * Server action: deletes multiple uploaded images and their sidecar metadata.
 * - verifySession() FIRST
 * - Fail-closed RBAC: redirects to /admin if not media:delete
 * - Parses filenames from FormData field "filename" (hidden inputs from selection island)
 * - Per-item delete via deleteUpload + deleteMediaMeta; Promise.allSettled so one
 *   failure (e.g. locked file) does not abort the rest of the batch
 * - updateTag("media") to refresh the grid after all items are processed
 */
export async function bulkDeleteMediaAction(formData: FormData): Promise<void> {
  const session = await verifySession();
  if (!can(session.role, "media:delete")) {
    redirect("/admin");
    return;
  }
  const filenames = parseSelectedMediaFilenames(formData);
  if (filenames.length > 0) {
    await Promise.allSettled(
      filenames.map(async (f) => {
        try {
          await deleteUpload(UPLOADS_DIR, f);
          await deleteMediaMeta(UPLOADS_DIR, f);
        } catch {
          // swallow: keep batch resilient against non-ENOENT fs errors (e.g. locked file)
        }
      })
    );
  }
  updateTag("media");
}
