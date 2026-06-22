import { describe, expect, test } from "bun:test";
import { EditCommentBodySchema } from "../../../src/lib/comments/edit-validation";

describe("EditCommentBodySchema", () => {
  test("valid body passes", () => {
    const r = EditCommentBodySchema.safeParse({ body: "This is a valid edit body." });
    expect(r.success).toBe(true);
  });

  test("empty body fails", () => {
    const r = EditCommentBodySchema.safeParse({ body: "" });
    expect(r.success).toBe(false);
  });

  test("whitespace-only body fails after trim", () => {
    const r = EditCommentBodySchema.safeParse({ body: "   " });
    expect(r.success).toBe(false);
  });

  test("body under 10 chars fails", () => {
    const r = EditCommentBodySchema.safeParse({ body: "Hi" });
    expect(r.success).toBe(false);
  });

  test("body over 5000 chars fails", () => {
    const r = EditCommentBodySchema.safeParse({ body: "a".repeat(5001) });
    expect(r.success).toBe(false);
  });

  test("body exactly 5000 chars passes", () => {
    const r = EditCommentBodySchema.safeParse({ body: "a".repeat(5000) });
    expect(r.success).toBe(true);
  });

  test("body exactly 10 chars passes", () => {
    const r = EditCommentBodySchema.safeParse({ body: "a".repeat(10) });
    expect(r.success).toBe(true);
  });
});
