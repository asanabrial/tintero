import { describe, expect, test } from "bun:test";
import {
  renameInArray,
  mergeInArray,
  removeFromArray,
  findAffectedPosts,
} from "../../src/lib/content/taxonomy-ops";

// ============================================================
// renameInArray
// ============================================================

describe("renameInArray", () => {
  test("replaces a matching value (case-insensitive: 'typescrpit' matches 'TypeScrpit')", () => {
    const arr = ["TypeScrpit", "React"];
    const result = renameInArray(arr, "typescrpit", "TypeScript");
    expect(result).toEqual(["TypeScript", "React"]);
  });

  test("no-match is a no-op — returns array equal to input", () => {
    const arr = ["React", "CSS"];
    const result = renameInArray(arr, "Vue", "Nuxt");
    expect(result).toEqual(["React", "CSS"]);
  });

  test("dedupe when newValue already present — collapses to first occurrence", () => {
    const arr = ["js", "JavaScript"];
    const result = renameInArray(arr, "js", "JavaScript");
    expect(result).toEqual(["JavaScript"]);
  });

  test("first-occurrence order preserved after dedupe", () => {
    const arr = ["TypeScript", "js", "React"];
    const result = renameInArray(arr, "js", "TypeScript");
    // "TypeScript" is already at index 0 → "js" replaced with "TypeScript" → dedupe keeps first → ["TypeScript", "React"]
    expect(result).toEqual(["TypeScript", "React"]);
  });

  test("case-insensitive match: 'react' matches 'REACT'", () => {
    const arr = ["REACT", "vue"];
    const result = renameInArray(arr, "react", "React");
    expect(result).toEqual(["React", "vue"]);
  });

  test("slash-path non-cascade: renaming 'Tech' does NOT touch 'Tech/JavaScript'", () => {
    const arr = ["Tech", "Tech/JavaScript"];
    const result = renameInArray(arr, "Tech", "Technology");
    expect(result).toEqual(["Technology", "Tech/JavaScript"]);
  });

  test("does not mutate the input array", () => {
    const arr = ["React", "TypeScript"];
    const copy = [...arr];
    renameInArray(arr, "react", "React.js");
    expect(arr).toEqual(copy);
  });
});

// ============================================================
// mergeInArray
// ============================================================

describe("mergeInArray", () => {
  test("replaces source with target and deduplicates", () => {
    const arr = ["JS", "React"];
    const result = mergeInArray(arr, "JS", "JavaScript");
    expect(result).toEqual(["JavaScript", "React"]);
  });

  test("both source and target present — collapses to single occurrence preserving first position", () => {
    const arr = ["JS", "JavaScript", "React"];
    const result = mergeInArray(arr, "js", "JavaScript");
    expect(result).toEqual(["JavaScript", "React"]);
  });

  test("absent source is a no-op", () => {
    const arr = ["React", "TypeScript"];
    const result = mergeInArray(arr, "Vue", "Nuxt");
    expect(result).toEqual(["React", "TypeScript"]);
  });

  test("does not mutate the input array", () => {
    const arr = ["JS", "React"];
    const copy = [...arr];
    mergeInArray(arr, "JS", "JavaScript");
    expect(arr).toEqual(copy);
  });
});

// ============================================================
// removeFromArray
// ============================================================

describe("removeFromArray", () => {
  test("removes matching value (case-insensitive)", () => {
    const arr = ["React", "TypeScript", "CSS"];
    const result = removeFromArray(arr, "typescript", "tags");
    expect(result).toEqual(["React", "CSS"]);
  });

  test("empty result for categories → returns ['Uncategorized']", () => {
    const arr = ["Uncategorized"];
    const result = removeFromArray(arr, "uncategorized", "categories");
    expect(result).toEqual(["Uncategorized"]);
  });

  test("empty result for tags → returns []", () => {
    const arr = ["draft"];
    const result = removeFromArray(arr, "draft", "tags");
    expect(result).toEqual([]);
  });

  test("no-match is a no-op", () => {
    const arr = ["React", "TypeScript"];
    const result = removeFromArray(arr, "Vue", "tags");
    expect(result).toEqual(["React", "TypeScript"]);
  });

  test("does not mutate the input array", () => {
    const arr = ["draft", "published"];
    const copy = [...arr];
    removeFromArray(arr, "draft", "tags");
    expect(arr).toEqual(copy);
  });
});

// ============================================================
// findAffectedPosts
// ============================================================

interface MinPost {
  slug: string;
  tags: string[];
  categories: string[];
}

describe("findAffectedPosts", () => {
  const posts: MinPost[] = [
    { slug: "post-1", tags: ["React", "TypeScript"], categories: ["Tech"] },
    { slug: "post-2", tags: ["CSS"], categories: ["Design"] },
    { slug: "post-3", tags: ["react"], categories: ["Tech", "Open Source"] },
    { slug: "post-4", tags: ["Vue"], categories: ["Frontend"] },
  ];

  test("returns only posts whose specified field contains a matching value", () => {
    const result = findAffectedPosts(posts, "tags", "react");
    const slugs = result.map((p) => p.slug);
    expect(slugs).toContain("post-1");
    expect(slugs).toContain("post-3");
    expect(slugs).not.toContain("post-2");
    expect(slugs).not.toContain("post-4");
  });

  test("field-scoped: matching 'react' in tags does NOT match a post with 'react' only in categories", () => {
    const mixedPosts: MinPost[] = [
      { slug: "only-in-categories", tags: [], categories: ["React"] },
      { slug: "only-in-tags", tags: ["React"], categories: ["Tech"] },
    ];
    const result = findAffectedPosts(mixedPosts, "tags", "react");
    const slugs = result.map((p) => p.slug);
    expect(slugs).toContain("only-in-tags");
    expect(slugs).not.toContain("only-in-categories");
  });

  test("case-insensitive match", () => {
    const result = findAffectedPosts(posts, "categories", "tech");
    const slugs = result.map((p) => p.slug);
    expect(slugs).toContain("post-1");
    expect(slugs).toContain("post-3");
    expect(slugs).not.toContain("post-2");
  });

  test("returns empty array when no posts match", () => {
    const result = findAffectedPosts(posts, "tags", "angular");
    expect(result).toEqual([]);
  });
});
