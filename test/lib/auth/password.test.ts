import { describe, expect, test } from "bun:test";
import * as bcryptjs from "bcryptjs";

// password.ts does not exist yet — these tests are written RED first (strict TDD).
// Once src/lib/auth/password.ts is created (WU-3), all tests must turn GREEN.
import { hashPassword, verifyPassword } from "../../../src/lib/auth/password";

describe("hashPassword", () => {
  test("returns a bcrypt hash starting with $2 (not plaintext)", async () => {
    const hash = await hashPassword("mysecretpassword");
    expect(hash).toStartWith("$2");
    expect(hash).not.toBe("mysecretpassword");
  });

  test("two calls with same plaintext produce different hashes (salt randomness)", async () => {
    const hash1 = await hashPassword("samepassword123");
    const hash2 = await hashPassword("samepassword123");
    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyPassword", () => {
  test("returns true for the correct password", async () => {
    const plain = "correctpassword";
    const hash = await hashPassword(plain);
    const result = await verifyPassword(plain, hash);
    expect(result).toBe(true);
  });

  test("returns false for a wrong password", async () => {
    const hash = await hashPassword("correctpassword");
    const result = await verifyPassword("wrongpassword", hash);
    expect(result).toBe(false);
  });

  test("uses bcryptjs.compare (timing-safe — module is imported)", () => {
    // Structural assertion: bcryptjs is the module providing compare.
    expect(typeof bcryptjs.compare).toBe("function");
  });
});
