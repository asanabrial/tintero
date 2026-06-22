import { describe, expect, test } from "bun:test";
import { slugifyCategory, joinSlug, matchesCategory, buildCategoryIndex } from "../../src/lib/content/category";

describe("slugifyCategory", () => {
  test("splits on slash before slugifying — Tech/JavaScript → [\"tech\",\"javascript\"]", () => {
    expect(slugifyCategory("Tech/JavaScript")).toEqual(["tech", "javascript"]);
  });

  test("single segment → [\"tech\"]", () => {
    expect(slugifyCategory("tech")).toEqual(["tech"]);
  });

  test("spaces in segments — Tech Stuff/JavaScript → [\"tech-stuff\",\"javascript\"]", () => {
    expect(slugifyCategory("Tech Stuff/JavaScript")).toEqual(["tech-stuff", "javascript"]);
  });

  test("leading and trailing slashes filtered — /leading/slash/ → [\"leading\",\"slash\"]", () => {
    expect(slugifyCategory("/leading/slash/")).toEqual(["leading", "slash"]);
  });

  test("empty string → []", () => {
    expect(slugifyCategory("")).toEqual([]);
  });

  test("double slash filtered — tech//js → [\"tech\",\"js\"]", () => {
    expect(slugifyCategory("tech//js")).toEqual(["tech", "js"]);
  });

  test("preserves lowercase already-slug segment", () => {
    expect(slugifyCategory("open-source")).toEqual(["open-source"]);
  });

  test("only-slash string → []", () => {
    expect(slugifyCategory("///")).toEqual([]);
  });
});

describe("joinSlug", () => {
  test("joins segments with /", () => {
    expect(joinSlug(["tech", "javascript"])).toBe("tech/javascript");
  });

  test("single segment → same string", () => {
    expect(joinSlug(["tech"])).toBe("tech");
  });

  test("empty array → empty string", () => {
    expect(joinSlug([])).toBe("");
  });
});

describe("matchesCategory", () => {
  test("exact match → true", () => {
    expect(matchesCategory("tech", "tech")).toBe(true);
  });

  test("startsWith with / boundary → true", () => {
    expect(matchesCategory("tech/javascript", "tech")).toBe(true);
  });

  test("NO false prefix: technology does NOT match tech filter", () => {
    expect(matchesCategory("technology", "tech")).toBe(false);
  });

  test("inner-boundary: tech/javascriptextended does NOT match tech/javascript", () => {
    expect(matchesCategory("tech/javascriptextended", "tech/javascript")).toBe(false);
  });

  test("exact deep match → true", () => {
    expect(matchesCategory("tech/javascript", "tech/javascript")).toBe(true);
  });

  test("uncategorized exact → true", () => {
    expect(matchesCategory("uncategorized", "uncategorized")).toBe(true);
  });

  test("child does NOT match parent filter in reverse direction", () => {
    // "tech" post does NOT match filter "tech/javascript"
    expect(matchesCategory("tech", "tech/javascript")).toBe(false);
  });
});

describe("buildCategoryIndex", () => {
  test("nested paths emit intermediate parents", () => {
    const result = buildCategoryIndex([["tech/javascript"], ["tech/typescript"], ["open-source"]]);
    const slugs = result.map((c) => c.slug);
    expect(slugs).toContain("open-source");
    expect(slugs).toContain("tech");
    expect(slugs).toContain("tech/javascript");
    expect(slugs).toContain("tech/typescript");
  });

  test("parent count equals number of posts under it", () => {
    const result = buildCategoryIndex([["tech/javascript"], ["tech/typescript"], ["open-source"]]);
    const tech = result.find((c) => c.slug === "tech");
    expect(tech).toBeDefined();
    expect(tech!.count).toBe(2);
  });

  test("leaf count is 1 for single post", () => {
    const result = buildCategoryIndex([["tech/javascript"], ["tech/typescript"], ["open-source"]]);
    const leaf = result.find((c) => c.slug === "tech/javascript");
    expect(leaf!.count).toBe(1);
  });

  test("anti-double-count: one post with two sibling leaves counts parent ONCE", () => {
    // One post declares both "tech/javascript" and "tech/typescript"
    const result = buildCategoryIndex([["tech/javascript", "tech/typescript"]]);
    const tech = result.find((c) => c.slug === "tech");
    expect(tech).toBeDefined();
    expect(tech!.count).toBe(1);
  });

  test("anti-double-count: post declaring parent+child counts parent ONCE", () => {
    const result = buildCategoryIndex([["tech", "tech/javascript"]]);
    const tech = result.find((c) => c.slug === "tech");
    expect(tech).toBeDefined();
    expect(tech!.count).toBe(1);
  });

  test("empty input returns empty array", () => {
    const result = buildCategoryIndex([]);
    expect(result).toEqual([]);
  });

  test("output is sorted alphabetically by slug", () => {
    const result = buildCategoryIndex([["tech/javascript"], ["open-source"]]);
    const slugs = result.map((c) => c.slug);
    expect(slugs).toEqual([...slugs].sort());
  });

  test("intermediate parent emitted even if no post directly declares it", () => {
    // Only "tech/javascript" declared — "tech" must still appear
    const result = buildCategoryIndex([["tech/javascript"]]);
    const slugs = result.map((c) => c.slug);
    expect(slugs).toContain("tech");
  });

  test("depth equals segments.length", () => {
    const result = buildCategoryIndex([["tech/javascript"]]);
    const tech = result.find((c) => c.slug === "tech");
    const leaf = result.find((c) => c.slug === "tech/javascript");
    expect(tech!.depth).toBe(1);
    expect(leaf!.depth).toBe(2);
  });

  test("label first-occurrence-wins from raw segment", () => {
    // Raw input "Tech/JavaScript" — label for "tech" should be "Tech"
    const result = buildCategoryIndex([["Tech/JavaScript"]]);
    const tech = result.find((c) => c.slug === "tech");
    expect(tech!.label).toBe("Tech");
  });

  test("segments array matches slug split", () => {
    const result = buildCategoryIndex([["tech/javascript"]]);
    const leaf = result.find((c) => c.slug === "tech/javascript");
    expect(leaf!.segments).toEqual(["tech", "javascript"]);
    expect(leaf!.segments.join("/")).toBe(leaf!.slug);
  });
});

