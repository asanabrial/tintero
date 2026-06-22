import { describe, expect, test } from "bun:test";
import { matchRedirect, normalizePath, type RedirectRule } from "@/lib/seo/redirects";

const rules: RedirectRule[] = [
  { from: "/old-post", to: "/blog/new-post", permanent: true },
  { from: "/blog/legacy/", to: "/blog/modern" },
  { from: "/About-Us", to: "/pages/about", permanent: true },
];

describe("normalizePath", () => {
  test("strips a trailing slash (except root)", () => {
    expect(normalizePath("/old-post/")).toBe("/old-post");
    expect(normalizePath("/old-post")).toBe("/old-post");
    expect(normalizePath("/")).toBe("/");
  });

  test("lowercases for case-insensitive matching", () => {
    expect(normalizePath("/About-Us")).toBe("/about-us");
  });

  test("drops the query string", () => {
    expect(normalizePath("/old-post?ref=twitter")).toBe("/old-post");
  });
});

describe("matchRedirect", () => {
  test("returns the matching rule for an exact path", () => {
    expect(matchRedirect("/old-post", rules)?.to).toBe("/blog/new-post");
  });

  test("matches regardless of trailing slash on either side", () => {
    expect(matchRedirect("/blog/legacy", rules)?.to).toBe("/blog/modern");
    expect(matchRedirect("/old-post/", rules)?.to).toBe("/blog/new-post");
  });

  test("matches case-insensitively", () => {
    expect(matchRedirect("/about-us", rules)?.to).toBe("/pages/about");
  });

  test("ignores the query string when matching", () => {
    expect(matchRedirect("/old-post?utm=x", rules)?.to).toBe("/blog/new-post");
  });

  test("returns null when nothing matches", () => {
    expect(matchRedirect("/still-here", rules)).toBeNull();
  });

  test("never redirects a path to itself (guards against loops)", () => {
    const loopy: RedirectRule[] = [{ from: "/x", to: "/x" }];
    expect(matchRedirect("/x", loopy)).toBeNull();
  });
});
