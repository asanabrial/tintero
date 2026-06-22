import { describe, expect, test } from "bun:test";
import { matchesAdminStatus, computeStatusCounts, clampPage } from "../../../src/lib/content/schedule";
import type { Post } from "../../../src/lib/content/types";

// Inline minimal Post fixture factory
const mk = (over: Partial<Post> & { status?: "published" | "draft"; date?: string }): Post => ({
  slug: "test-post",
  title: "Test Post",
  date: "2026-01-01",
  status: "published",
  tags: [],
  categories: [],
  excerpt: "",
  html: "",
  comments: false,
  sticky: false,
  author: "Test Author",
  visibility: "public",
  ...over,
});

const NOW = "2026-06-14";

// ---------------------------------------------------------------------------
// matchesAdminStatus
// ---------------------------------------------------------------------------

describe("matchesAdminStatus", () => {
  test("draft post matches 'draft' filter", () => {
    expect(matchesAdminStatus(mk({ status: "draft", date: "2026-01-01" }), "draft", NOW)).toBe(true);
  });

  test("draft post does not match 'published' filter", () => {
    expect(matchesAdminStatus(mk({ status: "draft" }), "published", NOW)).toBe(false);
  });

  test("draft post does not match 'scheduled' filter", () => {
    expect(matchesAdminStatus(mk({ status: "draft" }), "scheduled", NOW)).toBe(false);
  });

  test("published past-dated post matches 'published' filter", () => {
    expect(matchesAdminStatus(mk({ status: "published", date: "2026-01-01" }), "published", NOW)).toBe(true);
  });

  test("published past-dated post does not match 'scheduled' filter", () => {
    expect(matchesAdminStatus(mk({ status: "published", date: "2026-01-01" }), "scheduled", NOW)).toBe(false);
  });

  test("published future-dated post matches 'scheduled' filter", () => {
    expect(matchesAdminStatus(mk({ status: "published", date: "2099-12-31" }), "scheduled", NOW)).toBe(true);
  });

  test("published future-dated post does not match 'published' filter", () => {
    expect(matchesAdminStatus(mk({ status: "published", date: "2099-12-31" }), "published", NOW)).toBe(false);
  });

  test("BOUNDARY: published date === now is 'published', not 'scheduled'", () => {
    expect(matchesAdminStatus(mk({ status: "published", date: NOW }), "published", NOW)).toBe(true);
    expect(matchesAdminStatus(mk({ status: "published", date: NOW }), "scheduled", NOW)).toBe(false);
  });

  test("draft with future date is still 'draft', not 'scheduled'", () => {
    expect(matchesAdminStatus(mk({ status: "draft", date: "2099-01-01" }), "draft", NOW)).toBe(true);
    expect(matchesAdminStatus(mk({ status: "draft", date: "2099-01-01" }), "scheduled", NOW)).toBe(false);
  });

  test("undefined adminStatus passes all posts (All tab)", () => {
    expect(matchesAdminStatus(mk({ status: "draft" }), undefined, NOW)).toBe(true);
    expect(matchesAdminStatus(mk({ status: "published", date: "2026-01-01" }), undefined, NOW)).toBe(true);
    expect(matchesAdminStatus(mk({ status: "published", date: "2099-12-31" }), undefined, NOW)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeStatusCounts
// ---------------------------------------------------------------------------

describe("computeStatusCounts", () => {
  test("empty array returns all zeros", () => {
    expect(computeStatusCounts([], NOW)).toEqual({ all: 0, published: 0, draft: 0, scheduled: 0 });
  });

  test("mixed fixture yields exact counts", () => {
    const posts = [
      mk({ status: "published", date: "2026-01-01" }), // published
      mk({ status: "published", date: "2026-05-01" }), // published
      mk({ status: "draft", date: "2026-01-01" }),     // draft
      mk({ status: "published", date: "2099-12-31" }), // scheduled
    ];
    expect(computeStatusCounts(posts, NOW)).toEqual({ all: 4, published: 2, draft: 1, scheduled: 1 });
  });

  test("partition invariant: published + draft + scheduled === all", () => {
    const posts = [
      mk({ status: "published", date: "2026-01-01" }),
      mk({ status: "draft" }),
      mk({ status: "published", date: "2099-01-01" }),
      mk({ status: "draft", date: "2099-01-01" }),
      mk({ status: "published", date: NOW }),
    ];
    const result = computeStatusCounts(posts, NOW);
    expect(result.published + result.draft + result.scheduled).toBe(result.all);
    expect(result.all).toBe(posts.length);
  });

  test("BOUNDARY: date === now counts as published, not scheduled", () => {
    const posts = [mk({ status: "published", date: NOW })];
    const result = computeStatusCounts(posts, NOW);
    expect(result.published).toBe(1);
    expect(result.scheduled).toBe(0);
  });

  test("draft with future date counts as draft, not scheduled", () => {
    const posts = [mk({ status: "draft", date: "2099-01-01" })];
    const result = computeStatusCounts(posts, NOW);
    expect(result.draft).toBe(1);
    expect(result.scheduled).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// clampPage
// ---------------------------------------------------------------------------

describe("clampPage", () => {
  test("in-range page is returned as-is", () => {
    expect(clampPage(1, 5)).toBe(1);
    expect(clampPage(3, 5)).toBe(3);
    expect(clampPage(5, 5)).toBe(5);
  });

  test("page above range is clamped to totalPages", () => {
    expect(clampPage(6, 5)).toBe(5);
    expect(clampPage(99, 5)).toBe(5);
  });

  test("page below 1 returns 1", () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(-3, 5)).toBe(1);
  });

  test("NaN returns 1", () => {
    expect(clampPage(NaN, 5)).toBe(1);
  });

  test("float is floored", () => {
    expect(clampPage(2.7, 5)).toBe(2);
    expect(clampPage(4.9, 5)).toBe(4);
  });

  test("totalPages = 0 always returns 1", () => {
    expect(clampPage(1, 0)).toBe(1);
    expect(clampPage(3, 0)).toBe(1);
    expect(clampPage(0, 0)).toBe(1);
  });
});
