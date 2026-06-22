import { describe, expect, test } from "bun:test";
import {
  buildExportBundle,
  BUNDLE_VERSION,
} from "../../src/lib/content/export";
import type { BuildExportInput } from "../../src/lib/content/export";
import type { Post, Page, SiteConfig } from "../../src/lib/content/types";

// ============================================================
// Fixtures
// ============================================================

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    slug: "my-post",
    title: "My Post",
    date: "2024-01-15",
    status: "published",
    tags: ["typescript"],
    categories: ["tech"],
    excerpt: "A short excerpt.",
    html: "<p>Hello world</p>",
    comments: true,
    sticky: false,
    author: "Jane Doe",
    visibility: "public",
    ...overrides,
  };
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    slug: "about",
    title: "About",
    date: "2024-01-01",
    status: "published",
    excerpt: "About the site.",
    html: "<p>About</p>",
    menuOrder: 0,
    ...overrides,
  };
}

const SITE_CONFIG: SiteConfig = {
  title: "My Blog",
  description: "A blog",
  baseUrl: "https://example.com",
  language: "en",
  author: { name: "Jane Doe", email: "jane@example.com" },
  nav: [],
  footerNav: [],
  reading: { homepage: "latest-posts", posts_per_page: 10 },
  comments: { enabled: true, moderation: "manual" },
};

const INJECTED_DATE = "2026-01-01T00:00:00.000Z";

function makeInput(overrides: Partial<BuildExportInput> = {}): BuildExportInput {
  return {
    posts: [
      {
        post: makePost(),
        raw: {
          frontmatter: {},
          rawData: { title: "My Post", date: "2024-01-15", status: "published", tags: ["typescript"], categories: ["tech"], comments: true, unknownKey: "should-be-dropped" },
          body: "# Hello\n\nContent here.",
        },
      },
    ],
    pages: [
      {
        page: makePage(),
        raw: {
          frontmatter: {},
          rawData: { title: "About", date: "2024-01-01", unknownPageKey: "dropped" },
          body: "# About\n\nAbout page.",
        },
      },
    ],
    siteConfig: SITE_CONFIG,
    exportedAt: INJECTED_DATE,
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe("buildExportBundle", () => {
  test("returns version === BUNDLE_VERSION (1)", () => {
    const bundle = buildExportBundle(makeInput());
    expect(bundle.version).toBe(BUNDLE_VERSION);
    expect(BUNDLE_VERSION).toBe(1);
  });

  test("exportedAt is the injected string verbatim — not a new Date() call", () => {
    const bundle1 = buildExportBundle(makeInput());
    const bundle2 = buildExportBundle(makeInput());
    expect(bundle1.exportedAt).toBe(INJECTED_DATE);
    expect(bundle2.exportedAt).toBe(INJECTED_DATE);
  });

  test("draft post passed in input appears in bundle.posts (caller controls inclusion)", () => {
    const input = makeInput({
      posts: [
        {
          post: makePost({ slug: "draft-post", status: "draft" }),
          raw: {
            frontmatter: {},
            rawData: { title: "Draft Post", date: "2024-06-01", status: "draft", tags: [], categories: [], comments: true },
            body: "Draft content.",
          },
        },
      ],
    });
    const bundle = buildExportBundle(input);
    expect(bundle.posts).toHaveLength(1);
    expect(bundle.posts[0].slug).toBe("draft-post");
  });

  test("unknown key in rawData is dropped from frontmatter (whitelist)", () => {
    const bundle = buildExportBundle(makeInput());
    const fm = bundle.posts[0].frontmatter as Record<string, unknown>;
    expect("unknownKey" in fm).toBe(false);
    expect(fm.title).toBe("My Post");
    expect(fm.date).toBe("2024-01-15");
  });

  test("bundle.posts[].raw equals input raw.body (body passthrough, not full file)", () => {
    const bundle = buildExportBundle(makeInput());
    expect(bundle.posts[0].raw).toBe("# Hello\n\nContent here.");
  });

  test("page item maps via pickPageFrontmatter and unknown page keys are dropped", () => {
    const bundle = buildExportBundle(makeInput());
    expect(bundle.pages).toHaveLength(1);
    expect(bundle.pages[0].slug).toBe("about");
    const fm = bundle.pages[0].frontmatter as Record<string, unknown>;
    expect("unknownPageKey" in fm).toBe(false);
    expect(fm.title).toBe("About");
    expect(bundle.pages[0].raw).toBe("# About\n\nAbout page.");
  });

  test("siteConfig is present in bundle; no secret keys present", () => {
    const bundle = buildExportBundle(makeInput());
    expect(bundle.siteConfig).toBeDefined();
    expect(bundle.siteConfig.title).toBe("My Blog");
    // Confirm no secrets
    const keys = Object.keys(bundle.siteConfig);
    expect(keys).not.toContain("AUTH_SECRET");
    expect(keys).not.toContain("API_TOKEN");
    expect(keys).not.toContain("DATABASE_URL");
    expect(keys).not.toContain("authSecret");
    expect(keys).not.toContain("apiToken");
    expect(keys).not.toContain("databaseUrl");
  });

  test("empty posts+pages input produces {posts:[], pages:[]}", () => {
    const bundle = buildExportBundle(makeInput({ posts: [], pages: [] }));
    expect(bundle.posts).toEqual([]);
    expect(bundle.pages).toEqual([]);
  });

  test("null raw falls back to empty body and empty frontmatter", () => {
    const input = makeInput({
      posts: [{ post: makePost(), raw: null }],
    });
    const bundle = buildExportBundle(input);
    expect(bundle.posts[0].raw).toBe("");
    // frontmatter should be an empty-ish object (pickPostFrontmatter({}) returns {})
    expect(Object.keys(bundle.posts[0].frontmatter as object)).toHaveLength(0);
  });
});
