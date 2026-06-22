// API authentication helper — DB-free, never throws.
// Dual mode: Bearer API_TOKEN OR session cookie (JWT).
// NEVER imports from next/headers or readSessionCookie (server-only, no-arg).
// Reads the session cookie off the passed Request — unit-testable.
//
// NOTE: does NOT import from @/lib/auth/session because that module has
// `import "server-only"` which breaks Bun unit tests.
// Instead we inline the AUTH_SECRET read (same semantics, same throw contract).

import { verifyToken } from "@/lib/auth/session-token";

/**
 * Reads AUTH_SECRET from environment at call-time.
 * Throws a descriptive error if unset — same contract as session.ts#getAuthSecret.
 * Inlined here to avoid the server-only transitive import from session.ts.
 */
function getAuthSecretLocal(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set — cannot verify session tokens"
    );
  }
  return secret;
}

/**
 * Timing-safe string comparison with length guard.
 * Returns false immediately on length mismatch (no timing info leaked).
 * XOR-accumulates character differences for equal-length strings.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Parses the `session` cookie value from the Cookie header of a Request.
 * Returns null if the header is absent or the session cookie is not found.
 */
function parseSessionCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key === "session") {
      return decodeURIComponent(trimmed.slice(eqIdx + 1));
    }
  }
  return null;
}

/**
 * Returns a masked audit label for the request identity, or null when unauthenticated.
 *
 * - Bearer API_TOKEN path: returns a masked label (NEVER the raw token) such as
 *   `"api-token(••••" + last4 chars of presented token + ")"`.
 * - Session cookie path: returns `"user:" + userId` from the JWT payload.
 * - No auth: returns null.
 *
 * NEVER throws. NEVER returns the raw API_TOKEN. NEVER touches the database.
 * Parallel to verifyApiAuth — verifyApiAuth UNCHANGED (still boolean).
 */
export async function getApiIdentity(req: Request): Promise<string | null> {
  // 1) Bearer API_TOKEN path — only active when API_TOKEN is configured AND matches
  const apiToken = process.env.API_TOKEN;
  if (apiToken) {
    const authz = req.headers.get("authorization") ?? "";
    const match = authz.match(/^Bearer\s+(.+)$/i);
    if (match && safeEqual(match[1], apiToken)) {
      // Return a MASKED label — never the raw token value
      // Use last 4 chars of the PRESENTED token (same as env value on match), never log the full value
      const presented = match[1];
      const last4 = presented.slice(-4);
      return `api-token(••••${last4})`;
    }
  }

  // 2) Session-cookie path — DB-free
  try {
    const cookieToken = parseSessionCookie(req);
    if (cookieToken) {
      const payload = await verifyToken(cookieToken, getAuthSecretLocal());
      if (payload) {
        return `user:${payload.userId}`;
      }
    }
  } catch {
    // AUTH_SECRET unset or any failure → treat as no valid session
  }

  return null;
}

/**
 * Verifies the request is authenticated via either:
 *  1) Authorization: Bearer <API_TOKEN>  (constant-time compare; only if API_TOKEN env is set)
 *  2) session=<jwt> cookie               (verifyToken + getAuthSecret; DB-free)
 *
 * Returns true iff one of the above paths grants access.
 * NEVER throws. NEVER touches the database.
 */
export async function verifyApiAuth(req: Request): Promise<boolean> {
  // 1) Bearer API_TOKEN path — only active when API_TOKEN is configured
  const apiToken = process.env.API_TOKEN;
  if (apiToken) {
    const authz = req.headers.get("authorization") ?? "";
    const match = authz.match(/^Bearer\s+(.+)$/i);
    if (match && safeEqual(match[1], apiToken)) {
      return true;
    }
  }

  // 2) Session-cookie path — DB-free, getAuthSecret throws if AUTH_SECRET unset
  try {
    const cookieToken = parseSessionCookie(req);
    if (cookieToken) {
      const payload = await verifyToken(cookieToken, getAuthSecretLocal());
      if (payload) return true;
    }
  } catch {
    // AUTH_SECRET unset or any failure → treat as no valid session
  }

  return false;
}
