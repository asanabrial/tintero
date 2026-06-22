import { describe, it, expect } from "bun:test";
import { capThreadDepth, paginateThreads } from "./thread-utils";
import type { CommentThread } from "./types";

// Helper to create a minimal CommentThread matching the actual PublicComment shape
function makeThread(id: number, replyCount = 0): CommentThread {
  const comment = {
    id: String(id),
    postSlug: "test-post",
    parentId: null,
    authorName: "Test",
    authorUrl: null,
    body: `Comment ${id}`,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    status: "approved" as const,
  };
  const replies = Array.from({ length: replyCount }, (_, i) => ({
    id: String(id * 100 + i + 1),
    postSlug: "test-post",
    parentId: String(id),
    authorName: "Test",
    authorUrl: null,
    body: `Reply ${i + 1} to ${id}`,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    status: "approved" as const,
  }));
  return { comment, replies };
}

describe("capThreadDepth", () => {
  it("maxDepth 0 returns threads unchanged (unlimited)", () => {
    const threads = [makeThread(1, 2), makeThread(2, 1)];
    const result = capThreadDepth(threads, 0);
    expect(result).toEqual(threads);
  });

  it("maxDepth 0 preserves all replies", () => {
    const threads = [makeThread(1, 3)];
    const result = capThreadDepth(threads, 0);
    expect(result[0].replies).toHaveLength(3);
  });

  it("maxDepth 1 preserves direct replies (they are at depth 1 which is <= maxDepth)", () => {
    const threads = [makeThread(1, 2)];
    const result = capThreadDepth(threads, 1);
    expect(result[0].replies).toHaveLength(2);
  });

  it("preserves comment content, not just structure", () => {
    const threads = [makeThread(42, 1)];
    const result = capThreadDepth(threads, 1);
    expect(result[0].comment.id).toBe("42");
    expect(result[0].comment.body).toBe("Comment 42");
    expect(result[0].replies[0].body).toBe("Reply 1 to 42");
  });

  it("empty threads array returns empty array", () => {
    expect(capThreadDepth([], 0)).toEqual([]);
    expect(capThreadDepth([], 1)).toEqual([]);
  });
});

describe("paginateThreads", () => {
  it("perPage 0 returns all threads in one page (no paging)", () => {
    const threads = Array.from({ length: 10 }, (_, i) => makeThread(i + 1));
    const result = paginateThreads(threads, 1, 0);
    expect(result.items).toHaveLength(10);
    expect(result.totalPages).toBe(1);
  });

  it("perPage 0 empty array returns empty items and totalPages 1", () => {
    const result = paginateThreads([], 1, 0);
    expect(result.items).toHaveLength(0);
    expect(result.totalPages).toBe(1);
  });

  it("page 1 with perPage 2 of 5 items returns first 2", () => {
    const threads = Array.from({ length: 5 }, (_, i) => makeThread(i + 1));
    const result = paginateThreads(threads, 1, 2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].comment.id).toBe("1");
    expect(result.items[1].comment.id).toBe("2");
  });

  it("page 2 with perPage 2 of 5 items returns items 3-4", () => {
    const threads = Array.from({ length: 5 }, (_, i) => makeThread(i + 1));
    const result = paginateThreads(threads, 2, 2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].comment.id).toBe("3");
    expect(result.items[1].comment.id).toBe("4");
  });

  it("page 3 with perPage 2 of 5 items returns item 5 only", () => {
    const threads = Array.from({ length: 5 }, (_, i) => makeThread(i + 1));
    const result = paginateThreads(threads, 3, 2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].comment.id).toBe("5");
  });

  it("page out of range (too high) returns last page content", () => {
    const threads = Array.from({ length: 5 }, (_, i) => makeThread(i + 1));
    const result = paginateThreads(threads, 99, 2);
    expect(result.items[0].comment.id).toBe("5");
    expect(result.totalPages).toBe(3);
  });

  it("page 0 or negative is clamped to page 1", () => {
    const threads = Array.from({ length: 5 }, (_, i) => makeThread(i + 1));
    const result0 = paginateThreads(threads, 0, 2);
    const resultNeg = paginateThreads(threads, -5, 2);
    expect(result0.items[0].comment.id).toBe("1");
    expect(resultNeg.items[0].comment.id).toBe("1");
  });

  it("exact division: 4 items perPage 2 = totalPages 2", () => {
    const threads = Array.from({ length: 4 }, (_, i) => makeThread(i + 1));
    expect(paginateThreads(threads, 1, 2).totalPages).toBe(2);
  });

  it("non-divisible: 5 items perPage 2 = totalPages 3", () => {
    const threads = Array.from({ length: 5 }, (_, i) => makeThread(i + 1));
    expect(paginateThreads(threads, 1, 2).totalPages).toBe(3);
  });

  it("perPage 0 returns ALL items regardless of count", () => {
    const threads = Array.from({ length: 100 }, (_, i) => makeThread(i + 1));
    const result = paginateThreads(threads, 1, 0);
    expect(result.items).toHaveLength(100);
    expect(result.totalPages).toBe(1);
  });
});
