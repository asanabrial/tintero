import { describe, expect, test } from "bun:test";
import {
  slugifyAuthor,
  filterPostsByAuthor,
  buildAuthorIndex,
  type AuthorEntry,
} from "../../src/lib/content/author";
import { slugifyTag } from "../../src/lib/content/tag";
import type { Post } from "../../src/lib/content/types";

// ---------------------------------------------------------------------------
// Inline Post fixture helper
// ---------------------------------------------------------------------------

function makePost(slug: string, author: string, date = "2025-01-01"): Post {
  return {
    slug,
    title: slug,
    date,
    status: "published",
    tags: [],
    categories: [],
    excerpt: "",
    html: "",
    comments: false,
    sticky: false,
    author,
    visibility: "public",
  };
}

// ---------------------------------------------------------------------------
// slugifyAuthor
// ---------------------------------------------------------------------------

describe("slugifyAuthor", () => {
  test('"Jane Doe" → "jane-doe"', () => {
    expect(slugifyAuthor("Jane Doe")).toBe("jane-doe");
  });

  test("single lowercase word is unchanged", () => {
    expect(slugifyAuthor("alice")).toBe("alice");
  });

  test("uppercase single word is lowercased", () => {
    expect(slugifyAuthor("ALICE")).toBe("alice");
  });

  test('delegates to slugifyTag — "O\'Brien" result matches slugifyTag', () => {
    expect(slugifyAuthor("O'Brien")).toBe(slugifyTag("O'Brien"));
  });

  test("leading and trailing spaces are trimmed", () => {
    expect(slugifyAuthor("  Jane Doe  ")).toBe("jane-doe");
  });

  test("multiple internal spaces collapse to single hyphen", () => {
    expect(slugifyAuthor("Jane  Doe")).toBe("jane-doe");
  });
});

// ---------------------------------------------------------------------------
// filterPostsByAuthor
// ---------------------------------------------------------------------------

describe("filterPostsByAuthor", () => {
  const jane1 = makePost("post-1", "Jane Doe", "2025-03-01");
  const jane2 = makePost("post-2", "Jane Doe", "2025-06-01");
  const alice = makePost("post-3", "Alice Smith");

  test("returns matching posts by author slug", () => {
    const result = filterPostsByAuthor([jane1, jane2, alice], "jane-doe");
    expect(result.map((p) => p.slug)).toEqual(["post-1", "post-2"]);
  });

  test("excludes non-matching authors", () => {
    const result = filterPostsByAuthor([jane1, alice], "alice-smith");
    expect(result.map((p) => p.slug)).toEqual(["post-3"]);
  });

  test("multiple posts by same author all returned", () => {
    const result = filterPostsByAuthor([jane1, jane2], "jane-doe");
    expect(result).toHaveLength(2);
  });

  test("empty input returns empty array", () => {
    expect(filterPostsByAuthor([], "jane-doe")).toEqual([]);
  });

  test("no match returns empty array", () => {
    const result = filterPostsByAuthor([jane1, alice], "bob-jones");
    expect(result).toEqual([]);
  });

  test("slug-equal distinct display names both match", () => {
    // "Jane Doe" and "JANE DOE" both slugify to "jane-doe"
    const janeLower = makePost("p1", "Jane Doe");
    const janeUpper = makePost("p2", "JANE DOE");
    const result = filterPostsByAuthor([janeLower, janeUpper], "jane-doe");
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// buildAuthorIndex
// ---------------------------------------------------------------------------

describe("buildAuthorIndex", () => {
  test("empty input returns empty array", () => {
    expect(buildAuthorIndex([])).toEqual([]);
  });

  test("single author entry has correct name, slug, and count", () => {
    const posts = [makePost("p1", "Jane Doe"), makePost("p2", "Jane Doe")];
    const result = buildAuthorIndex(posts);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<AuthorEntry>({
      name: "Jane Doe",
      slug: "jane-doe",
      count: 2,
    });
  });

  test("multiple authors with correct counts", () => {
    const posts = [
      makePost("p1", "Jane Doe"),
      makePost("p2", "Jane Doe"),
      makePost("p3", "Alice Smith"),
      makePost("p4", "Alice Smith"),
      makePost("p5", "Alice Smith"),
    ];
    const result = buildAuthorIndex(posts);
    expect(result).toHaveLength(2);
    const alice = result.find((e) => e.slug === "alice-smith")!;
    const jane = result.find((e) => e.slug === "jane-doe")!;
    expect(alice.count).toBe(3);
    expect(jane.count).toBe(2);
  });

  test("sorted by slug ascending", () => {
    const posts = [
      makePost("p1", "Jane Doe"),
      makePost("p2", "Alice Smith"),
      makePost("p3", "Bob Jones"),
    ];
    const result = buildAuthorIndex(posts);
    expect(result.map((e) => e.slug)).toEqual([
      "alice-smith",
      "bob-jones",
      "jane-doe",
    ]);
  });

  test("first-occurrence display name wins on slug collision", () => {
    // "Jane Doe" appears before "JANE DOE" → name should be "Jane Doe"
    const posts = [
      makePost("p1", "Jane Doe"),
      makePost("p2", "JANE DOE"),
    ];
    const result = buildAuthorIndex(posts);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Jane Doe");
    expect(result[0].count).toBe(2);
  });

  test("slug collision merges counts correctly", () => {
    const posts = [
      makePost("p1", "Jane Doe"),
      makePost("p2", "jane doe"),
      makePost("p3", "JANE DOE"),
    ];
    const result = buildAuthorIndex(posts);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
  });
});
