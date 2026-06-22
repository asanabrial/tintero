import "server-only";

import { cookies } from "next/headers";
import type { Role, SessionPayload } from "./types";
import { signToken, verifyToken } from "./session-token";

/**
 * Reads AUTH_SECRET from environment at call-time (lazy).
 * Throws a human-readable error if the secret is not set.
 * NEVER called at module import — safe at build time.
 */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set — copy .env.example to .env.local and set a long random secret for session signing"
    );
  }
  return secret;
}

/**
 * Signs a session JWT and writes it to the httpOnly session cookie.
 * Must be called from a Server Action or Route Handler (not during render).
 */
export async function createSession(userId: string, role: Role): Promise<void> {
  const secret = getAuthSecret();
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const payload: SessionPayload = { userId, role, expiresAt };
  const token = await signToken(payload, secret);

  (await cookies()).set("session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

/**
 * Clears the session cookie.
 * Must be called from a Server Action or Route Handler (not during render).
 */
export async function deleteSession(): Promise<void> {
  (await cookies()).delete("session");
}

/**
 * Reads and verifies the session cookie.
 * Returns the payload on success, or null if absent / invalid / expired.
 */
export async function readSessionCookie(): Promise<SessionPayload | null> {
  const value = (await cookies()).get("session")?.value;
  if (!value) return null;
  return verifyToken(value, getAuthSecret());
}
