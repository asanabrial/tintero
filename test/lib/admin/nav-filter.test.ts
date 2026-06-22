import { describe, expect, test } from "bun:test";
import { filterNavByRole, NAV_GROUPS } from "../../../src/lib/admin/nav-groups";

// ============================================================
// filterNavByRole — per-role visible href assertions
// ============================================================

describe("filterNavByRole — admin", () => {
  test("admin sees all nav items", () => {
    const filtered = filterNavByRole(NAV_GROUPS, "admin");
    const hrefs = filtered.flatMap((g) => g.items.map((i) => i.href));
    // Admin sees everything
    expect(hrefs).toContain("/admin");
    expect(hrefs).toContain("/admin/posts");
    expect(hrefs).toContain("/admin/pages");
    expect(hrefs).toContain("/admin/media");
    expect(hrefs).toContain("/admin/categories");
    expect(hrefs).toContain("/admin/tags");
    expect(hrefs).toContain("/admin/comments");
    expect(hrefs).toContain("/admin/menus");
    expect(hrefs).toContain("/admin/appearance");
    expect(hrefs).toContain("/admin/profile");
    expect(hrefs).toContain("/admin/users");
    expect(hrefs).toContain("/admin/settings");
    expect(hrefs).toContain("/admin/tools");
  });

  test("admin result has no empty groups", () => {
    const filtered = filterNavByRole(NAV_GROUPS, "admin");
    for (const group of filtered) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});

describe("filterNavByRole — editor", () => {
  test("editor sees content items (posts, pages, media, categories, tags, comments, menus, profile)", () => {
    const filtered = filterNavByRole(NAV_GROUPS, "editor");
    const hrefs = filtered.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/admin");
    expect(hrefs).toContain("/admin/posts");
    expect(hrefs).toContain("/admin/pages");
    expect(hrefs).toContain("/admin/media");
    expect(hrefs).toContain("/admin/categories");
    expect(hrefs).toContain("/admin/tags");
    expect(hrefs).toContain("/admin/comments");
    expect(hrefs).toContain("/admin/menus");
    expect(hrefs).toContain("/admin/profile");
  });

  test("editor does NOT see users, settings, appearance, tools", () => {
    const filtered = filterNavByRole(NAV_GROUPS, "editor");
    const hrefs = filtered.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/admin/users");
    expect(hrefs).not.toContain("/admin/settings");
    expect(hrefs).not.toContain("/admin/appearance");
    expect(hrefs).not.toContain("/admin/tools");
  });

  test("editor result has no empty groups", () => {
    const filtered = filterNavByRole(NAV_GROUPS, "editor");
    for (const group of filtered) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});

describe("filterNavByRole — author", () => {
  test("author sees only Dashboard, Posts, Media, Profile", () => {
    const filtered = filterNavByRole(NAV_GROUPS, "author");
    const hrefs = filtered.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/admin");
    expect(hrefs).toContain("/admin/posts");
    expect(hrefs).toContain("/admin/media");
    expect(hrefs).toContain("/admin/profile");
  });

  test("author does NOT see pages, comments, categories, tags, menus, users, settings, appearance, tools", () => {
    const filtered = filterNavByRole(NAV_GROUPS, "author");
    const hrefs = filtered.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain("/admin/pages");
    expect(hrefs).not.toContain("/admin/comments");
    expect(hrefs).not.toContain("/admin/categories");
    expect(hrefs).not.toContain("/admin/tags");
    expect(hrefs).not.toContain("/admin/menus");
    expect(hrefs).not.toContain("/admin/appearance");
    expect(hrefs).not.toContain("/admin/users");
    expect(hrefs).not.toContain("/admin/settings");
    expect(hrefs).not.toContain("/admin/tools");
  });

  test("author result has no empty groups", () => {
    const filtered = filterNavByRole(NAV_GROUPS, "author");
    for (const group of filtered) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});
