import { describe, expect, test } from "bun:test";
import { CommentSubmissionSchema } from "../../../src/lib/comments/validation";

describe("CommentSubmissionSchema", () => {
  const validInput = {
    authorName: "Alice",
    authorEmail: "alice@example.com",
    body: "This is a valid comment body.",
    parentId: null,
  };

  test("valid full input passes", () => {
    const result = CommentSubmissionSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  test("authorName: whitespace-only fails after trim", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      authorName: "   ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("authorName"))).toBe(true);
    }
  });

  test("authorName: empty string fails", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      authorName: "",
    });
    expect(result.success).toBe(false);
  });

  test("authorName: > 100 chars fails", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      authorName: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  test("authorName: exactly 100 chars passes", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      authorName: "a".repeat(100),
    });
    expect(result.success).toBe(true);
  });

  test("authorEmail: invalid format fails", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      authorEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("authorEmail"))).toBe(true);
    }
  });

  test("authorEmail: valid format passes", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      authorEmail: "user+tag@sub.example.org",
    });
    expect(result.success).toBe(true);
  });

  test("body: less than 10 chars after trim fails", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      body: "Hi",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("body"))).toBe(true);
    }
  });

  test("body: whitespace padding does not help (trimmed then checked)", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      body: "   Hi   ",
    });
    expect(result.success).toBe(false);
  });

  test("body: > 5000 chars fails", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      body: "a".repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  test("body: exactly 5000 chars passes", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      body: "a".repeat(5000),
    });
    expect(result.success).toBe(true);
  });

  test("authorUrl: empty string treated as absent (undefined)", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      authorUrl: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.authorUrl).toBeUndefined();
    }
  });

  test("authorUrl: invalid URL fails", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      authorUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  test("authorUrl: valid URL passes", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      authorUrl: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.authorUrl).toBe("https://example.com");
    }
  });

  test("authorUrl: absent passes (optional)", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.authorUrl).toBeUndefined();
    }
  });

  test("unknown fields are stripped", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      website: "http://spam.example.com",
      extra: "field",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).website).toBeUndefined();
      expect((result.data as Record<string, unknown>).extra).toBeUndefined();
    }
  });

  test("parentId: null passes", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      parentId: null,
    });
    expect(result.success).toBe(true);
  });

  test("parentId: undefined passes", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      parentId: undefined,
    });
    expect(result.success).toBe(true);
  });

  test("parentId: valid UUID passes", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      parentId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  test("parentId: invalid string fails", () => {
    const result = CommentSubmissionSchema.safeParse({
      ...validInput,
      parentId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
