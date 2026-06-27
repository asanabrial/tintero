import { describe, expect, test, mock } from "bun:test";
import {
  parseImportBundle,
  importBundle,
} from "../../src/lib/content/import";
import type { ImportDeps } from "../../src/lib/content/import";
import { buildExportBundle, BUNDLE_VERSION } from "../../src/lib/content/export";
import type { WriteResult, CreatePageInput, CreatePostInput } from "../../src/lib/content/ports";

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

// ============================================================
// Helper: minimal SiteConfig for round-trip tests
// ============================================================
function makeSiteConfig() {
  return {
    title: "Test Blog",
    description: "",
    baseUrl: "https://example.com",
    language: "en",
    author: { name: "Author" },
    nav: [],
    footerNav: [],
    reading: { homepage: "latest-posts" as const, posts_per_page: 10 },
    comments: { enabled: true, moderation: "manual" as const },
  };
}

// ============================================================
// Bug 1+2: Page round-trip fidelity
// Fails today because PAGE_FM_KEYS omits status/parent/menu_order/seo (Bug 1)
// and importPage drops those fields from CreatePageInput (Bug 2).
// ============================================================

describe("importBundle — page round-trip fidelity (Bug 1+2)", () => {
  test("page export→import preserves parent, status=draft, menuOrder, seo", async () => {
    const bundle = buildExportBundle({
      posts: [],
      pages: [
        {
          page: {
            slug: "child-page",
            title: "Child Page",
            date: "2024-01-01",
            excerpt: "A child.",
            html: "<p>content</p>",
            status: "draft",
            parent: "parent-page",
            menuOrder: 5,
            seo: { title: "SEO Title", noindex: true },
          },
          raw: {
            frontmatter: {},
            rawData: {
              title: "Child Page",
              date: "2024-01-01",
              status: "draft",
              excerpt: "A child.",
              parent: "parent-page",
              menu_order: 5,
              seo: { title: "SEO Title", noindex: true },
            },
            body: "Child page content.",
          },
        },
      ],
      siteConfig: makeSiteConfig(),
      exportedAt: "2026-01-01T00:00:00.000Z",
    });

    const parsed = parseImportBundle(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const createPage = mock(async (input: CreatePageInput) =>
      makeOkResult(input.slug ?? "child-page")
    );
    const deps = makeMockDeps({
      pageExists: mock(async () => false),
      createPage,
    });

    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.imported).toContain("child-page");
    expect(report.failed).toHaveLength(0);

    const calls = createPage.mock.calls;
    expect(calls).toHaveLength(1);
    const input = calls[0][0] as CreatePageInput;
    expect(input.parent).toBe("parent-page");
    expect(input.status).toBe("draft");
    expect(input.menuOrder).toBe(5);
    expect(input.seo).toEqual({ title: "SEO Title", noindex: true });
  });
});

// ============================================================
// Bug 1+2: Post round-trip fidelity
// Fails today because POST_FM_KEYS omits authorId/coverImage/visibility/password/sticky/seo (Bug 1)
// and importPost drops author/authorId/coverImage/visibility/password/sticky/seo from CreatePostInput (Bug 2).
// ============================================================

describe("importBundle — post round-trip fidelity (Bug 1+2)", () => {
  test("post export→import preserves author, authorId, coverImage, visibility, sticky, seo", async () => {
    const bundle = buildExportBundle({
      posts: [
        {
          post: {
            slug: "full-post",
            title: "Full Post",
            date: "2024-06-15",
            status: "draft",
            tags: ["tag1"],
            categories: ["Tech"],
            excerpt: "An excerpt.",
            html: "<p>content</p>",
            comments: false,
            sticky: true,
            author: "Jane Doe",
            authorId: "550e8400-e29b-41d4-a716-446655440000",
            coverImage: "/uploads/cover.jpg",
            visibility: "private",
            seo: { title: "Custom SEO", focusKeyphrase: "test" },
          },
          raw: {
            frontmatter: {},
            rawData: {
              title: "Full Post",
              date: "2024-06-15",
              status: "draft",
              tags: ["tag1"],
              categories: ["Tech"],
              excerpt: "An excerpt.",
              comments: false,
              sticky: true,
              author: "Jane Doe",
              authorId: "550e8400-e29b-41d4-a716-446655440000",
              coverImage: "/uploads/cover.jpg",
              visibility: "private",
              seo: { title: "Custom SEO", focusKeyphrase: "test" },
            },
            body: "Post body content.",
          },
        },
      ],
      pages: [],
      siteConfig: makeSiteConfig(),
      exportedAt: "2026-01-01T00:00:00.000Z",
    });

    const parsed = parseImportBundle(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const createPost = mock(async (input: CreatePostInput) =>
      makeOkResult(input.slug ?? "full-post")
    );
    const deps = makeMockDeps({
      postExists: mock(async () => false),
      createPost,
    });

    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.imported).toContain("full-post");
    expect(report.failed).toHaveLength(0);

    const calls = createPost.mock.calls;
    expect(calls).toHaveLength(1);
    const input = calls[0][0] as CreatePostInput;
    expect(input.author).toBe("Jane Doe");
    expect(input.authorId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(input.coverImage).toBe("/uploads/cover.jpg");
    expect(input.visibility).toBe("private");
    expect(input.sticky).toBe(true);
    expect(input.seo).toEqual({ title: "Custom SEO", focusKeyphrase: "test" });
  });
});

// ============================================================
// Bug 3: Topological page ordering
// Fails today because importBundle processes pages in bundle order.
// ============================================================

describe("importBundle — page topological ordering (Bug 3)", () => {
  test("child listed before parent → parent imported first", async () => {
    // Bundle lists child first, parent second — opposite of the required import order.
    const json = makeValidBundleJson({
      posts: [],
      pages: [
        {
          slug: "child-page",
          frontmatter: { title: "Child", date: "2024-01-01", parent: "parent-page" },
          raw: "Child content.",
        },
        {
          slug: "parent-page",
          frontmatter: { title: "Parent", date: "2024-01-01" },
          raw: "Parent content.",
        },
      ],
    });

    const parsed = parseImportBundle(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const callOrder: string[] = [];
    const deps = makeMockDeps({
      pageExists: mock(async () => false),
      createPage: mock(async (input: CreatePageInput) => {
        callOrder.push(input.slug!);
        return makeOkResult(input.slug ?? "slug");
      }),
    });

    const report = await importBundle(parsed.bundle, deps, "skip");
    expect(report.imported).toHaveLength(2);
    expect(report.failed).toHaveLength(0);

    // Parent must be processed before its child
    const parentIdx = callOrder.indexOf("parent-page");
    const childIdx = callOrder.indexOf("child-page");
    expect(parentIdx).toBeGreaterThanOrEqual(0);
    expect(childIdx).toBeGreaterThanOrEqual(0);
    expect(parentIdx).toBeLessThan(childIdx);
  });

  test("cycle in page parents → importBundle completes, both pages imported", async () => {
    // page-a's parent is page-b, page-b's parent is page-a — mutual cycle.
    const json = makeValidBundleJson({
      posts: [],
      pages: [
        {
          slug: "page-a",
          frontmatter: { title: "Page A", date: "2024-01-01", parent: "page-b" },
          raw: "Page A content.",
        },
        {
          slug: "page-b",
          frontmatter: { title: "Page B", date: "2024-01-01", parent: "page-a" },
          raw: "Page B content.",
        },
      ],
    });

    const parsed = parseImportBundle(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const deps = makeMockDeps({
      pageExists: mock(async () => false),
      createPage: mock(async (input: CreatePageInput) =>
        makeOkResult(input.slug ?? "slug")
      ),
    });

    const report = await importBundle(parsed.bundle, deps, "skip");
    // Cycle must not hang; both pages must be imported.
    expect(report.imported).toHaveLength(2);
    expect(report.failed).toHaveLength(0);
  });
});
