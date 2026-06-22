// HTTP response helpers for the content API.
// Maps WriteError variants to correct HTTP status codes and JSON bodies.

import type { WriteError } from "@/lib/content";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

/**
 * Returns a 200 (or custom status) Response with a JSON body.
 */
export function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": JSON_CONTENT_TYPE },
  });
}

/**
 * Returns an error Response with a JSON body: { error: message, ...extra }.
 * NEVER leaks internal details beyond what is explicitly passed.
 */
export function jsonError(
  status: number,
  message: string,
  extra?: Record<string, unknown>
): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { "Content-Type": JSON_CONTENT_TYPE },
  });
}

/**
 * Maps a WriteError discriminated union to the correct HTTP Response.
 * Exhaustive switch — TypeScript will error on unhandled variants.
 *
 * Mapping table:
 *   invalid_frontmatter → 400 { error, issues }
 *   invalid_slug        → 400 { error, slug }
 *   slug_collision      → 409 { error, slug }
 *   post_not_found      → 404 { error, slug }
 *   page_not_found      → 404 { error, slug }
 *
 * Thrown non-WriteError errors (FS I/O) are NOT WriteError — the caller
 * must catch those and call jsonError(500, "Internal error").
 */
export function writeErrorResponse(err: WriteError): Response {
  switch (err.kind) {
    case "invalid_frontmatter":
      return jsonError(400, "Invalid frontmatter", { issues: err.issues });
    case "invalid_slug":
      return jsonError(400, "Invalid slug", { slug: err.slug });
    case "slug_collision":
      return jsonError(409, "Slug already exists", { slug: err.slug });
    case "post_not_found":
      return jsonError(404, "Post not found", { slug: err.slug });
    case "page_not_found":
      return jsonError(404, "Page not found", { slug: err.slug });
  }
}
