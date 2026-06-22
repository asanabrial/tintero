// R1 path: pure-helper
// connection() throws outside Next request scope in bun:test, so we test the
// pure helper buildTagsListJson() directly. The route handler (connection() + helper) is
// not unit-tested — it's the thin wrapper per the R1 fallback strategy.
//
// All tests are env-free (tags are markdown-derived, no DATABASE_URL needed).

import { describe, expect, test } from "bun:test";
import { buildTagsListJson } from "../../src/app/api/v1/tags/route";
import { buildTagSingleJson } from "../../src/app/api/v1/tags/[slug]/route";
import { buildCategoriesListJson } from "../../src/app/api/v1/categories/route";
import { buildCategorySingleJson } from "../../src/app/api/v1/categories/[...slug]/route";

// ============================================================
// Tags list
// ============================================================

describe("buildTagsListJson (tags list helper)", () => {
  test("returns tags envelope with required fields", async () => {
    const body = await buildTagsListJson();
    expect(Array.isArray(body.tags)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(typeof body.page).toBe("number");
    expect(typeof body.pageSize).toBe("number");
    expect(body.page).toBe(1);
    expect(body.total).toBe(body.tags.length);
    expect(body.pageSize).toBe(body.tags.length);
  });

  test("each tag has slug, label, count", async () => {
    const body = await buildTagsListJson();
    for (const tag of body.tags) {
      expect(typeof tag.slug).toBe("string");
      expect(typeof tag.label).toBe("string");
      expect(typeof tag.count).toBe("number");
    }
  });
});

// ============================================================
// Tags single
// ============================================================

describe("buildTagSingleJson (tags single helper)", () => {
  test("non-existent slug returns null", async () => {
    const result = await buildTagSingleJson("this-slug-does-not-exist-xyz");
    expect(result).toBeNull();
  });

  test("existing slug returns tag with correct fields", async () => {
    const list = await buildTagsListJson();
    if (list.tags.length === 0) {
      // No tags in content dir — skip
      return;
    }
    const first = list.tags[0];
    const result = await buildTagSingleJson(first.slug);
    expect(result).not.toBeNull();
    expect(result!.slug).toBe(first.slug);
    expect(result!.label).toBe(first.label);
    expect(result!.count).toBe(first.count);
  });
});

// ============================================================
// Categories list
// ============================================================

describe("buildCategoriesListJson (categories list helper)", () => {
  test("returns categories envelope with required fields", async () => {
    const body = await buildCategoriesListJson();
    expect(Array.isArray(body.categories)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(typeof body.page).toBe("number");
    expect(typeof body.pageSize).toBe("number");
    expect(body.page).toBe(1);
    expect(body.total).toBe(body.categories.length);
  });

  test("each category has slug, label, count, depth, segments", async () => {
    const body = await buildCategoriesListJson();
    for (const cat of body.categories) {
      expect(typeof cat.slug).toBe("string");
      expect(typeof cat.label).toBe("string");
      expect(typeof cat.count).toBe("number");
      expect(typeof cat.depth).toBe("number");
      expect(Array.isArray(cat.segments)).toBe(true);
    }
  });

  test("hierarchical categories have depth > 1 and matching segments", async () => {
    const body = await buildCategoriesListJson();
    const hierarchical = body.categories.filter((c) => c.depth > 1);
    for (const cat of hierarchical) {
      expect(cat.segments.length).toBeGreaterThan(1);
      expect(cat.slug).toBe(cat.segments.join("/"));
    }
  });
});

// ============================================================
// Categories single (catch-all)
// ============================================================

describe("buildCategorySingleJson (categories single helper)", () => {
  test("non-existent path returns null", async () => {
    const result = await buildCategorySingleJson(["foo", "bar"]);
    expect(result).toBeNull();
  });

  test("existing category path returns category with correct fields", async () => {
    const list = await buildCategoriesListJson();
    if (list.categories.length === 0) {
      return;
    }
    const first = list.categories[0];
    const result = await buildCategorySingleJson(first.segments);
    expect(result).not.toBeNull();
    expect(result!.slug).toBe(first.slug);
    expect(result!.depth).toBe(first.depth);
    expect(result!.segments).toEqual(first.segments);
  });
});
