/**
 * Unit tests for ShadowContentAdapter.
 *
 * Uses stub adapters — no DB, no filesystem.
 *
 * To run only this file:
 *   bun test test/lib/content/shadow-adapter.test.ts
 */

import { describe, test, expect } from "bun:test";
import { ShadowContentAdapter } from "@/lib/content/shadow-adapter";
import type { ShadowDivergence } from "@/lib/content/shadow-adapter";
import type { ContentRepository, StatusCounts } from "@/lib/content/ports";
import type { Post, Page, Tag, Category, SiteConfig } from "@/lib/content/types";
import type { LinkGraph, UnlinkedMention } from "@/lib/content/links";

// ============================================================
// Fixture helpers
// ============================================================

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    slug: "test-post",
    title: "Test Post",
    date: "2024-01-01",
    status: "published",
    tags: [],
    categories: [],
    excerpt: "",
    html: "<p>Hello</p>",
    comments: false,
    sticky: false,
    author: "",
    visibility: "public",
    ...overrides,
  };
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    slug: "test-page",
    title: "Test Page",
    date: "2024-01-01",
    status: "published",
    excerpt: "",
    html: "<p>Hello</p>",
    menuOrder: 0,
    ...overrides,
  };
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    slug: "test-tag",
    label: "Test Tag",
    count: 1,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    segments: ["test"],
    slug: "test",
    label: "Test",
    count: 1,
    depth: 1,
    ...overrides,
  };
}

const BASE_SITE_CONFIG: SiteConfig = {
  title: "Test Site",
  description: "A test site",
  baseUrl: "http://localhost:3000",
  language: "en",
  author: { name: "Test Author" },
  nav: [],
  footerNav: [],
  reading: { homepage: "latest-posts", posts_per_page: 10 },
  comments: { enabled: false, moderation: "manual" },
};

const BASE_LINK_GRAPH: LinkGraph = { nodes: [], edges: [], broken: [] };
const BASE_STATUS_COUNTS: StatusCounts = { all: 2, published: 1, draft: 1, scheduled: 0 };

function makeStub(overrides: Partial<ContentRepository> = {}): ContentRepository {
  return {
    listPosts: async () => ({ posts: [], total: 0, totalPages: 0 }),
    getPost: async () => null,
    listPages: async () => ({ pages: [], total: 0, totalPages: 0 }),
    listPostStatusCounts: async () => ({ all: 0, published: 0, draft: 0, scheduled: 0 }),
    getPage: async () => null,
    listTags: async () => [],
    listCategories: async () => [],
    getSiteConfig: async () => BASE_SITE_CONFIG,
    getLinkGraph: async () => BASE_LINK_GRAPH,
    getUnlinkedMentions: async () => [],
    ...overrides,
  };
}

function makeShadow(
  primary: ContentRepository,
  secondary: ContentRepository
): { shadow: ShadowContentAdapter; captured: ShadowDivergence[] } {
  const captured: ShadowDivergence[] = [];
  const shadow = new ShadowContentAdapter(primary, secondary, { log: (e) => captured.push(e) });
  return { shadow, captured };
}

// ============================================================
// Returns primary result — regardless of secondary
// ============================================================

describe("ShadowContentAdapter — returns primary result", () => {
  test("listPosts returns primary even when secondary has different total", async () => {
    const post = makePost({ slug: "alpha" });
    const primary = makeStub({ listPosts: async () => ({ posts: [post], total: 1, totalPages: 1 }) });
    const secondary = makeStub({ listPosts: async () => ({ posts: [], total: 0, totalPages: 0 }) });
    const { shadow } = makeShadow(primary, secondary);

    const result = await shadow.listPosts();
    expect(result.posts).toEqual([post]);
    expect(result.total).toBe(1);
  });

  test("getPost returns primary even when secondary returns different value", async () => {
    const post = makePost({ slug: "alpha", title: "Primary Title" });
    const primary = makeStub({ getPost: async () => post });
    const secondary = makeStub({ getPost: async () => makePost({ slug: "alpha", title: "Secondary Title" }) });
    const { shadow } = makeShadow(primary, secondary);

    const result = await shadow.getPost("alpha");
    expect(result?.title).toBe("Primary Title");
  });

  test("listPages returns primary even when secondary has different pages", async () => {
    const page = makePage({ slug: "about" });
    const primary = makeStub({ listPages: async () => ({ pages: [page], total: 1, totalPages: 1 }) });
    const secondary = makeStub({ listPages: async () => ({ pages: [], total: 0, totalPages: 0 }) });
    const { shadow } = makeShadow(primary, secondary);

    const result = await shadow.listPages();
    expect(result.pages).toEqual([page]);
  });

  test("listPostStatusCounts returns primary even when secondary differs", async () => {
    const primary = makeStub({ listPostStatusCounts: async () => BASE_STATUS_COUNTS });
    const secondary = makeStub({ listPostStatusCounts: async () => ({ all: 0, published: 0, draft: 0, scheduled: 0 }) });
    const { shadow } = makeShadow(primary, secondary);

    const result = await shadow.listPostStatusCounts("2024-01-01T00:00:00Z");
    expect(result).toEqual(BASE_STATUS_COUNTS);
  });

  test("getPage returns primary even when secondary returns different value", async () => {
    const page = makePage({ slug: "about", title: "Primary Page" });
    const primary = makeStub({ getPage: async () => page });
    const secondary = makeStub({ getPage: async () => null });
    const { shadow } = makeShadow(primary, secondary);

    const result = await shadow.getPage("about");
    expect(result?.title).toBe("Primary Page");
  });

  test("listTags returns primary even when secondary has different tags", async () => {
    const tag = makeTag({ slug: "typescript", label: "TypeScript" });
    const primary = makeStub({ listTags: async () => [tag] });
    const secondary = makeStub({ listTags: async () => [] });
    const { shadow } = makeShadow(primary, secondary);

    const result = await shadow.listTags();
    expect(result).toEqual([tag]);
  });

  test("listCategories returns primary even when secondary has different categories", async () => {
    const cat = makeCategory({ slug: "tech", label: "Tech" });
    const primary = makeStub({ listCategories: async () => [cat] });
    const secondary = makeStub({ listCategories: async () => [] });
    const { shadow } = makeShadow(primary, secondary);

    const result = await shadow.listCategories();
    expect(result).toEqual([cat]);
  });

  test("getSiteConfig returns primary even when secondary differs", async () => {
    const altConfig: SiteConfig = { ...BASE_SITE_CONFIG, title: "Secondary Site" };
    const primary = makeStub({ getSiteConfig: async () => BASE_SITE_CONFIG });
    const secondary = makeStub({ getSiteConfig: async () => altConfig });
    const { shadow } = makeShadow(primary, secondary);

    const result = await shadow.getSiteConfig();
    expect(result.title).toBe("Test Site");
  });

  test("getLinkGraph returns primary even when secondary differs", async () => {
    const altGraph: LinkGraph = {
      nodes: [{ id: "post:x", type: "post", slug: "x", title: "X", url: "/blog/x", published: true, public: true, inDegree: 0, outDegree: 0 }],
      edges: [],
      broken: [],
    };
    const primary = makeStub({ getLinkGraph: async () => BASE_LINK_GRAPH });
    const secondary = makeStub({ getLinkGraph: async () => altGraph });
    const { shadow } = makeShadow(primary, secondary);

    const result = await shadow.getLinkGraph();
    expect(result.nodes).toHaveLength(0);
  });

  test("getUnlinkedMentions returns primary even when secondary differs", async () => {
    const mention: UnlinkedMention = { id: "post:alpha", type: "post", slug: "alpha", title: "Alpha", url: "/blog/alpha", count: 2 };
    const primary = makeStub({ getUnlinkedMentions: async () => [mention] });
    const secondary = makeStub({ getUnlinkedMentions: async () => [] });
    const { shadow } = makeShadow(primary, secondary);

    const result = await shadow.getUnlinkedMentions("post:beta");
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("alpha");
  });
});

// ============================================================
// Secondary rejection — logs kind:"error", never throws
// ============================================================

describe("ShadowContentAdapter — secondary rejection", () => {
  test("listPosts: secondary rejection logs kind:error and returns primary", async () => {
    const post = makePost({ slug: "alpha" });
    const primary = makeStub({ listPosts: async () => ({ posts: [post], total: 1, totalPages: 1 }) });
    const secondary = makeStub({ listPosts: async () => { throw new Error("DB connection failed"); } });
    const { shadow, captured } = makeShadow(primary, secondary);

    const result = await shadow.listPosts();
    expect(result.posts).toEqual([post]);
    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("listPosts");
    expect(captured[0].kind).toBe("error");
    expect(captured[0].message).toContain("DB connection failed");
  });

  test("getPost: secondary rejection does not throw", async () => {
    const post = makePost({ slug: "alpha" });
    const primary = makeStub({ getPost: async () => post });
    const secondary = makeStub({ getPost: async () => { throw new Error("timeout"); } });
    const { shadow, captured } = makeShadow(primary, secondary);

    const result = await shadow.getPost("alpha");
    expect(result).toEqual(post);
    expect(captured).toHaveLength(1);
    expect(captured[0].kind).toBe("error");
  });

  test("listTags: secondary rejection logs kind:error", async () => {
    const primary = makeStub({ listTags: async () => [makeTag()] });
    const secondary = makeStub({ listTags: async () => { throw new Error("schema missing"); } });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listTags();
    expect(captured[0].kind).toBe("error");
    expect(captured[0].message).toContain("schema missing");
  });

  test("getSiteConfig: secondary rejection logs kind:error", async () => {
    const primary = makeStub({ getSiteConfig: async () => BASE_SITE_CONFIG });
    const secondary = makeStub({ getSiteConfig: async () => { throw new Error("yaml missing"); } });
    const { shadow, captured } = makeShadow(primary, secondary);

    const result = await shadow.getSiteConfig();
    expect(result).toEqual(BASE_SITE_CONFIG);
    expect(captured[0].kind).toBe("error");
  });
});

// ============================================================
// listPosts divergence detection
// ============================================================

describe("ShadowContentAdapter — listPosts divergences", () => {
  test("logs divergence when total differs", async () => {
    const primary = makeStub({
      listPosts: async () => ({ posts: [makePost({ slug: "a" })], total: 5, totalPages: 1 }),
    });
    const secondary = makeStub({
      listPosts: async () => ({ posts: [makePost({ slug: "a" })], total: 3, totalPages: 1 }),
    });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listPosts();
    const totDiv = captured.find((e) => e.kind === "divergence" && e.detail?.includes("total:"));
    expect(totDiv).toBeDefined();
    expect(totDiv?.detail).toContain("primary=5");
    expect(totDiv?.detail).toContain("secondary=3");
  });

  test("logs divergence when totalPages differs", async () => {
    const primary = makeStub({
      listPosts: async () => ({ posts: [makePost({ slug: "a" })], total: 10, totalPages: 2 }),
    });
    const secondary = makeStub({
      listPosts: async () => ({ posts: [makePost({ slug: "a" })], total: 10, totalPages: 1 }),
    });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listPosts();
    const div = captured.find((e) => e.detail?.includes("totalPages:"));
    expect(div).toBeDefined();
    expect(div?.kind).toBe("divergence");
  });

  test("logs divergence when secondary is missing a slug", async () => {
    const primary = makeStub({
      listPosts: async () => ({ posts: [makePost({ slug: "a" }), makePost({ slug: "b" })], total: 2, totalPages: 1 }),
    });
    const secondary = makeStub({
      listPosts: async () => ({ posts: [makePost({ slug: "a" })], total: 2, totalPages: 1 }),
    });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listPosts();
    const div = captured.find((e) => e.detail?.includes("missing-in-secondary") && e.detail?.includes('"b"'));
    expect(div).toBeDefined();
    expect(div?.kind).toBe("divergence");
  });

  test("logs divergence when secondary has extra slug", async () => {
    const primary = makeStub({
      listPosts: async () => ({ posts: [makePost({ slug: "a" })], total: 1, totalPages: 1 }),
    });
    const secondary = makeStub({
      listPosts: async () => ({ posts: [makePost({ slug: "a" }), makePost({ slug: "b" })], total: 1, totalPages: 1 }),
    });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listPosts();
    const div = captured.find((e) => e.detail?.includes("extra-in-secondary") && e.detail?.includes('"b"'));
    expect(div).toBeDefined();
    expect(div?.kind).toBe("divergence");
  });

  test("logs divergence with slug+field detail when field value differs", async () => {
    const primary = makeStub({
      listPosts: async () => ({ posts: [makePost({ slug: "a", title: "Primary Title" })], total: 1, totalPages: 1 }),
    });
    const secondary = makeStub({
      listPosts: async () => ({ posts: [makePost({ slug: "a", title: "Different Title" })], total: 1, totalPages: 1 }),
    });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listPosts();
    const div = captured.find((e) => e.kind === "divergence" && e.detail?.includes("slug=a") && e.detail?.includes("field=title"));
    expect(div).toBeDefined();
    expect(div?.detail).toContain("Primary Title");
    expect(div?.detail).toContain("Different Title");
  });

  test("logs kind:order (NOT divergence) when same slugs+fields in different order", async () => {
    const postA = makePost({ slug: "a", title: "A", date: "2024-01-01" });
    const postB = makePost({ slug: "b", title: "B", date: "2024-01-01" });
    const primary = makeStub({
      listPosts: async () => ({ posts: [postA, postB], total: 2, totalPages: 1 }),
    });
    const secondary = makeStub({
      listPosts: async () => ({ posts: [postB, postA], total: 2, totalPages: 1 }),
    });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listPosts();

    const divergences = captured.filter((e) => e.kind === "divergence");
    const orders = captured.filter((e) => e.kind === "order");

    expect(divergences).toHaveLength(0);
    expect(orders).toHaveLength(1);
    expect(orders[0].method).toBe("listPosts");
  });

  test("no log entries when secondary matches primary exactly", async () => {
    const post = makePost({ slug: "a" });
    const primary = makeStub({ listPosts: async () => ({ posts: [post], total: 1, totalPages: 1 }) });
    const secondary = makeStub({ listPosts: async () => ({ posts: [{ ...post }], total: 1, totalPages: 1 }) });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listPosts();
    expect(captured).toHaveLength(0);
  });
});

// ============================================================
// getPost / getPage divergence detection
// ============================================================

describe("ShadowContentAdapter — getPost / getPage divergences", () => {
  test("getPost: logs divergence when values differ", async () => {
    const primary = makeStub({ getPost: async () => makePost({ slug: "alpha", title: "Primary" }) });
    const secondary = makeStub({ getPost: async () => makePost({ slug: "alpha", title: "Secondary" }) });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.getPost("alpha");
    expect(captured).toHaveLength(1);
    expect(captured[0].kind).toBe("divergence");
    expect(captured[0].method).toBe("getPost");
  });

  test("getPost: logs divergence when primary is non-null but secondary is null", async () => {
    const primary = makeStub({ getPost: async () => makePost({ slug: "alpha" }) });
    const secondary = makeStub({ getPost: async () => null });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.getPost("alpha");
    expect(captured).toHaveLength(1);
    expect(captured[0].kind).toBe("divergence");
  });

  test("getPost: logs divergence when primary is null but secondary is non-null", async () => {
    const primary = makeStub({ getPost: async () => null });
    const secondary = makeStub({ getPost: async () => makePost({ slug: "alpha" }) });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.getPost("alpha");
    expect(captured).toHaveLength(1);
    expect(captured[0].kind).toBe("divergence");
  });

  test("getPost: no log when both return identical value", async () => {
    const post = makePost({ slug: "alpha" });
    const primary = makeStub({ getPost: async () => post });
    const secondary = makeStub({ getPost: async () => ({ ...post }) });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.getPost("alpha");
    expect(captured).toHaveLength(0);
  });

  test("getPost: no log when both return null", async () => {
    const primary = makeStub({ getPost: async () => null });
    const secondary = makeStub({ getPost: async () => null });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.getPost("missing");
    expect(captured).toHaveLength(0);
  });

  test("getPage: logs divergence when secondary has different title", async () => {
    const primary = makeStub({ getPage: async () => makePage({ slug: "about", title: "Primary Page" }) });
    const secondary = makeStub({ getPage: async () => makePage({ slug: "about", title: "Different Page" }) });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.getPage("about");
    expect(captured).toHaveLength(1);
    expect(captured[0].kind).toBe("divergence");
    expect(captured[0].method).toBe("getPage");
  });
});

// ============================================================
// listPages divergence detection
// ============================================================

describe("ShadowContentAdapter — listPages divergences", () => {
  test("logs divergence when total differs", async () => {
    const primary = makeStub({
      listPages: async () => ({ pages: [makePage({ slug: "about" })], total: 3, totalPages: 1 }),
    });
    const secondary = makeStub({
      listPages: async () => ({ pages: [makePage({ slug: "about" })], total: 2, totalPages: 1 }),
    });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listPages();
    const div = captured.find((e) => e.detail?.includes("total:"));
    expect(div?.kind).toBe("divergence");
  });

  test("logs kind:order when same pages in different order", async () => {
    const pageA = makePage({ slug: "about" });
    const pageB = makePage({ slug: "contact" });
    const primary = makeStub({
      listPages: async () => ({ pages: [pageA, pageB], total: 2, totalPages: 1 }),
    });
    const secondary = makeStub({
      listPages: async () => ({ pages: [pageB, pageA], total: 2, totalPages: 1 }),
    });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listPages();
    const orders = captured.filter((e) => e.kind === "order");
    const divergences = captured.filter((e) => e.kind === "divergence");
    expect(orders).toHaveLength(1);
    expect(divergences).toHaveLength(0);
  });
});

// ============================================================
// listTags / listCategories divergence detection
// ============================================================

describe("ShadowContentAdapter — listTags / listCategories divergences", () => {
  test("listTags: logs divergence when secondary is missing a slug", async () => {
    const tagA = makeTag({ slug: "typescript", label: "TypeScript" });
    const tagB = makeTag({ slug: "rust", label: "Rust" });
    const primary = makeStub({ listTags: async () => [tagA, tagB] });
    const secondary = makeStub({ listTags: async () => [tagA] });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listTags();
    const div = captured.find((e) => e.detail?.includes("missing-in-secondary") && e.detail?.includes('"rust"'));
    expect(div?.kind).toBe("divergence");
  });

  test("listTags: logs divergence when field value differs", async () => {
    const primary = makeStub({ listTags: async () => [makeTag({ slug: "ts", count: 5 })] });
    const secondary = makeStub({ listTags: async () => [makeTag({ slug: "ts", count: 3 })] });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listTags();
    const div = captured.find((e) => e.kind === "divergence" && e.detail?.includes("field=count"));
    expect(div).toBeDefined();
    expect(div?.detail).toContain("primary=5");
    expect(div?.detail).toContain("secondary=3");
  });

  test("listTags: logs kind:order when same tags in different order", async () => {
    const tagA = makeTag({ slug: "rust", label: "Rust" });
    const tagB = makeTag({ slug: "go", label: "Go" });
    const primary = makeStub({ listTags: async () => [tagA, tagB] });
    const secondary = makeStub({ listTags: async () => [tagB, tagA] });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listTags();
    const orders = captured.filter((e) => e.kind === "order");
    const divergences = captured.filter((e) => e.kind === "divergence");
    expect(orders).toHaveLength(1);
    expect(divergences).toHaveLength(0);
    expect(orders[0].method).toBe("listTags");
  });

  test("listCategories: logs divergence when secondary has extra slug", async () => {
    const catA = makeCategory({ slug: "tech", label: "Tech" });
    const catB = makeCategory({ slug: "science", label: "Science" });
    const primary = makeStub({ listCategories: async () => [catA] });
    const secondary = makeStub({ listCategories: async () => [catA, catB] });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listCategories();
    const div = captured.find((e) => e.detail?.includes("extra-in-secondary") && e.detail?.includes('"science"'));
    expect(div?.kind).toBe("divergence");
  });

  test("listCategories: logs kind:order when same categories in different order", async () => {
    const catA = makeCategory({ slug: "tech" });
    const catB = makeCategory({ slug: "science" });
    const primary = makeStub({ listCategories: async () => [catA, catB] });
    const secondary = makeStub({ listCategories: async () => [catB, catA] });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listCategories();
    const orders = captured.filter((e) => e.kind === "order");
    const divergences = captured.filter((e) => e.kind === "divergence");
    expect(orders).toHaveLength(1);
    expect(divergences).toHaveLength(0);
  });

  test("listTags: no log entries when secondary matches primary exactly", async () => {
    const tags = [makeTag({ slug: "rust" }), makeTag({ slug: "go" })];
    const primary = makeStub({ listTags: async () => tags });
    const secondary = makeStub({ listTags: async () => tags.map((t) => ({ ...t })) });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listTags();
    expect(captured).toHaveLength(0);
  });
});

// ============================================================
// Aggregate / scalar methods (deep-equal)
// ============================================================

describe("ShadowContentAdapter — aggregate methods", () => {
  test("listPostStatusCounts: logs divergence when values differ", async () => {
    const primary = makeStub({ listPostStatusCounts: async () => ({ all: 5, published: 3, draft: 2, scheduled: 0 }) });
    const secondary = makeStub({ listPostStatusCounts: async () => ({ all: 4, published: 3, draft: 1, scheduled: 0 }) });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listPostStatusCounts("2024-01-01T00:00:00Z");
    expect(captured).toHaveLength(1);
    expect(captured[0].kind).toBe("divergence");
    expect(captured[0].method).toBe("listPostStatusCounts");
  });

  test("listPostStatusCounts: no log when secondary matches", async () => {
    const counts: StatusCounts = { all: 5, published: 3, draft: 2, scheduled: 0 };
    const primary = makeStub({ listPostStatusCounts: async () => counts });
    const secondary = makeStub({ listPostStatusCounts: async () => ({ ...counts }) });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.listPostStatusCounts("2024-01-01T00:00:00Z");
    expect(captured).toHaveLength(0);
  });

  test("getSiteConfig: logs divergence when values differ", async () => {
    const altConfig: SiteConfig = { ...BASE_SITE_CONFIG, title: "Different Site" };
    const primary = makeStub({ getSiteConfig: async () => BASE_SITE_CONFIG });
    const secondary = makeStub({ getSiteConfig: async () => altConfig });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.getSiteConfig();
    expect(captured).toHaveLength(1);
    expect(captured[0].kind).toBe("divergence");
    expect(captured[0].method).toBe("getSiteConfig");
  });

  test("getLinkGraph: logs divergence when node count differs", async () => {
    const altGraph: LinkGraph = {
      nodes: [{ id: "post:x", type: "post", slug: "x", title: "X", url: "/blog/x", published: true, public: true, inDegree: 0, outDegree: 0 }],
      edges: [],
      broken: [],
    };
    const primary = makeStub({ getLinkGraph: async () => BASE_LINK_GRAPH });
    const secondary = makeStub({ getLinkGraph: async () => altGraph });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.getLinkGraph();
    expect(captured).toHaveLength(1);
    expect(captured[0].kind).toBe("divergence");
    expect(captured[0].method).toBe("getLinkGraph");
  });

  test("getUnlinkedMentions: logs divergence when results differ", async () => {
    const mention: UnlinkedMention = { id: "post:alpha", type: "post", slug: "alpha", title: "Alpha", url: "/blog/alpha", count: 2 };
    const primary = makeStub({ getUnlinkedMentions: async () => [mention] });
    const secondary = makeStub({ getUnlinkedMentions: async () => [] });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.getUnlinkedMentions("post:beta");
    expect(captured).toHaveLength(1);
    expect(captured[0].kind).toBe("divergence");
    expect(captured[0].method).toBe("getUnlinkedMentions");
  });

  test("getUnlinkedMentions: no log when secondary matches", async () => {
    const mention: UnlinkedMention = { id: "post:alpha", type: "post", slug: "alpha", title: "Alpha", url: "/blog/alpha", count: 2 };
    const primary = makeStub({ getUnlinkedMentions: async () => [mention] });
    const secondary = makeStub({ getUnlinkedMentions: async () => [{ ...mention }] });
    const { shadow, captured } = makeShadow(primary, secondary);

    await shadow.getUnlinkedMentions("post:beta");
    expect(captured).toHaveLength(0);
  });
});

// ============================================================
// Fully-matching secondary produces zero log entries
// ============================================================

describe("ShadowContentAdapter — zero log entries when fully matching", () => {
  test("no logs when all 10 methods match exactly", async () => {
    const post = makePost({ slug: "alpha", tags: ["ts"], categories: ["tech"] });
    const page = makePage({ slug: "about" });
    const tag = makeTag({ slug: "ts" });
    const cat = makeCategory({ slug: "tech" });
    const mention: UnlinkedMention = { id: "post:x", type: "post", slug: "x", title: "X", url: "/blog/x", count: 1 };
    const statusCounts: StatusCounts = { all: 1, published: 1, draft: 0, scheduled: 0 };

    const repoData: ContentRepository = {
      listPosts: async () => ({ posts: [post], total: 1, totalPages: 1 }),
      getPost: async () => post,
      listPages: async () => ({ pages: [page], total: 1, totalPages: 1 }),
      listPostStatusCounts: async () => statusCounts,
      getPage: async () => page,
      listTags: async () => [tag],
      listCategories: async () => [cat],
      getSiteConfig: async () => BASE_SITE_CONFIG,
      getLinkGraph: async () => BASE_LINK_GRAPH,
      getUnlinkedMentions: async () => [mention],
    };
    // Secondary returns deep copies of the same data
    const secondaryData: ContentRepository = {
      listPosts: async () => ({ posts: [{ ...post }], total: 1, totalPages: 1 }),
      getPost: async () => ({ ...post }),
      listPages: async () => ({ pages: [{ ...page }], total: 1, totalPages: 1 }),
      listPostStatusCounts: async () => ({ ...statusCounts }),
      getPage: async () => ({ ...page }),
      listTags: async () => [{ ...tag }],
      listCategories: async () => [{ ...cat }],
      getSiteConfig: async () => ({ ...BASE_SITE_CONFIG, author: { ...BASE_SITE_CONFIG.author } }),
      getLinkGraph: async () => ({ nodes: [], edges: [], broken: [] }),
      getUnlinkedMentions: async () => [{ ...mention }],
    };

    const captured: ShadowDivergence[] = [];
    const shadow = new ShadowContentAdapter(repoData, secondaryData, { log: (e) => captured.push(e) });

    await shadow.listPosts();
    await shadow.getPost("alpha");
    await shadow.listPages();
    await shadow.listPostStatusCounts("2024-01-01T00:00:00Z");
    await shadow.getPage("about");
    await shadow.listTags();
    await shadow.listCategories();
    await shadow.getSiteConfig();
    await shadow.getLinkGraph();
    await shadow.getUnlinkedMentions("post:x");

    expect(captured).toHaveLength(0);
  });
});
