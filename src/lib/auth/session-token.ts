// Session token utilities — pure jose sign/verify with an INJECTED secret.
// No React, Next.js, or cookie imports — fully testable in isolation.

import { SignJWT, jwtVerify } from "jose";
import type { SessionPayload, Role } from "./types";

/**
 * Signs a SessionPayload as a JWT using HS256.
 * The token expires in 7 days from signing.
 *
 * @param payload - The session data to embed in the token.
 * @param secret  - The raw string secret (injected — not read from env here).
 */
export async function signToken(
  payload: SessionPayload,
  secret: string
): Promise<string> {
  const encodedSecret = new TextEncoder().encode(secret);
  return new SignJWT({
    userId: payload.userId,
    role: payload.role,
    expiresAt: payload.expiresAt,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedSecret);
}

/**
 * Verifies a JWT and returns its payload, or null on any failure
 * (invalid signature, expired, malformed, wrong secret, etc.).
 *
 * @param token  - The JWT string to verify.
 * @param secret - The raw string secret to verify against.
 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<SessionPayload | null> {
  try {
    const encodedSecret = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, encodedSecret);
    return {
      userId: payload.userId as string,
      role: payload.role as Role,
      expiresAt: payload.expiresAt as string,
    };
  } catch {
    return null;
  }
}
