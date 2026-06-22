import { describe, expect, test } from "bun:test";
import { isNavItemActive } from "../../../src/lib/admin/nav-active";

describe("isNavItemActive", () => {
  test("/admin exact match → true", () => {
    expect(isNavItemActive("/admin", "/admin")).toBe(true);
  });
  test("/admin guard: descendant does NOT activate Dashboard", () => {
    expect(isNavItemActive("/admin/posts", "/admin")).toBe(false);
  });
  test("exact non-root match → true", () => {
    expect(isNavItemActive("/admin/posts", "/admin/posts")).toBe(true);
  });
  test("descendant of non-root href → true (startsWith + slash)", () => {
    expect(isNavItemActive("/admin/posts/new", "/admin/posts")).toBe(true);
  });
  test("deep descendant → true", () => {
    expect(isNavItemActive("/admin/posts/my-slug/edit", "/admin/posts")).toBe(true);
  });
  test("sibling path → false", () => {
    expect(isNavItemActive("/admin/pages", "/admin/posts")).toBe(false);
  });
  test("prefix-but-not-segment does NOT match (no false startsWith)", () => {
    // "/admin/postsx" must not match "/admin/posts" — the "+ '/'" guards this
    expect(isNavItemActive("/admin/postsx", "/admin/posts")).toBe(false);
  });
  test("categories exact → true", () => {
    expect(isNavItemActive("/admin/categories", "/admin/categories")).toBe(true);
  });
});
