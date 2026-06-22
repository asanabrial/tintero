// Route handler tests for /api/v1/search — env-free, file-based (REQ-8).
// Uses buildSearchJson() pure helper — no DATABASE_URL, no connection() needed.
// Tests cover: empty q → empty envelope; whitespace q → empty; non-empty q → shape;
// each post has slug/title; env-free operation.

import { describe, expect, test } from "bun:test";
import { buildSearchJson } from "../../src/app/api/v1/search/route";

// ============================================================
// Empty / whitespace queries (REQ-8.3)
// ============================================================

describe("buildSearchJson — empty q", () => {
  test("empty string → {posts:[], total:0, page:1, pageSize:0}", async () => {
    const result = await buildSearchJson("");
    expect(Array.isArray(result.posts)).toBe(true);
    expect(result.posts).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(0);
  });

  test("whitespace-only string → same empty envelope", async () => {
    const result = await buildSearchJson("   ");
    expect(result.posts).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(0);
  });
});

// ============================================================
// Non-empty query — structural shape (REQ-8.2, REQ-8.6, REQ-8.7)
// ============================================================

describe("buildSearchJson — non-empty q", () => {
  test("returns PostListJson envelope shape", async () => {
    // Use a term unlikely to match anything — still must return valid envelope shape
    const result = await buildSearchJson("xyzzy-no-match-expected-qqq");
    expect(Array.isArray(result.posts)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(typeof result.page).toBe("number");
    expect(typeof result.pageSize).toBe("number");
    expect(result.page).toBe(1);
    expect(result.total).toBe(result.posts.length);
    expect(result.pageSize).toBe(result.posts.length);
  });

  test("matching query: each post has slug, title, html (toPostJson shape)", async () => {
    // Query a common word likely to match at least one content post
    // If no posts match, test still passes (structural check only)
    const result = await buildSearchJson("a");
    for (const post of result.posts) {
      expect(typeof post.slug).toBe("string");
      expect(post.slug.length).toBeGreaterThan(0);
      expect(typeof post.title).toBe("string");
      expect(typeof post.html).toBe("string");
      expect(typeof post.date).toBe("string");
      expect(typeof post.status).toBe("string");
      expect(Array.isArray(post.tags)).toBe(true);
    }
  });

  test("env-free: works without DATABASE_URL (file-based)", async () => {
    const dbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const result = await buildSearchJson("the");
      // Must not throw; must return valid envelope
      expect(Array.isArray(result.posts)).toBe(true);
      expect(typeof result.total).toBe("number");
      expect(result.page).toBe(1);
    } finally {
      if (dbUrl !== undefined) {
        process.env.DATABASE_URL = dbUrl;
      }
    }
  });

  test("total equals posts.length", async () => {
    const result = await buildSearchJson("post");
    expect(result.total).toBe(result.posts.length);
    expect(result.pageSize).toBe(result.posts.length);
  });
});

// ============================================================
// Future posts excluded (REQ-8.4)
// ============================================================

describe("buildSearchJson — future posts excluded", () => {
  test("no returned post has a date in the future relative to today", async () => {
    const result = await buildSearchJson("a");
    const today = new Date().toISOString().slice(0, 10);
    for (const post of result.posts) {
      // Published posts must have date <= today; drafts should be filtered out
      expect(post.date <= today).toBe(true);
    }
  });
});
