import { describe, expect, test } from "bun:test";
import { floatStickyPosts } from "../../../src/lib/content/sticky";
import type { Post } from "../../../src/lib/content/types";

// Minimal Post factory — only fields relevant to sticky logic
function makePost(slug: string, sticky: boolean): Post {
  return {
    slug,
    title: slug,
    date: "2024-01-01",
    status: "published",
    tags: [],
    categories: [],
    excerpt: "",
    html: "",
    comments: true,
    author: "Test",
    sticky,
    visibility: "public",
  };
}

describe("floatStickyPosts", () => {
  test("stable partition: sticky posts float to top, non-sticky follow", () => {
    const A = makePost("a", false);
    const B = makePost("b", true);
    const C = makePost("c", false);
    const D = makePost("d", true);
    const result = floatStickyPosts([A, B, C, D]);
    expect(result.map((p) => p.slug)).toEqual(["b", "d", "a", "c"]);
  });

  test("all-sticky returns same order", () => {
    const A = makePost("a", true);
    const B = makePost("b", true);
    const C = makePost("c", true);
    const result = floatStickyPosts([A, B, C]);
    expect(result.map((p) => p.slug)).toEqual(["a", "b", "c"]);
  });

  test("none-sticky returns same order", () => {
    const A = makePost("a", false);
    const B = makePost("b", false);
    const result = floatStickyPosts([A, B]);
    expect(result.map((p) => p.slug)).toEqual(["a", "b"]);
  });

  test("empty array returns empty array", () => {
    expect(floatStickyPosts([])).toEqual([]);
  });

  test("single sticky post returns same array", () => {
    const A = makePost("a", true);
    const result = floatStickyPosts([A]);
    expect(result.map((p) => p.slug)).toEqual(["a"]);
  });

  test("single non-sticky post returns same array", () => {
    const A = makePost("a", false);
    const result = floatStickyPosts([A]);
    expect(result.map((p) => p.slug)).toEqual(["a"]);
  });

  test("does not mutate the original array", () => {
    const A = makePost("a", false);
    const B = makePost("b", true);
    const input = [A, B];
    floatStickyPosts(input);
    expect(input.map((p) => p.slug)).toEqual(["a", "b"]);
  });
});
