// Media Library — FS-seam adapter.
// IMPORTANT: NO imports from 'next/cache' or 'next/headers'.
// The uploads directory is INJECTED as a parameter so tests can use os.tmpdir().

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  buildPublicUrl,
  buildStoredFilename,
  extractExtension,
  isBelowSizeLimit,
  isAllowedExtension,
  isAllowedMimeType,
  resolveUploadPath,
  sanitizeFilename,
} from "./allowlist";
import type { DeleteResult, MediaAsset, UploadResult } from "./types";

// ============================================================
// writeUpload
// ============================================================

/**
 * Validates and atomically writes an uploaded File to uploadsDir.
 *
 * Validation pipeline (in order, all BEFORE any disk write):
 *   1. no_file       — file is null / 0 bytes
 *   2. invalid_extension — ext not in allowlist
 *   3. invalid_mime  — file.type not in allowlist
 *   4. too_large     — file.size > MAX_BYTES
 *   5. invalid_filename — sanitized name is empty (traversal guard)
 *
 * Atomic write: temp file → rename → cleanup on error.
 * Returns UploadResult discriminated union (never throws across action boundary).
 */
export async function writeUpload(uploadsDir: string, file: File | null): Promise<UploadResult> {
  // 1. no_file
  if (!file || file.size === 0) {
    return { ok: false, error: { kind: "no_file" } };
  }

  // 2. invalid_extension
  const sanitized = sanitizeFilename(file.name);
  const ext = extractExtension(sanitized);
  if (!isAllowedExtension(ext)) {
    return { ok: false, error: { kind: "invalid_extension", ext } };
  }

  // 3. invalid_mime
  if (!isAllowedMimeType(file.type)) {
    return { ok: false, error: { kind: "invalid_mime", mime: file.type } };
  }

  // 4. too_large
  if (!isBelowSizeLimit(file.size)) {
    return { ok: false, error: { kind: "too_large", size: file.size, max: 5 * 1024 * 1024 } };
  }

  // 5. Build stored filename — uses randomUUID internally
  if (!sanitized) {
    return { ok: false, error: { kind: "invalid_filename", filename: file.name } };
  }

  const storedFilename = buildStoredFilename(file.name);

  // Path-traversal guard (belt-and-suspenders; UUID prefix makes traversal near-impossible)
  const resolved = resolveUploadPath(uploadsDir, storedFilename);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  // Atomic write: .{stored}.tmp → rename to final
  const tmpPath = path.join(uploadsDir, "." + storedFilename + ".tmp");

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tmpPath, buffer);
    await fs.rename(tmpPath, resolved.path);
  } catch {
    // Cleanup temp file on any error
    await fs.unlink(tmpPath).catch(() => {});
    return { ok: false, error: { kind: "write_failed" } };
  }

  const asset: MediaAsset = {
    filename: storedFilename,
    size: file.size,
    url: buildPublicUrl(storedFilename),
  };

  return { ok: true, asset };
}

// ============================================================
// deleteUpload
// ============================================================

/**
 * Deletes a file from uploadsDir by filename.
 *
 * - Traversal-guards the filename first.
 * - ENOENT is tolerated (returns ok:true — file already gone is fine).
 * - Other FS errors are re-thrown.
 */
export async function deleteUpload(
  uploadsDir: string,
  filename: string
): Promise<DeleteResult> {
  // Traversal guard
  const resolved = resolveUploadPath(uploadsDir, filename);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  try {
    await fs.unlink(resolved.path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // File already gone — graceful
      return { ok: true };
    }
    throw err;
  }

  return { ok: true };
}

// ============================================================
// listUploads
// ============================================================

/**
 * Lists all non-dotfiles in uploadsDir, sorted newest-first by mtime.
 * Returns [] if the directory does not exist or cannot be read.
 */
export async function listUploads(uploadsDir: string): Promise<MediaAsset[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(uploadsDir);
  } catch {
    return [];
  }

  // Filter out dotfiles (includes .gitkeep, .tmp files, .DS_Store, etc.)
  const nonDot = entries.filter((e) => !e.startsWith("."));

  // Stat each entry for size and mtime
  const assets: (MediaAsset & { mtimeMs: number })[] = [];
  for (const entry of nonDot) {
    const fullPath = path.join(uploadsDir, entry);
    try {
      const stat = await fs.stat(fullPath);
      assets.push({
        filename: entry,
        size: stat.size,
        url: buildPublicUrl(entry),
        mtimeMs: stat.mtimeMs,
      });
    } catch {
      // Skip unreadable entries
    }
  }

  // Sort newest-first by mtime
  assets.sort((a, b) => b.mtimeMs - a.mtimeMs);

  // Return without the internal mtimeMs field
  return assets.map(({ filename, size, url }) => ({ filename, size, url }));
}
