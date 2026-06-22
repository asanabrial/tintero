import { describe, expect, test, mock } from "bun:test";
import {
  parseImportBundle,
  importBundle,
} from "../../src/lib/content/import";
import type { ImportDeps } from "../../src/lib/content/import";
import { buildExportBundle, BUNDLE_VERSION } from "../../src/lib/content/export";
import type { WriteResult } from "../../src/lib/content/ports";

// ============================================================
// Helpers
// ============================================================

function makeValidBundleJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: BUNDLE_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    siteConfig: { title: "My Blog" },
    posts: [
      {
        slug: "hello-world",
        frontmatter: { title: "Hello World", date: "2024-01-15" },
        raw: "# Hello\n\nContent.",
      },
    ],
    pages: [],
    ...overrides,
  });
}

function makeOkResult(slug: string): WriteResult {
  return { ok: true, slug };
}

function makeMockDeps(overrides: Partial<ImportDeps> = {}): ImportDeps {
  return {
    postExists: mock(async (_slug: string) => false),
    createPost: mock(async (_input) => makeOkResult(_input.slug ?? "hello-world")),
    updatePost: mock(async (slug: string, _input) => makeOkResult(slug)),
    pageExists: mock(async (_slug: string) => false),
    createPage: mock(async (_input) => makeOkResult(_input.slug ?? "about")),
    updatePage: mock(async (slug: string, _input) => makeOkResult(slug)),
    ...overrides,
  };
}

// ============================================================
// parseImportBundle tests
// ============================================================

describe("parseImportBundle", () => {
  test("valid bundle with correct shape and version=1 returns ok:true", () => {
    const result = parseImportBundle(makeValidBundleJson());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.version).toBe(1);
      expect(result.bundle.posts).toHaveLength(1);
    }
  });

  test("version:999 returns ok:false with unsupported error", () => {
    const result = parseImportBundle(makeValidBundleJson({ version: 999 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/[Uu]nsupported/);
    }
  });

  test("missing posts field returns ok:false without throwing", () => {
    const json = JSON.stringify({
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      siteConfig: {},
      pages: [],
      // posts intentionally omitted
    });
    const result = parseImportBundle(json);
    expect(result.ok).toBe(false);
  });

  test("non-JSON string returns ok:false with 'Invalid JSON' error", () => {
    const result = parseImportBundle("not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Invalid JSON");
    }
  });

  test("does not throw on any malformed input", () => {
    expect(() => parseImportBundle("")).not.toThrow();
    expect(() => parseImportBundle("null")).not.toThrow();
    expect(() => parseImportBundle("{}")).not.toThrow();
    expect(() => parseImportBundle("[1,2,3]")).not.toThrow();
  });
});

// ============================================================
// importBundle tests
// ============================================================

describe("importBundle — skip mode (new slug)", () => {
  test("skip+new: postExists→false → createPost called, slug in imported[]", async () => {
    const parsed = parseImportBundle(makeValidBundleJson());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const deps = makeMockDeps({
      postExists: mock(async () => false),
      createPost: mock(async (input) => makeOkResult(input.slug ?? "hello-world")),
    });

    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.imported).toContain("hello-world");
    expect(report.skipped).toHaveLength(0);
    expect(report.failed).toHaveLength(0);
    expect((deps.createPost as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
  });
});

describe("importBundle — skip mode (existing slug)", () => {
  test("skip+exists: postExists→true → createPost NOT called, slug in skipped[]", async () => {
    const parsed = parseImportBundle(makeValidBundleJson());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const deps = makeMockDeps({
      postExists: mock(async () => true),
      createPost: mock(async (input) => makeOkResult(input.slug ?? "hello-world")),
    });

    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.skipped).toContain("hello-world");
    expect(report.imported).toHaveLength(0);
    expect((deps.createPost as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
  });
});

describe("importBundle — overwrite mode", () => {
  test("overwrite+exists: postExists→true → updatePost called (not createPost), slug in imported[]", async () => {
    const parsed = parseImportBundle(makeValidBundleJson());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const deps = makeMockDeps({
      postExists: mock(async () => true),
      createPost: mock(async (input) => makeOkResult(input.slug ?? "hello-world")),
      updatePost: mock(async (slug) => makeOkResult(slug)),
    });

    const report = await importBundle(parsed.bundle, deps, "overwrite");
    expect(report.imported).toContain("hello-world");
    expect((deps.updatePost as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
    expect((deps.createPost as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
  });

  test("overwrite+new: postExists→false → createPost called, slug in imported[]", async () => {
    const parsed = parseImportBundle(makeValidBundleJson());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const deps = makeMockDeps({
      postExists: mock(async () => false),
      createPost: mock(async (input) => makeOkResult(input.slug ?? "hello-world")),
    });

    const report = await importBundle(parsed.bundle, deps, "overwrite");
    expect(report.imported).toContain("hello-world");
    expect((deps.createPost as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
  });
});

describe("importBundle — bad frontmatter", () => {
  test("missing title in frontmatter → failed[], no writer called", async () => {
    const json = makeValidBundleJson({
      posts: [
        {
          slug: "bad-post",
          frontmatter: { date: "2024-01-15" }, // title missing
          raw: "Content.",
        },
      ],
    });
    const parsed = parseImportBundle(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const deps = makeMockDeps();
    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].slug).toBe("bad-post");
    expect((deps.createPost as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
    expect((deps.postExists as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
  });
});

describe("importBundle — path-traversal slug", () => {
  test("../evil slug → failed[], postExists and createPost NEVER called", async () => {
    const json = makeValidBundleJson({
      posts: [
        {
          slug: "../evil",
          frontmatter: { title: "Evil", date: "2024-01-15" },
          raw: "Evil content.",
        },
      ],
    });
    const parsed = parseImportBundle(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const deps = makeMockDeps();
    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].slug).toBe("../evil");
    expect((deps.postExists as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
    expect((deps.createPost as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
  });

  test("slug with uppercase → failed[], no writer called", async () => {
    const json = makeValidBundleJson({
      posts: [
        {
          slug: "My-Post",
          frontmatter: { title: "My Post", date: "2024-01-15" },
          raw: "Content.",
        },
      ],
    });
    const parsed = parseImportBundle(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const deps = makeMockDeps();
    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.failed).toHaveLength(1);
    expect((deps.postExists as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
  });
});

describe("importBundle — partial failure batch continues", () => {
  test("3 items [good, bad-frontmatter, good] → 2 imported, 1 failed, batch continues", async () => {
    const json = makeValidBundleJson({
      posts: [
        {
          slug: "good-one",
          frontmatter: { title: "Good One", date: "2024-01-15" },
          raw: "Content 1.",
        },
        {
          slug: "bad-fm",
          frontmatter: { date: "2024-01-15" }, // missing title
          raw: "Content 2.",
        },
        {
          slug: "good-two",
          frontmatter: { title: "Good Two", date: "2024-01-16" },
          raw: "Content 3.",
        },
      ],
    });
    const parsed = parseImportBundle(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const deps = makeMockDeps({
      postExists: mock(async () => false),
      createPost: mock(async (input) => makeOkResult(input.slug ?? "slug")),
    });

    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.imported).toHaveLength(2);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].slug).toBe("bad-fm");
    expect((deps.createPost as ReturnType<typeof mock>).mock.calls).toHaveLength(2);
  });
});

describe("importBundle — writer returns {ok:false}", () => {
  test("createPost returns {ok:false} → failed[] with error, loop continues", async () => {
    const json = makeValidBundleJson({
      posts: [
        {
          slug: "fail-post",
          frontmatter: { title: "Fail Post", date: "2024-01-15" },
          raw: "Content.",
        },
        {
          slug: "ok-post",
          frontmatter: { title: "OK Post", date: "2024-01-16" },
          raw: "Content.",
        },
      ],
    });
    const parsed = parseImportBundle(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    let callCount = 0;
    const deps = makeMockDeps({
      postExists: mock(async () => false),
      createPost: mock(async (input) => {
        callCount++;
        if (callCount === 1) {
          return { ok: false, error: { kind: "invalid_slug" as const, slug: input.slug ?? "fail-post" } } as WriteResult;
        }
        return makeOkResult(input.slug ?? "ok-post");
      }),
    });

    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.failed).toHaveLength(1);
    expect(report.imported).toHaveLength(1);
    expect(report.imported[0]).toBe("ok-post");
  });
});

describe("importBundle — page items", () => {
  test("page items use pageExists/createPage/updatePage, not post deps", async () => {
    const json = makeValidBundleJson({
      posts: [],
      pages: [
        {
          slug: "about",
          frontmatter: { title: "About", date: "2024-01-01" },
          raw: "About page.",
        },
      ],
    });
    const parsed = parseImportBundle(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const deps = makeMockDeps({
      pageExists: mock(async () => false),
      createPage: mock(async (input) => makeOkResult(input.slug ?? "about")),
    });

    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.imported).toContain("about");
    expect((deps.createPage as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
    expect((deps.createPost as ReturnType<typeof mock>).mock.calls).toHaveLength(0);
  });
});

describe("importBundle — round-trip", () => {
  test("bundle from buildExportBundle → parseImportBundle → importBundle skip+exists → all skipped", async () => {
    const bundle = buildExportBundle({
      posts: [
        {
          post: {
            slug: "round-trip-post",
            title: "Round Trip",
            date: "2024-01-15",
            status: "published",
            tags: [],
            categories: ["Uncategorized"],
            excerpt: "",
            html: "<p>Hello</p>",
            comments: true,
            sticky: false,
            author: "Author",
            visibility: "public",
          },
          raw: {
            frontmatter: {},
            rawData: { title: "Round Trip", date: "2024-01-15", status: "published", tags: [], categories: ["Uncategorized"], comments: true },
            body: "Hello world.",
          },
        },
      ],
      pages: [],
      siteConfig: {
        title: "My Blog",
        description: "",
        baseUrl: "https://example.com",
        language: "en",
        author: { name: "Author" },
        nav: [],
        footerNav: [],
        reading: { homepage: "latest-posts", posts_per_page: 10 },
        comments: { enabled: true, moderation: "manual" },
      },
      exportedAt: "2026-01-01T00:00:00.000Z",
    });

    const json = JSON.stringify(bundle);
    const parsed = parseImportBundle(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const deps = makeMockDeps({
      postExists: mock(async () => true), // all exist
    });

    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.skipped).toContain("round-trip-post");
    expect(report.imported).toHaveLength(0);
    expect(report.failed).toHaveLength(0);
  });
});
