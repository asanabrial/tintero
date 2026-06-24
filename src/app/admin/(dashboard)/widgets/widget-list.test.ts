import { describe, it, expect } from "bun:test";
import {
  defaultsForType,
  addWidget,
  removeWidget,
  moveWidget,
  moveWidgetUp,
  moveWidgetDown,
  updateWidget,
} from "./widget-list";
import type { Widget } from "@/lib/widgets/types";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function search(title?: string): Widget {
  return { type: "search", ...(title ? { title } : {}) };
}

function recentPosts(count = 5, title?: string): Widget {
  return { type: "recent-posts", count, ...(title ? { title } : {}) };
}

function customHtml(html = "", title?: string): Widget {
  return { type: "custom-html", html, ...(title ? { title } : {}) };
}

function categories(title?: string): Widget {
  return { type: "categories", ...(title ? { title } : {}) };
}

// ────────────────────────────────────────────────────────────
// defaultsForType
// ────────────────────────────────────────────────────────────

describe("defaultsForType", () => {
  it("returns count: 5 for recent-posts", () => {
    expect(defaultsForType("recent-posts")).toEqual({ count: 5 });
  });

  it("returns html: '' for custom-html", () => {
    expect(defaultsForType("custom-html")).toEqual({ html: "" });
  });

  it("returns empty object for search", () => {
    expect(defaultsForType("search")).toEqual({});
  });

  it("returns empty object for categories", () => {
    expect(defaultsForType("categories")).toEqual({});
  });

  it("returns empty object for tag-cloud", () => {
    expect(defaultsForType("tag-cloud")).toEqual({});
  });

  it("returns count: 5 for pages", () => {
    expect(defaultsForType("pages")).toEqual({ count: 5 });
  });

  it("returns empty object for archives", () => {
    expect(defaultsForType("archives")).toEqual({});
  });

  it("returns count: 5 for recent-comments", () => {
    expect(defaultsForType("recent-comments")).toEqual({ count: 5 });
  });
});

// ────────────────────────────────────────────────────────────
// addWidget
// ────────────────────────────────────────────────────────────

describe("addWidget", () => {
  it("appends a widget at the end of an empty list", () => {
    const result = addWidget([], "search");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("search");
  });

  it("appends at the end of a non-empty list", () => {
    const list: Widget[] = [search(), categories()];
    const result = addWidget(list, "tag-cloud");
    expect(result).toHaveLength(3);
    expect(result[2].type).toBe("tag-cloud");
  });

  it("applies sensible defaults for recent-posts (count: 5)", () => {
    const result = addWidget([], "recent-posts");
    expect(result[0]).toEqual({ type: "recent-posts", count: 5 });
  });

  it("applies sensible defaults for custom-html (html: '')", () => {
    const result = addWidget([], "custom-html");
    expect(result[0]).toEqual({ type: "custom-html", html: "" });
  });

  it("no extra properties for search", () => {
    const result = addWidget([], "search");
    expect(result[0]).toEqual({ type: "search" });
  });

  it("does not mutate input array", () => {
    const list: Widget[] = [search()];
    addWidget(list, "categories");
    expect(list).toHaveLength(1);
  });

  it("returns a new array reference", () => {
    const list: Widget[] = [search()];
    const result = addWidget(list, "categories");
    expect(result).not.toBe(list);
  });
});

// ────────────────────────────────────────────────────────────
// removeWidget
// ────────────────────────────────────────────────────────────

describe("removeWidget", () => {
  it("removes the widget at the given index", () => {
    const list: Widget[] = [search(), categories(), recentPosts()];
    const result = removeWidget(list, 1);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("search");
    expect(result[1].type).toBe("recent-posts");
  });

  it("is a no-op for an out-of-bounds positive index", () => {
    const list: Widget[] = [search(), categories()];
    const result = removeWidget(list, 5);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("search");
    expect(result[1].type).toBe("categories");
  });

  it("is a no-op for a negative index", () => {
    const list: Widget[] = [search()];
    const result = removeWidget(list, -1);
    expect(result).toHaveLength(1);
  });

  it("returns a new array reference even when no-op", () => {
    const list: Widget[] = [search()];
    const result = removeWidget(list, 5);
    expect(result).not.toBe(list);
  });

  it("does not mutate input array", () => {
    const list: Widget[] = [search(), categories()];
    removeWidget(list, 0);
    expect(list).toHaveLength(2);
  });
});

// ────────────────────────────────────────────────────────────
// moveWidget
// ────────────────────────────────────────────────────────────

describe("moveWidget", () => {
  it("moves from index 0 to index 2", () => {
    const list: Widget[] = [search(), categories(), recentPosts()];
    const result = moveWidget(list, 0, 2);
    expect(result.map((w) => w.type)).toEqual(["categories", "recent-posts", "search"]);
  });

  it("moves from index 2 to index 0", () => {
    const list: Widget[] = [search(), categories(), recentPosts()];
    const result = moveWidget(list, 2, 0);
    expect(result.map((w) => w.type)).toEqual(["recent-posts", "search", "categories"]);
  });

  it("identity: from === to returns same order", () => {
    const list: Widget[] = [search(), categories(), recentPosts()];
    const result = moveWidget(list, 1, 1);
    expect(result.map((w) => w.type)).toEqual(["search", "categories", "recent-posts"]);
  });

  it("clamps fromIndex below 0 to 0", () => {
    const list: Widget[] = [search(), categories(), recentPosts()];
    const result = moveWidget(list, -5, 2);
    expect(result.map((w) => w.type)).toEqual(["categories", "recent-posts", "search"]);
  });

  it("clamps toIndex above length-1 to last", () => {
    const list: Widget[] = [search(), categories(), recentPosts()];
    const result = moveWidget(list, 0, 99);
    expect(result.map((w) => w.type)).toEqual(["categories", "recent-posts", "search"]);
  });

  it("does not mutate input array", () => {
    const list: Widget[] = [search(), categories(), recentPosts()];
    moveWidget(list, 0, 2);
    expect(list.map((w) => w.type)).toEqual(["search", "categories", "recent-posts"]);
  });

  it("returns a new array reference", () => {
    const list: Widget[] = [search(), categories()];
    expect(moveWidget(list, 0, 1)).not.toBe(list);
  });
});

// ────────────────────────────────────────────────────────────
// moveWidgetUp
// ────────────────────────────────────────────────────────────

describe("moveWidgetUp", () => {
  it("swaps widget with the one above it", () => {
    const list: Widget[] = [search(), categories(), recentPosts()];
    const result = moveWidgetUp(list, 1);
    expect(result.map((w) => w.type)).toEqual(["categories", "search", "recent-posts"]);
  });

  it("moving first item up is a no-op (index 0)", () => {
    const list: Widget[] = [search(), categories(), recentPosts()];
    const result = moveWidgetUp(list, 0);
    expect(result.map((w) => w.type)).toEqual(["search", "categories", "recent-posts"]);
  });

  it("does not mutate input array", () => {
    const list: Widget[] = [search(), categories()];
    moveWidgetUp(list, 1);
    expect(list.map((w) => w.type)).toEqual(["search", "categories"]);
  });

  it("returns a new array reference", () => {
    const list: Widget[] = [search(), categories()];
    expect(moveWidgetUp(list, 1)).not.toBe(list);
  });
});

// ────────────────────────────────────────────────────────────
// moveWidgetDown
// ────────────────────────────────────────────────────────────

describe("moveWidgetDown", () => {
  it("swaps widget with the one below it", () => {
    const list: Widget[] = [search(), categories(), recentPosts()];
    const result = moveWidgetDown(list, 1);
    expect(result.map((w) => w.type)).toEqual(["search", "recent-posts", "categories"]);
  });

  it("moving last item down is a no-op", () => {
    const list: Widget[] = [search(), categories(), recentPosts()];
    const result = moveWidgetDown(list, 2);
    expect(result.map((w) => w.type)).toEqual(["search", "categories", "recent-posts"]);
  });

  it("does not mutate input array", () => {
    const list: Widget[] = [search(), categories()];
    moveWidgetDown(list, 0);
    expect(list.map((w) => w.type)).toEqual(["search", "categories"]);
  });

  it("returns a new array reference", () => {
    const list: Widget[] = [search(), categories()];
    expect(moveWidgetDown(list, 0)).not.toBe(list);
  });
});

// ────────────────────────────────────────────────────────────
// updateWidget
// ────────────────────────────────────────────────────────────

describe("updateWidget", () => {
  it("updates the title of a widget", () => {
    const list: Widget[] = [search(), categories()];
    const result = updateWidget(list, 0, { title: "Find" });
    expect(result[0].title).toBe("Find");
    expect(result[1].title).toBeUndefined();
  });

  it("updates the count of a recent-posts widget", () => {
    const list: Widget[] = [recentPosts(5)];
    const result = updateWidget(list, 0, { count: 10 });
    expect(result[0]).toEqual({ type: "recent-posts", count: 10 });
  });

  it("updates the html of a custom-html widget", () => {
    const list: Widget[] = [customHtml("")];
    const result = updateWidget(list, 0, { html: "<p>Hello</p>" });
    expect(result[0]).toEqual({ type: "custom-html", html: "<p>Hello</p>" });
  });

  it("is a no-op for an out-of-bounds index (returns new array copy)", () => {
    const list: Widget[] = [search()];
    const result = updateWidget(list, 5, { title: "oops" });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBeUndefined();
  });

  it("is a no-op for a negative index (returns new array copy)", () => {
    const list: Widget[] = [search()];
    const result = updateWidget(list, -1, { title: "oops" });
    expect(result).toHaveLength(1);
  });

  it("does not mutate input array", () => {
    const list: Widget[] = [search("Original")];
    updateWidget(list, 0, { title: "New" });
    expect(list[0].title).toBe("Original");
  });

  it("does not mutate input widget object", () => {
    const w = search("Original");
    const list: Widget[] = [w];
    updateWidget(list, 0, { title: "New" });
    expect(w.title).toBe("Original");
  });

  it("returns a new array reference", () => {
    const list: Widget[] = [search()];
    expect(updateWidget(list, 0, { title: "X" })).not.toBe(list);
  });

  it("merged patch does not affect other widgets in the list", () => {
    const list: Widget[] = [search("A"), categories("B"), recentPosts(5, "C")];
    const result = updateWidget(list, 1, { title: "Updated" });
    expect(result[0].title).toBe("A");
    expect(result[1].title).toBe("Updated");
    expect(result[2].title).toBe("C");
  });
});

// ────────────────────────────────────────────────────────────
// Immutability cross-check
// ────────────────────────────────────────────────────────────

describe("Immutability — all functions return new arrays", () => {
  const list: Widget[] = [search("A"), categories("B"), recentPosts(5, "C")];

  it("addWidget returns a new array", () => {
    expect(addWidget(list, "search")).not.toBe(list);
  });

  it("removeWidget (valid) returns a new array", () => {
    expect(removeWidget(list, 0)).not.toBe(list);
  });

  it("removeWidget (no-op) returns a new array", () => {
    expect(removeWidget(list, 99)).not.toBe(list);
  });

  it("moveWidget returns a new array", () => {
    expect(moveWidget(list, 0, 2)).not.toBe(list);
  });

  it("moveWidgetUp returns a new array", () => {
    expect(moveWidgetUp(list, 1)).not.toBe(list);
  });

  it("moveWidgetDown returns a new array", () => {
    expect(moveWidgetDown(list, 1)).not.toBe(list);
  });

  it("updateWidget returns a new array", () => {
    expect(updateWidget(list, 0, { title: "X" })).not.toBe(list);
  });

  it("updateWidget (no-op) returns a new array", () => {
    expect(updateWidget(list, 99, { title: "X" })).not.toBe(list);
  });
});
