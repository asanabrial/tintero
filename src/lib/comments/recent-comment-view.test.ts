import { describe, it, expect } from "bun:test";
import { toRecentCommentView } from "./recent-comment-view";
import type { Comment } from "./types";

// Fixture factory — builds a minimal valid Comment.
function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    postSlug: "hello-world",
    authorName: "Alice",
    authorEmail: "alice@example.com",
    authorUrl: null,
    body: "This is a comment body.",
    status: "approved",
    parentId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("toRecentCommentView", () => {
  describe("Security: authorEmail must not appear in output", () => {
    it("does not have an authorEmail property on the returned object", () => {
      const comment = makeComment({ authorEmail: "alice@example.com" });
      const view = toRecentCommentView(comment);
      expect("authorEmail" in view).toBe(false);
    });

    it("does not have a body property on the returned object", () => {
      const comment = makeComment({ body: "Secret body text." });
      const view = toRecentCommentView(comment);
      expect("body" in view).toBe(false);
    });

    it("does not have an authorUrl property on the returned object", () => {
      const comment = makeComment({ authorUrl: "https://attacker.example" });
      const view = toRecentCommentView(comment);
      expect("authorUrl" in view).toBe(false);
    });

    it("JSON.stringify output does not contain the author email", () => {
      const email = "alice@example.com";
      const comment = makeComment({ authorEmail: email });
      const view = toRecentCommentView(comment);
      expect(JSON.stringify(view)).not.toContain(email);
    });
  });

  describe("Field mapping: safe fields are copied 1:1", () => {
    it("maps id", () => {
      expect(toRecentCommentView(makeComment({ id: "xyz-123" })).id).toBe("xyz-123");
    });

    it("maps postSlug", () => {
      expect(toRecentCommentView(makeComment({ postSlug: "my-post" })).postSlug).toBe("my-post");
    });

    it("maps authorName", () => {
      expect(toRecentCommentView(makeComment({ authorName: "Bob" })).authorName).toBe("Bob");
    });

    it("maps status", () => {
      expect(toRecentCommentView(makeComment({ status: "pending" })).status).toBe("pending");
    });

    it("maps createdAt", () => {
      const date = new Date("2025-06-15T12:00:00Z");
      expect(toRecentCommentView(makeComment({ createdAt: date })).createdAt).toBe(date);
    });
  });

  describe("Excerpt: truncation and whitespace normalization", () => {
    it("returns body unchanged when shorter than 140 chars (no ellipsis)", () => {
      const body = "Short body text.";
      const view = toRecentCommentView(makeComment({ body }));
      expect(view.excerpt).toBe("Short body text.");
      expect(view.excerpt.endsWith("…")).toBe(false);
    });

    it("returns exactly the body text when length is exactly 140 chars", () => {
      const body = "a".repeat(140);
      const view = toRecentCommentView(makeComment({ body }));
      expect(view.excerpt).toBe(body);
      expect(view.excerpt.endsWith("…")).toBe(false);
    });

    it("truncates body longer than 140 chars and appends ellipsis", () => {
      const body = "a".repeat(200);
      const view = toRecentCommentView(makeComment({ body }));
      expect(view.excerpt.length).toBeLessThanOrEqual(141); // 140 chars + "…" (1 char)
      expect(view.excerpt.endsWith("…")).toBe(true);
    });

    it("excerpt content for long body is exactly the first 140 chars + ellipsis", () => {
      const body = "ab".repeat(100); // 200 chars
      const view = toRecentCommentView(makeComment({ body }));
      expect(view.excerpt).toBe(body.slice(0, 140) + "…");
    });

    it("returns empty string for empty body", () => {
      const view = toRecentCommentView(makeComment({ body: "" }));
      expect(view.excerpt).toBe("");
    });

    it("collapses internal newlines to single spaces", () => {
      const body = "line one\nline two\nline three";
      const view = toRecentCommentView(makeComment({ body }));
      expect(view.excerpt).toBe("line one line two line three");
    });

    it("collapses multiple spaces to a single space", () => {
      const body = "word1  word2   word3";
      const view = toRecentCommentView(makeComment({ body }));
      expect(view.excerpt).toBe("word1 word2 word3");
    });

    it("collapses mixed whitespace (newlines + spaces) to single spaces", () => {
      const body = "word1\n  word2\r\n  word3";
      const view = toRecentCommentView(makeComment({ body }));
      expect(view.excerpt).toBe("word1 word2 word3");
    });

    it("trims leading and trailing whitespace after collapsing", () => {
      const body = "  trimmed content  ";
      const view = toRecentCommentView(makeComment({ body }));
      expect(view.excerpt).toBe("trimmed content");
    });
  });
});
