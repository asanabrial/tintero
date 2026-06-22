import { describe, expect, test } from "bun:test";
import { hashPostPassword } from "../../../src/lib/content/post-password";

describe("hashPostPassword", () => {
  test("is deterministic for the same input", () => {
    expect(hashPostPassword("hunter2")).toBe(hashPostPassword("hunter2"));
  });

  test("differs for different inputs", () => {
    expect(hashPostPassword("hunter2")).not.toBe(hashPostPassword("hunter3"));
  });

  test("does not return the plaintext password", () => {
    const hash = hashPostPassword("hunter2");
    expect(hash).not.toContain("hunter2");
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });
});
