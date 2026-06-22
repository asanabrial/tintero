// Media Library — per-asset metadata sidecar (alt/caption).
// IMPORTANT: NO imports from 'next/cache' or 'next/headers'.
// The uploads directory is INJECTED as a parameter so tests can use os.tmpdir().
// Sidecar file: ".{filename}.meta.json" — already invisible to listUploads (dotfile filter).

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveUploadPath } from "./allowlist";

export interface MediaMeta {
  alt?: string;
  caption?: string;
}

/**
 * Resolves the sidecar path for an asset filename, guarding against traversal.
 * The asset filename is sanitized (basename only, no separators) so the sidecar
 * name ".{safe}.meta.json" can never escape uploadsDir. Returns null on a
 * pathological/empty filename or if the resolved path escapes uploadsDir.
 */
function resolveSidecarPath(uploadsDir: string, filename: string): string | null {
  // Guard the asset filename itself stays inside uploadsDir (rejects ../, etc.)
  const assetGuard = resolveUploadPath(uploadsDir, filename);
  if (!assetGuard.ok) return null;

  // Use the basename only for the sidecar name (defense-in-depth).
  const base = path.basename(filename);
  if (!base || base.startsWith("..")) return null;

  const sidecarName = "." + base + ".meta.json";
  const guard = resolveUploadPath(uploadsDir, sidecarName);
  if (!guard.ok) return null;
  return guard.path;
}

/**
 * Reads the sidecar metadata for an asset.
 * - Missing sidecar (ENOENT) -> {} (always returns a valid MediaMeta).
 * - Malformed JSON -> {} (tolerated via try/catch).
 * - Traversal/invalid filename -> {}.
 */
export async function getMediaMeta(uploadsDir: string, filename: string): Promise<MediaMeta> {
  const sidecar = resolveSidecarPath(uploadsDir, filename);
  if (!sidecar) return {};

  let raw: string;
  try {
    raw = await fs.readFile(sidecar, "utf-8");
  } catch {
    // ENOENT or any read failure -> empty meta
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const obj = parsed as Record<string, unknown>;
    const meta: MediaMeta = {};
    if (typeof obj.alt === "string" && obj.alt.length > 0) meta.alt = obj.alt;
    if (typeof obj.caption === "string" && obj.caption.length > 0) meta.caption = obj.caption;
    return meta;
  } catch {
    // Malformed JSON -> empty meta
    return {};
  }
}

/**
 * Writes (or clears) the sidecar metadata for an asset.
 * - If both alt and caption are undefined/empty -> deletes the sidecar instead
 *   (no empty sidecars left on disk).
 * - Otherwise atomic write: .{sidecar}.tmp -> rename to the sidecar path.
 * - Silently no-ops on a pathological/invalid filename.
 */
export async function setMediaMeta(
  uploadsDir: string,
  filename: string,
  meta: MediaMeta
): Promise<void> {
  const sidecar = resolveSidecarPath(uploadsDir, filename);
  if (!sidecar) return;

  const alt = typeof meta.alt === "string" ? meta.alt.trim() : "";
  const caption = typeof meta.caption === "string" ? meta.caption.trim() : "";

  // Nothing to store -> delete any existing sidecar.
  if (!alt && !caption) {
    await deleteMediaMeta(uploadsDir, filename);
    return;
  }

  const payload: MediaMeta = {};
  if (alt) payload.alt = alt;
  if (caption) payload.caption = caption;

  const json = JSON.stringify(payload);
  const tmpPath = sidecar + ".tmp";
  try {
    await fs.writeFile(tmpPath, json, "utf-8");
    await fs.rename(tmpPath, sidecar);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

/**
 * Deletes the sidecar for an asset. ENOENT is tolerated (already gone is fine).
 * No-ops on a pathological/invalid filename.
 */
export async function deleteMediaMeta(uploadsDir: string, filename: string): Promise<void> {
  const sidecar = resolveSidecarPath(uploadsDir, filename);
  if (!sidecar) return;

  try {
    await fs.unlink(sidecar);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}
