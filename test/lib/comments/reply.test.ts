import { describe, expect, test } from "bun:test";
import type { Comment } from "../../../src/lib/comments/types";
import { buildReplyInput } from "../../../src/lib/comments/reply";

const makeParent = (overrides: Partial<Comment> = {}): Comment => ({
  id: "parent-uuid-1234",
  postSlug: "some-post",
  authorName: "Original Author",
  authorEmail: "original@example.com",
  authorUrl: null,
  body: "The original comment body",
  status: "approved",
  parentId: null,
  createdAt: new Date("2024-01-01T00:00:00Z"),
  ...overrides,
});

describe("buildReplyInput", () => {
  test("maps postSlug from parent.postSlug", () => {
    const parent = makeParent({ postSlug: "my-blog-post" });
    const result = buildReplyInput(parent, "Admin", "admin@site.com", "Great post!");
    expect(result.postSlug).toBe("my-blog-post");
  });

  test("maps parentId from parent.id", () => {
    const parent = makeParent({ id: "deadbeef-0000-0000-0000-000000000000" });
    const result = buildReplyInput(parent, "Admin", "admin@site.com", "Reply body");
    expect(result.parentId).toBe("deadbeef-0000-0000-0000-000000000000");
  });

  test("passes authorName verbatim", () => {
    const parent = makeParent();
    const result = buildReplyInput(parent, "Site Admin", "admin@site.com", "Reply");
    expect(result.authorName).toBe("Site Admin");
  });

  test("passes authorEmail verbatim", () => {
    const parent = makeParent();
    const result = buildReplyInput(parent, "Admin", "moderator@example.com", "Reply");
    expect(result.authorEmail).toBe("moderator@example.com");
  });

  test("passes body verbatim", () => {
    const parent = makeParent();
    const result = buildReplyInput(parent, "Admin", "admin@site.com", "This is the reply body.");
    expect(result.body).toBe("This is the reply body.");
  });

  test("authorUrl is undefined", () => {
    const parent = makeParent();
    const result = buildReplyInput(parent, "Admin", "admin@site.com", "Reply");
    expect(result.authorUrl).toBeUndefined();
  });

  test("happy-path: full field mapping", () => {
    const parent = makeParent({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      postSlug: "hello-world",
    });
    const result = buildReplyInput(parent, "Alice", "alice@mod.com", "Thanks for sharing!");
    expect(result).toEqual({
      postSlug: "hello-world",
      authorName: "Alice",
      authorEmail: "alice@mod.com",
      authorUrl: undefined,
      body: "Thanks for sharing!",
      parentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
  });
});
