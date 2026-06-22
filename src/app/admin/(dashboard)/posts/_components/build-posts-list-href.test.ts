import { describe, it, expect } from "bun:test";
import { buildPostsListHref } from "./build-posts-list-href";

describe("buildPostsListHref", () => {
  it("status only — emits status param", () => {
    expect(buildPostsListHref({ status: "draft" })).toBe("?status=draft");
  });

  it('status "all" is omitted — returns base path', () => {
    expect(buildPostsListHref({ status: "all" })).toBe("/admin/posts");
  });

  it("status + q — emits both params", () => {
    expect(buildPostsListHref({ status: "published", q: "hello" })).toBe(
      "?status=published&q=hello"
    );
  });

  it("status + q + page — emits all three params", () => {
    expect(buildPostsListHref({ status: "draft", q: "hi", page: 3 })).toBe(
      "?status=draft&q=hi&page=3"
    );
  });

  it("page=1 is omitted — search resets to page 1", () => {
    expect(buildPostsListHref({ status: "all", q: "x", page: 1 })).toBe("?q=x");
  });

  it("empty q is omitted — returns base path when all other params empty", () => {
    expect(buildPostsListHref({ status: "all", q: "", page: 1 })).toBe("/admin/posts");
  });

  it("whitespace-only q is omitted after trim", () => {
    expect(buildPostsListHref({ status: "all", q: "   " })).toBe("/admin/posts");
  });

  it("q is URL-encoded by URLSearchParams", () => {
    const result = buildPostsListHref({ status: "all", q: "a b&c" });
    // URLSearchParams encodes space as + and & as %26
    const sp = new URLSearchParams(result.replace(/^\/admin\/posts\??/, ""));
    expect(sp.get("q")).toBe("a b&c");
  });

  it("page > 1 without status — emits only page", () => {
    expect(buildPostsListHref({ status: "all", page: 2 })).toBe("?page=2");
  });
});
