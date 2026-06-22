import { describe, expect, test } from "bun:test";
import {
  matchesQuery,
  isTitleMatch,
  applySearch,
  type SearchableEntry,
} from "../../src/lib/content/search";
import type { Post } from "../../src/lib/content/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(overrides: Partial<Post> & { title: string; date: string }): Post {
  return {
    slug: overrides.title.toLowerCase().replace(/\s+/g, "-"),
    title: overrides.title,
    date: overrides.date,
    status: "published",
    tags: overrides.tags ?? [],
    categories: overrides.categories ?? [],
    excerpt: overrides.excerpt ?? "",
    html: overrides.html ?? "",
    comments: overrides.comments ?? true,
    sticky: overrides.sticky ?? false,
    author: overrides.author ?? "Test Author",
    visibility: overrides.visibility ?? "public",
  };
}

function makeEntry(
  post: Post,
  body: string,
): SearchableEntry {
  return { post, body };
}

// ---------------------------------------------------------------------------
// matchesQuery
// ---------------------------------------------------------------------------

describe("matchesQuery", () => {
  test("matchesQuery — returns true when needle is a substring (case-insensitive)", () => {
    expect(matchesQuery("hello world async patterns", "async")).toBe(true);
    // haystack is already lowercased at call site; needle arrives pre-lowercased
    expect(matchesQuery("typescript deep dive", "typescript")).toBe(true);
  });

  test("matchesQuery — returns false when needle absent", () => {
    expect(matchesQuery("hello world", "xyzzy")).toBe(false);
    expect(matchesQuery("", "anything")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isTitleMatch
// ---------------------------------------------------------------------------

describe("isTitleMatch", () => {
  test("isTitleMatch — returns true on case-insensitive title substring", () => {
    expect(isTitleMatch("TypeScript Deep Dive", "typescript")).toBe(true);
    expect(isTitleMatch("Async JavaScript Patterns", "async")).toBe(true);
    expect(isTitleMatch("Hello World", "hello world")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applySearch — scenario tests per spec
// ---------------------------------------------------------------------------

describe("applySearch", () => {
  test("applySearch — title match: S-01 case-insensitive", () => {
    const post = makePost({ title: "TypeScript Deep Dive", date: "2025-01-01" });
    const entries = [makeEntry(post, "some body text without the keyword")];
    const result = applySearch(entries, "typescript");
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe(post.slug);
  });

  test("applySearch — body-only match: S-02", () => {
    const post = makePost({ title: "Unrelated Title", date: "2025-01-01" });
    const entries = [makeEntry(post, "This article talks about performance optimizations")];
    const result = applySearch(entries, "Performance");
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe(post.slug);
  });

  test("applySearch — excerpt-only match: S-03", () => {
    const post = makePost({
      title: "Some Other Post",
      date: "2025-01-01",
      excerpt: "Improving developer experience is key",
    });
    const entries = [makeEntry(post, "body text without the phrase")];
    const result = applySearch(entries, "developer experience");
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe(post.slug);
  });

  test("applySearch — tag match: S-04", () => {
    const post = makePost({
      title: "JavaScript Fundamentals",
      date: "2025-01-01",
      tags: ["javascript", "react"],
    });
    // title/body/excerpt do NOT contain "react"
    const entries = [makeEntry(post, "body about javascript fundamentals")];
    const result = applySearch(entries, "react");
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe(post.slug);
  });

  test("applySearch — category match: S-05", () => {
    const post = makePost({
      title: "My Post",
      date: "2025-01-01",
      categories: ["Web Development"],
    });
    // title/body/excerpt do NOT contain "web development"
    const entries = [makeEntry(post, "completely different body content")];
    const result = applySearch(entries, "web development");
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe(post.slug);
  });

  test("applySearch — title match ranks before newer body-only match: S-06", () => {
    // Post A: older date, title contains "async"
    const postA = makePost({ title: "Async Patterns", date: "2024-01-01" });
    // Post B: newer date, body contains "async" but title does NOT
    const postB = makePost({ title: "JavaScript Guide", date: "2025-06-01" });

    const entries = [
      // Input is already date-desc sorted (newest first per pipeline contract)
      makeEntry(postB, "async programming is covered here"),
      makeEntry(postA, "some body without the keyword"),
    ];

    const result = applySearch(entries, "async");
    expect(result).toHaveLength(2);
    // Post A (title match, Tier 0) must come BEFORE Post B (body match, Tier 1)
    expect(result[0].slug).toBe(postA.slug);
    expect(result[1].slug).toBe(postB.slug);
  });

  test("applySearch — date-desc preserved within tier: S-07", () => {
    const postA = makePost({ title: "Async Patterns Advanced", date: "2025-06-01" });
    const postB = makePost({ title: "Async for Beginners", date: "2024-01-01" });

    // Both title matches (Tier 0); input is date-desc (A before B)
    const entries = [
      makeEntry(postA, "body a"),
      makeEntry(postB, "body b"),
    ];

    const result = applySearch(entries, "async");
    expect(result).toHaveLength(2);
    // Newer (A) should come first within Tier 0
    expect(result[0].slug).toBe(postA.slug);
    expect(result[1].slug).toBe(postB.slug);
  });

  test("applySearch — no results: S-08", () => {
    const post = makePost({ title: "Hello World", date: "2025-01-01" });
    const entries = [makeEntry(post, "some body text")];
    const result = applySearch(entries, "xyzzy");
    expect(result).toHaveLength(0);
  });

  test("applySearch — empty query returns []: S-09", () => {
    const post = makePost({ title: "Hello World", date: "2025-01-01" });
    const entries = [makeEntry(post, "some body text")];
    const result = applySearch(entries, "");
    expect(result).toHaveLength(0);
  });

  test("applySearch — whitespace-only query returns []: S-10", () => {
    const post = makePost({ title: "Hello World", date: "2025-01-01" });
    const entries = [makeEntry(post, "some body text")];
    const result = applySearch(entries, "   ");
    expect(result).toHaveLength(0);
  });

  test("applySearch — leading/trailing whitespace trimmed: S-11", () => {
    const post = makePost({ title: "Next.js Patterns", date: "2025-01-01" });
    const entries = [makeEntry(post, "body")];
    const result = applySearch(entries, "  next.js  ");
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe(post.slug);
  });

  test("applySearch — multi-word query is exact phrase, not tokenised: S-12", () => {
    const postA = makePost({ title: "The quick brown fox jumps over", date: "2025-01-01" });

    const entriesA = [makeEntry(postA, "body")];

    // "quick brown" is an exact substring of postA's title
    expect(applySearch(entriesA, "quick brown")).toHaveLength(1);

    // Demonstrate that non-contiguous phrase does not match:
    const postC = makePost({ title: "A story about foxes", date: "2025-01-01" });
    const entriesC = [makeEntry(postC, "quick and a fox jumped")];
    // "quick fox" is NOT present as exact phrase in body
    expect(applySearch(entriesC, "quick fox")).toHaveLength(0);

    // But "quick" alone matches
    expect(applySearch(entriesC, "quick")).toHaveLength(1);
  });

  test("applySearch — [Tier-1 newer date does not outrank Tier-0 older date]: S-06 cross-tier guard: REQ-RK-04", () => {
    const oldTitleMatch = makePost({ title: "Old Async Article", date: "2020-01-01" });
    const newBodyMatch = makePost({ title: "Brand New Post", date: "2025-12-31" });

    // Input date-desc sorted: newBodyMatch first (2025 > 2020)
    const entries = [
      makeEntry(newBodyMatch, "async programming patterns covered"),
      makeEntry(oldTitleMatch, "body without the keyword"),
    ];

    const result = applySearch(entries, "async");
    expect(result).toHaveLength(2);
    // Tier-0 (oldTitleMatch) MUST precede Tier-1 (newBodyMatch) regardless of date
    expect(result[0].slug).toBe(oldTitleMatch.slug);
    expect(result[1].slug).toBe(newBodyMatch.slug);
  });
});
