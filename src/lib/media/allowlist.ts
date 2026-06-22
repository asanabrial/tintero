// Media Library — pure allowlist helpers and filename utilities.
// IMPORTANT: NO imports from 'next/cache', 'next/headers', or 'node:fs'.
// This module is pure and must remain independently testable.

import { randomUUID } from "node:crypto";
import * as path from "node:path";
import type { MediaError } from "./types";

// ============================================================
// Constants
// ============================================================

export const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export const EXT_TO_CONTENT_TYPE: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** 5 MB — files whose size is strictly greater than this are rejected. */
export const MAX_BYTES = 5 * 1024 * 1024;

// ============================================================
// Validation predicates
// ============================================================

/**
 * Returns true if the extension (lowercased, dot-prefixed) is in the allowlist.
 */
export function isAllowedExtension(ext: string): boolean {
  return ALLOWED_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Returns true if the MIME type is in the allowlist.
 */
export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime);
}

/**
 * Returns true if the file size is within the allowed limit.
 * Boundary: exactly MAX_BYTES is accepted; MAX_BYTES + 1 is rejected.
 * Zero-byte files are also rejected.
 */
export function isBelowSizeLimit(size: number): boolean {
  return size > 0 && size <= MAX_BYTES;
}

// ============================================================
// Filename sanitization
// ============================================================

/**
 * Sanitizes an original filename for safe storage:
 * 1. Lowercase
 * 2. Take basename only (strip path separators — defense against paths in name)
 * 3. Strip leading dots (no hidden files)
 * 4. Replace any char not in [a-z0-9.-] with '-'
 * 5. Collapse consecutive '-' to a single '-'
 * 6. Trim leading/trailing '-'
 *
 * Returns '' for pathological inputs (empty after all transforms).
 * Callers MUST treat '' as invalid_filename.
 */
export function sanitizeFilename(name: string): string {
  if (!name) return "";

  // 1. Lowercase first
  let s = name.toLowerCase();

  // 2. Extract basename: take everything after the last '/' or '\'
  //    This strips any directory prefix (e.g. "../../etc/passwd" -> "passwd")
  const lastSlash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  if (lastSlash !== -1) {
    s = s.slice(lastSlash + 1);
  }

  // 3. Strip leading dots (hidden files / dotfiles)
  s = s.replace(/^\.+/, "");

  // 4. Separate name and extension to preserve the last '.' separator
  //    Find the last '.' in the remaining string
  const lastDot = s.lastIndexOf(".");
  let base: string;
  let ext: string;
  if (lastDot > 0) {
    base = s.slice(0, lastDot);
    ext = s.slice(lastDot); // includes the dot
  } else {
    base = s;
    ext = "";
  }

  // 5. Replace non-[a-z0-9-] in base and extension chars (excluding the dot we already isolated)
  //    For the extension part (e.g. '.png'), the dot is valid; the rest must be [a-z0-9]
  base = base.replace(/[^a-z0-9]/g, "-");
  // Collapse consecutive hyphens and trim
  base = base.replace(/-+/g, "-").replace(/^-+|-+$/g, "");

  // Clean the extension chars (after the dot): only [a-z0-9] allowed
  if (ext) {
    const extChars = ext.slice(1).replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    ext = extChars ? "." + extChars : "";
  }

  const result = base + ext;

  // If only dots/dashes remained (empty after trim), return ''
  if (!result || result === ".") return "";

  return result;
}

/**
 * Extracts the lowercased dot-prefixed extension from a sanitized filename.
 * Returns '' if no extension is found.
 */
export function extractExtension(sanitizedName: string): string {
  const lastDot = sanitizedName.lastIndexOf(".");
  if (lastDot <= 0) return ""; // No extension or leading dot only
  return sanitizedName.slice(lastDot).toLowerCase();
}

// ============================================================
// Stored filename and URL builders
// ============================================================

/**
 * Builds the final stored filename: `{crypto.randomUUID()}-{sanitized}`.
 * The UUID prefix provides collision-resistance and unguessability.
 */
export function buildStoredFilename(originalName: string): string {
  const sanitized = sanitizeFilename(originalName);
  return `${randomUUID()}-${sanitized}`;
}

/**
 * Returns the public URL for a stored file.
 */
export function buildPublicUrl(filename: string): string {
  return `/uploads/${filename}`;
}

// ============================================================
// Path-traversal guard
// ============================================================

/**
 * Resolves the absolute path for a filename inside uploadsDir and asserts
 * it remains inside uploadsDir. Mirrors resolvePostPath from fs-writer.ts.
 *
 * Returns { ok: true, path } on success.
 * Returns { ok: false, error: { kind: 'invalid_filename' } } on traversal.
 */
export function resolveUploadPath(
  uploadsDir: string,
  filename: string
): { ok: true; path: string } | { ok: false; error: MediaError } {
  const resolved = path.resolve(uploadsDir, filename);
  const safe = path.resolve(uploadsDir) + path.sep;
  if (!resolved.startsWith(safe)) {
    return { ok: false, error: { kind: "invalid_filename", filename } };
  }
  return { ok: true, path: resolved };
}
