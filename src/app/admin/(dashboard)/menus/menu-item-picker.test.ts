import { describe, it, expect } from "bun:test";
import { buildCategoryHref, applyAddLinkIntent } from "./menu-item-picker";

describe("buildCategoryHref", () => {
  it("produces /blog/categories/<slug> for a simple slug", () => {
    expect(buildCategoryHref("tech")).toBe("/blog/categories/tech");
  });

  it("produces the correct href for a hierarchical slug", () => {
    expect(buildCategoryHref("tech/javascript")).toBe(
      "/blog/categories/tech/javascript"
    );
  });

  it("handles a three-level slug", () => {
    expect(buildCategoryHref("a/b/c")).toBe("/blog/categories/a/b/c");
  });
});

describe("applyAddLinkIntent", () => {
  it("appends a new item to an empty array", () => {
    const result = applyAddLinkIntent([], "About", "/about");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ label: "About", href: "/about" });
  });

  it("appends to an existing array without mutating it", () => {
    const base = [{ label: "Home", href: "/" }];
    const result = applyAddLinkIntent(base, "Blog", "/blog");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ label: "Home", href: "/" });
    expect(result[1]).toEqual({ label: "Blog", href: "/blog" });
    // original is unchanged
    expect(base).toHaveLength(1);
  });

  it("preserves existing children on existing items", () => {
    const base = [
      {
        label: "Home",
        href: "/",
        children: [{ label: "Sub", href: "/sub" }],
      },
    ];
    const result = applyAddLinkIntent(base, "Docs", "/docs");
    expect(result[0].children).toHaveLength(1);
    expect(result[1]).toEqual({ label: "Docs", href: "/docs" });
  });

  it("added item has no children property", () => {
    const result = applyAddLinkIntent([], "About", "/pages/about");
    expect(result[0].children).toBeUndefined();
  });
});
