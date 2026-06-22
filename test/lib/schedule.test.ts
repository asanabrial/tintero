import { describe, expect, test } from "bun:test";
import { hideFuturePosts, isFuturePost, derivePostDisplayStatus } from "../../src/lib/content/schedule";
import type { Post } from "../../src/lib/content/types";

// Inline minimal Post fixture factory — mirrors related.test.ts style.
const post = (over: Partial<Post>): Post => ({
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

const NOW = "2026-06-13";

// ---------------------------------------------------------------------------
// hideFuturePosts
// ---------------------------------------------------------------------------

describe("hideFuturePosts", () => {
  test("past post is kept", () => {
    const posts = [post({ date: "2025-01-01" })];
    expect(hideFuturePosts(posts, NOW)).toHaveLength(1);
  });

  test("future post is removed", () => {
    const posts = [post({ date: "2026-06-14" })];
    expect(hideFuturePosts(posts, NOW)).toHaveLength(0);
  });

  test("post dated exactly today (date === now) is visible (boundary)", () => {
    const posts = [post({ date: NOW })];
    expect(hideFuturePosts(posts, NOW)).toHaveLength(1);
  });

  test("empty array returns empty array", () => {
    expect(hideFuturePosts([], NOW)).toEqual([]);
  });

  test("all-future array returns empty array", () => {
    const posts = [post({ date: "2027-01-01" }), post({ date: "2099-12-31" })];
    expect(hideFuturePosts(posts, NOW)).toHaveLength(0);
  });

  test("mixed list: only future posts removed, order preserved", () => {
    const past = post({ slug: "past", date: "2026-06-12" });
    const today = post({ slug: "today", date: "2026-06-13" });
    const future = post({ slug: "future", date: "2026-06-14" });
    const result = hideFuturePosts([past, today, future], NOW);
    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe("past");
    expect(result[1].slug).toBe("today");
  });

  test("order of remaining posts is preserved (newest first)", () => {
    const a = post({ slug: "a", date: "2026-06-12" });
    const b = post({ slug: "b", date: "2026-06-11" });
    const c = post({ slug: "c", date: "2026-06-10" });
    const result = hideFuturePosts([a, b, c], NOW);
    expect(result.map((p) => p.slug)).toEqual(["a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// isFuturePost
// ---------------------------------------------------------------------------

describe("isFuturePost", () => {
  test("post dated tomorrow is future → true", () => {
    expect(isFuturePost(post({ date: "2026-06-14" }), NOW)).toBe(true);
  });

  test("post dated today (date === now) is NOT future → false (boundary)", () => {
    expect(isFuturePost(post({ date: NOW }), NOW)).toBe(false);
  });

  test("post dated yesterday is NOT future → false", () => {
    expect(isFuturePost(post({ date: "2026-06-12" }), NOW)).toBe(false);
  });

  test("post dated far past is NOT future → false", () => {
    expect(isFuturePost(post({ date: "2020-01-01" }), NOW)).toBe(false);
  });

  test("post dated far future → true", () => {
    expect(isFuturePost(post({ date: "2099-12-31" }), NOW)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// derivePostDisplayStatus
// ---------------------------------------------------------------------------

describe("derivePostDisplayStatus", () => {
  test("published + future date → 'Scheduled'", () => {
    expect(derivePostDisplayStatus(post({ status: "published", date: "2026-06-14" }), NOW)).toBe("Scheduled");
  });

  test("published + today (date === now) → 'Published' (not Scheduled)", () => {
    expect(derivePostDisplayStatus(post({ status: "published", date: NOW }), NOW)).toBe("Published");
  });

  test("published + past date → 'Published'", () => {
    expect(derivePostDisplayStatus(post({ status: "published", date: "2026-06-01" }), NOW)).toBe("Published");
  });

  test("draft + future date → 'Draft' (draft wins over date)", () => {
    expect(derivePostDisplayStatus(post({ status: "draft", date: "2099-01-01" }), NOW)).toBe("Draft");
  });

  test("draft + past date → 'Draft'", () => {
    expect(derivePostDisplayStatus(post({ status: "draft", date: "2020-01-01" }), NOW)).toBe("Draft");
  });

  test("draft + today date → 'Draft'", () => {
    expect(derivePostDisplayStatus(post({ status: "draft", date: NOW }), NOW)).toBe("Draft");
  });
});
