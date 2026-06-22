import { describe, expect, test } from "bun:test";
import { scorePost, relatedPosts, prevNextPosts } from "../../src/lib/content/related";
import type { Post } from "../../src/lib/content/types";

// Fixture factory — mirrors category.test.ts style
const post = (over: Partial<Post>): Post => ({
  slug: "x",
  title: "X",
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

// ---------------------------------------------------------------------------
// scorePost
// ---------------------------------------------------------------------------

describe("scorePost", () => {
  test("category match scores 2", () => {
    const current = post({ slug: "a", categories: ["Tech/JavaScript"] });
    const candidate = post({ slug: "b", categories: ["Tech/JavaScript"] });
    expect(scorePost(current, candidate)).toBe(2);
  });

  test("tag match scores 1", () => {
    const current = post({ slug: "a", tags: ["node"] });
    const candidate = post({ slug: "b", tags: ["node"] });
    expect(scorePost(current, candidate)).toBe(1);
  });

  test("1 shared category + 1 shared tag scores 3", () => {
    const current = post({ slug: "a", categories: ["Tech/JavaScript"], tags: ["node"] });
    const candidate = post({ slug: "b", categories: ["Tech/JavaScript"], tags: ["node"] });
    expect(scorePost(current, candidate)).toBe(3);
  });

  test("multiple shared categories accumulate", () => {
    const current = post({ slug: "a", categories: ["Tech/JavaScript", "Open Source"] });
    const candidate = post({ slug: "b", categories: ["Tech/JavaScript", "Open Source"] });
    expect(scorePost(current, candidate)).toBe(4); // 2 cats × 2 each
  });

  test("slash-path category 'Tech/JavaScript' vs 'Tech/JavaScript' matches (joinSlug∘slugifyCategory)", () => {
    const current = post({ slug: "a", categories: ["Tech/JavaScript"] });
    const candidate = post({ slug: "b", categories: ["Tech/JavaScript"] });
    expect(scorePost(current, candidate)).toBe(2);
  });

  test("case-normalized tag 'JavaScript' vs 'javascript' matches via slugifyTag", () => {
    const current = post({ slug: "a", tags: ["JavaScript"] });
    const candidate = post({ slug: "b", tags: ["javascript"] });
    expect(scorePost(current, candidate)).toBe(1);
  });

  test("tag 'Open Source' vs 'open-source' matches via slugifyTag", () => {
    const current = post({ slug: "a", tags: ["Open Source"] });
    const candidate = post({ slug: "b", tags: ["open-source"] });
    expect(scorePost(current, candidate)).toBe(1);
  });

  test("zero shared → 0", () => {
    const current = post({ slug: "a", categories: ["Tech"], tags: ["js"] });
    const candidate = post({ slug: "b", categories: ["Design"], tags: ["css"] });
    expect(scorePost(current, candidate)).toBe(0);
  });

  test("empty taxonomy both sides → 0", () => {
    const current = post({ slug: "a" });
    const candidate = post({ slug: "b" });
    expect(scorePost(current, candidate)).toBe(0);
  });

  test("non-matching slugs do not count — 'Tech/JavaScript' vs 'Tech/TypeScript'", () => {
    const current = post({ slug: "a", categories: ["Tech/JavaScript"] });
    const candidate = post({ slug: "b", categories: ["Tech/TypeScript"] });
    expect(scorePost(current, candidate)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// relatedPosts
// ---------------------------------------------------------------------------

describe("relatedPosts", () => {
  test("returns top-n by score descending — category outweighs tag", () => {
    const current = post({ slug: "cur", categories: ["Tech/JavaScript"], tags: ["node"] });
    const a = post({ slug: "a", categories: ["Tech/JavaScript"] }); // score 2
    const b = post({ slug: "b", tags: ["node"] }); // score 1
    const result = relatedPosts(current, [current, a, b], 3);
    expect(result.map((p) => p.slug)).toEqual(["a", "b"]);
  });

  test("self excluded by slug", () => {
    const current = post({ slug: "cur", categories: ["Tech"] });
    const result = relatedPosts(current, [current], 3);
    expect(result).toEqual([]);
  });

  test("draft excluded despite taxonomy overlap", () => {
    const current = post({ slug: "cur", categories: ["Tech"] });
    const draft = post({ slug: "d", categories: ["Tech"], status: "draft" });
    const result = relatedPosts(current, [current, draft], 3);
    expect(result).toEqual([]);
  });

  test("score-0 candidate excluded", () => {
    const current = post({ slug: "cur", categories: ["Tech"] });
    const zero = post({ slug: "z", categories: ["Design"] });
    const result = relatedPosts(current, [current, zero], 3);
    expect(result).toEqual([]);
  });

  test("fewer than n positives returns fewer results", () => {
    const current = post({ slug: "cur", categories: ["Tech"] });
    const a = post({ slug: "a", categories: ["Tech"] }); // score 2
    const result = relatedPosts(current, [current, a], 3);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("a");
  });

  test("zero matches returns empty array", () => {
    const current = post({ slug: "cur", categories: ["Tech"] });
    const b = post({ slug: "b", categories: ["Design"] });
    const result = relatedPosts(current, [current, b], 3);
    expect(result).toEqual([]);
  });

  test("empty allPosts returns empty array", () => {
    const current = post({ slug: "cur", categories: ["Tech"] });
    expect(relatedPosts(current, [], 3)).toEqual([]);
  });

  test("date tiebreak — equal score → more recent date first", () => {
    const current = post({ slug: "cur", tags: ["js"] });
    const older = post({ slug: "older", tags: ["js"], date: "2024-03-01" });
    const newer = post({ slug: "newer", tags: ["js"], date: "2024-05-01" });
    const result = relatedPosts(current, [current, older, newer], 3);
    expect(result.map((p) => p.slug)).toEqual(["newer", "older"]);
  });

  test("tag-only matches returned in score order — higher shared tag count wins", () => {
    const current = post({ slug: "cur", tags: ["react", "css"] });
    const a = post({ slug: "a", tags: ["react"] }); // score 1
    const b = post({ slug: "b", tags: ["react", "css"] }); // score 2
    const result = relatedPosts(current, [current, a, b], 3);
    expect(result.map((p) => p.slug)).toEqual(["b", "a"]);
  });

  test("n limits results to at most n posts", () => {
    const current = post({ slug: "cur", tags: ["js"] });
    const candidates = Array.from({ length: 10 }, (_, i) =>
      post({ slug: `p${i}`, tags: ["js"] })
    );
    const result = relatedPosts(current, [current, ...candidates], 3);
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// prevNextPosts
// ---------------------------------------------------------------------------

describe("prevNextPosts", () => {
  const a = post({ slug: "a", date: "2024-01-01" }); // oldest
  const b = post({ slug: "b", date: "2024-06-01" });
  const c = post({ slug: "c", date: "2024-12-01" }); // newest
  // orderedPosts is date-DESC: [c, b, a]
  const ordered = [c, b, a];

  test("middle post → prev is older (i+1), next is newer (i-1)", () => {
    const result = prevNextPosts("b", ordered);
    expect(result.prev?.slug).toBe("a");
    expect(result.next?.slug).toBe("c");
  });

  test("newest post (index 0) → next is null, prev is the next older", () => {
    const result = prevNextPosts("c", ordered);
    expect(result.next).toBeNull();
    expect(result.prev?.slug).toBe("b");
  });

  test("oldest post (last index) → prev is null, next is the next newer", () => {
    const result = prevNextPosts("a", ordered);
    expect(result.prev).toBeNull();
    expect(result.next?.slug).toBe("b");
  });

  test("single-item list → both null", () => {
    const x = post({ slug: "x" });
    const result = prevNextPosts("x", [x]);
    expect(result.prev).toBeNull();
    expect(result.next).toBeNull();
  });

  test("slug not found → both null", () => {
    const result = prevNextPosts("missing", ordered);
    expect(result.prev).toBeNull();
    expect(result.next).toBeNull();
  });

  test("empty orderedPosts → both null", () => {
    const result = prevNextPosts("x", []);
    expect(result.prev).toBeNull();
    expect(result.next).toBeNull();
  });
});
