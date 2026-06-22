// Media Library — shared types.
// IMPORTANT: NO imports from 'next/cache', 'next/headers', or 'node:fs'.
// This module is pure and must remain independently testable.

export interface MediaAsset {
  filename: string;
  size: number; // bytes
  url: string; // /uploads/{filename}
}

export type MediaError =
  | { kind: "no_file" }
  | { kind: "invalid_extension"; ext: string }
  | { kind: "invalid_mime"; mime: string }
  | { kind: "too_large"; size: number; max: number }
  | { kind: "invalid_filename"; filename: string }
  | { kind: "write_failed" };

export type UploadResult =
  | { ok: true; asset: MediaAsset }
  | { ok: false; error: MediaError };

export type DeleteResult =
  | { ok: true }
  | { ok: false; error: MediaError };

/**
 * Shape used by useActionState in the UploadForm island.
 * undefined = initial state (no submission yet).
 */
export type MediaFormState =
  | { ok: true }
  | { error: string }
  | undefined;
