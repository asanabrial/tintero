import { describe, expect, test } from "bun:test";
import { buildTagIndex, slugifyTag } from "../../src/lib/content/tag";

describe("slugifyTag", () => {
  test("converts to lowercase", () => {
    expect(slugifyTag("TypeScript")).toBe("typescript");
  });

  test("converts spaces to hyphens", () => {
    expect(slugifyTag("hello world")).toBe("hello-world");
  });

  test("converts special characters to hyphens and collapses/trims them", () => {
    // C++ → lowercase → c++ → each non-alnum → hyphen → c-- → trailing stripped → c
    expect(slugifyTag("C++")).toBe("c");
  });

  test("trims leading and trailing hyphens", () => {
    expect(slugifyTag("  hello  ")).toBe("hello");
  });
});

describe("buildTagIndex", () => {
  test("deduplicates tags with the same slug", () => {
    const tags = buildTagIndex([["TypeScript", "typescript"]]);
    const tsSlugs = tags.filter((t) => t.slug === "typescript");
    expect(tsSlugs).toHaveLength(1);
  });

  test("display label is preserved from the first occurrence", () => {
    const tags = buildTagIndex([["TypeScript"], ["typescript"]]);
    const ts = tags.find((t) => t.slug === "typescript");
    expect(ts?.label).toBe("TypeScript");
  });

  test("count reflects total occurrences across all post tag arrays", () => {
    const tags = buildTagIndex([
      ["typescript", "javascript"],
      ["typescript"],
      ["javascript"],
    ]);
    const ts = tags.find((t) => t.slug === "typescript");
    const js = tags.find((t) => t.slug === "javascript");
    expect(ts?.count).toBe(2);
    expect(js?.count).toBe(2);
  });
});
