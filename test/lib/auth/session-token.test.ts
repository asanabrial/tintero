import { describe, expect, test } from "bun:test";

// session-token.ts does not exist yet — written RED first (strict TDD).
// Once src/lib/auth/session-token.ts is created, all tests must turn GREEN.
import { signToken, verifyToken } from "../../../src/lib/auth/session-token";
import type { SessionPayload } from "../../../src/lib/auth/types";

const SECRET = "test-secret-that-is-long-enough-for-hs256";

const samplePayload: SessionPayload = {
  userId: "user-uuid-1234",
  role: "admin",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

describe("signToken + verifyToken — round-trip", () => {
  test("verifyToken returns original payload after signToken", async () => {
    const token = await signToken(samplePayload, SECRET);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // JWT format

    const verified = await verifyToken(token, SECRET);
    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe(samplePayload.userId);
    expect(verified!.role).toBe(samplePayload.role);
  });
});

describe("verifyToken — rejection cases", () => {
  test("tampered token returns null", async () => {
    const token = await signToken(samplePayload, SECRET);
    // Tamper the signature segment (3rd JWT part) — flip its FIRST character,
    // which (unlike the last char) carries no base64url padding bits, so the
    // change always alters the decoded signature bytes and must be rejected.
    const parts = token.split(".");
    const sig = parts[2];
    const tamperedSig = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    const tampered = [parts[0], parts[1], tamperedSig].join(".");
    const result = await verifyToken(tampered, SECRET);
    expect(result).toBeNull();
  });

  test("token signed with secret A, verified with secret B returns null", async () => {
    const token = await signToken(samplePayload, SECRET);
    const result = await verifyToken(token, "different-secret-entirely");
    expect(result).toBeNull();
  });

  test("expired token returns null", async () => {
    // Sign a token with expiresAt already in the past — jose will reject it
    const expiredPayload: SessionPayload = {
      userId: "user-expired",
      role: "admin",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    // We need to sign with an explicit past expiration for jose to reject it.
    // We'll use jose directly to create a token expired 1 second ago.
    const { SignJWT } = await import("jose");
    const key = new TextEncoder().encode(SECRET);
    const expiredToken = await new SignJWT({
      userId: expiredPayload.userId,
      role: expiredPayload.role,
      expiresAt: expiredPayload.expiresAt,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(new Date(Date.now() - 1000)) // 1 second ago
      .sign(key);

    const result = await verifyToken(expiredToken, SECRET);
    expect(result).toBeNull();
  });

  test("malformed non-JWT string returns null", async () => {
    const result = await verifyToken("this.is.not.a.valid.jwt", SECRET);
    expect(result).toBeNull();
  });

  test("empty string returns null", async () => {
    const result = await verifyToken("", SECRET);
    expect(result).toBeNull();
  });
});
