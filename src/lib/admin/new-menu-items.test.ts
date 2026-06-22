import { describe, it, expect } from "bun:test";
import { newMenuItemsForRole } from "./new-menu-items";
import type { Role } from "@/lib/auth/types";

describe("newMenuItemsForRole", () => {
  it("admin sees all four items", () => {
    const items = newMenuItemsForRole("admin");
    expect(items.map((i) => i.href)).toEqual([
      "/admin/posts/new",
      "/admin/pages/new",
      "/admin/media",
      "/admin/users",
    ]);
  });

  it("editor sees post, page, and media — NOT users", () => {
    const items = newMenuItemsForRole("editor");
    expect(items.map((i) => i.href)).toEqual([
      "/admin/posts/new",
      "/admin/pages/new",
      "/admin/media",
    ]);
    expect(items.find((i) => i.href === "/admin/users")).toBeUndefined();
  });

  it("author sees post and media — NOT page or users", () => {
    const items = newMenuItemsForRole("author");
    expect(items.map((i) => i.href)).toEqual([
      "/admin/posts/new",
      "/admin/media",
    ]);
    expect(items.find((i) => i.href === "/admin/pages/new")).toBeUndefined();
    expect(items.find((i) => i.href === "/admin/users")).toBeUndefined();
  });

  it("each item has a non-empty label", () => {
    for (const role of ["admin", "editor", "author"] as Role[]) {
      for (const item of newMenuItemsForRole(role)) {
        expect(item.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("returns a new array each call (no shared mutable state)", () => {
    const a = newMenuItemsForRole("admin");
    const b = newMenuItemsForRole("admin");
    expect(a).not.toBe(b);
  });
});
