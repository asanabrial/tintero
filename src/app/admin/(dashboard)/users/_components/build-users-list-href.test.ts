import { describe, it, expect } from "bun:test";
import { buildUsersListHref } from "./build-users-list-href";

describe("buildUsersListHref", () => {
  it("q only — emits q param", () => {
    expect(buildUsersListHref({ q: "hello" })).toBe("?q=hello");
  });

  it("q + page — emits both params", () => {
    expect(buildUsersListHref({ q: "hi", page: 3 })).toBe("?q=hi&page=3");
  });

  it("page=1 is omitted — new search resets to page 1", () => {
    expect(buildUsersListHref({ q: "x", page: 1 })).toBe("?q=x");
  });

  it("empty q is omitted — returns base path", () => {
    expect(buildUsersListHref({ q: "" })).toBe("/admin/users");
  });

  it("no params — returns base path", () => {
    expect(buildUsersListHref({})).toBe("/admin/users");
  });

  it("whitespace-only q is omitted after trim", () => {
    expect(buildUsersListHref({ q: "   " })).toBe("/admin/users");
  });

  it("page > 1 without q — emits only page", () => {
    expect(buildUsersListHref({ page: 2 })).toBe("?page=2");
  });

  it("q is URL-encoded by URLSearchParams", () => {
    const result = buildUsersListHref({ q: "a b&c" });
    const sp = new URLSearchParams(result.replace(/^\/admin\/users\??/, ""));
    expect(sp.get("q")).toBe("a b&c");
  });
});
