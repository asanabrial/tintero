import { describe, expect, test } from "bun:test";
import { WidgetSchema, WidgetsConfigSchema } from "../../../src/lib/widgets/schema";

describe("WidgetSchema", () => {
  test("valid recent-posts widget parses correctly", () => {
    const result = WidgetSchema.safeParse({ type: "recent-posts", title: "Latest", count: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("recent-posts");
      expect(result.data.title).toBe("Latest");
      expect(result.data.count).toBe(5);
    }
  });

  test("valid categories widget parses correctly", () => {
    const result = WidgetSchema.safeParse({ type: "categories", title: "Categories" });
    expect(result.success).toBe(true);
  });

  test("valid tag-cloud widget parses correctly", () => {
    const result = WidgetSchema.safeParse({ type: "tag-cloud" });
    expect(result.success).toBe(true);
  });

  test("valid search widget parses correctly", () => {
    const result = WidgetSchema.safeParse({ type: "search", title: "Search" });
    expect(result.success).toBe(true);
  });

  test("valid custom-html widget parses correctly", () => {
    const result = WidgetSchema.safeParse({ type: "custom-html", html: "<p>Hello</p>" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.html).toBe("<p>Hello</p>");
    }
  });

  test("invalid type fails parse", () => {
    const result = WidgetSchema.safeParse({ type: "invalid-type" });
    expect(result.success).toBe(false);
  });

  test("missing type fails parse", () => {
    const result = WidgetSchema.safeParse({ title: "No type" });
    expect(result.success).toBe(false);
  });

  test("count must be a positive integer", () => {
    const neg = WidgetSchema.safeParse({ type: "recent-posts", count: -1 });
    expect(neg.success).toBe(false);
    const zero = WidgetSchema.safeParse({ type: "recent-posts", count: 0 });
    expect(zero.success).toBe(false);
    const pos = WidgetSchema.safeParse({ type: "recent-posts", count: 3 });
    expect(pos.success).toBe(true);
  });
});

describe("WidgetsConfigSchema", () => {
  test("valid config with multiple widgets parses correctly", () => {
    const input = {
      "blog-sidebar": [
        { type: "recent-posts", title: "Recent Posts", count: 5 },
        { type: "categories", title: "Categories" },
        { type: "search" },
      ],
    };
    const result = WidgetsConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data["blog-sidebar"]).toHaveLength(3);
    }
  });

  test("invalid widget in array is dropped, valid ones survive", () => {
    const input = {
      "blog-sidebar": [
        { type: "recent-posts", title: "Good" },
        { type: "totally-invalid-type" },
        { type: "search" },
      ],
    };
    const result = WidgetsConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data["blog-sidebar"]).toHaveLength(2);
      expect(result.data["blog-sidebar"][0].type).toBe("recent-posts");
      expect(result.data["blog-sidebar"][1].type).toBe("search");
    }
  });

  test("missing blog-sidebar defaults to empty array", () => {
    const result = WidgetsConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data["blog-sidebar"]).toEqual([]);
    }
  });

  test("all 5 widget types parse correctly", () => {
    const input = {
      "blog-sidebar": [
        { type: "recent-posts" },
        { type: "categories" },
        { type: "tag-cloud" },
        { type: "search" },
        { type: "custom-html", html: "<b>hi</b>" },
      ],
    };
    const result = WidgetsConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data["blog-sidebar"]).toHaveLength(5);
    }
  });
});
