import { describe, it, expect } from "bun:test";
import { buildPagesListHref } from "./build-pages-list-href";

describe("buildPagesListHref", () => {
  it("q only — emits q param", () => {
    expect(buildPagesListHref({ q: "hello" })).toBe("?q=hello");
  });

  it("q + page — emits both params", () => {
    expect(buildPagesListHref({ q: "hi", page: 3 })).toBe("?q=hi&page=3");
  });

  it("page=1 is omitted — new search resets to page 1", () => {
    expect(buildPagesListHref({ q: "x", page: 1 })).toBe("?q=x");
  });

  it("empty q is omitted — returns base path", () => {
    expect(buildPagesListHref({ q: "" })).toBe("/admin/pages");
  });

  it("no params — returns base path", () => {
    expect(buildPagesListHref({})).toBe("/admin/pages");
  });

  it("whitespace-only q is omitted after trim", () => {
    expect(buildPagesListHref({ q: "   " })).toBe("/admin/pages");
  });

  it("page > 1 without q — emits only page", () => {
    expect(buildPagesListHref({ page: 2 })).toBe("?page=2");
  });

  it("q is URL-encoded by URLSearchParams", () => {
    const result = buildPagesListHref({ q: "a b&c" });
    const sp = new URLSearchParams(result.replace(/^\/admin\/pages\??/, ""));
    expect(sp.get("q")).toBe("a b&c");
  });
});
