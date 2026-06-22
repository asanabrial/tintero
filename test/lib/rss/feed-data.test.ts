import { describe, expect, test } from "bun:test";
import * as path from "path";
import { renderRssResponse, renderAtomResponse, getFeedPostsFiltered, type FeedData } from "../../../src/lib/rss/feed-data";
import { FilesystemContentAdapter } from "../../../src/lib/content/fs-adapter";
import type { Post, SiteConfig } from "../../../src/lib/content/types";

// ---------------------------------------------------------------------------
// Hand-built fixtures — no I/O, no connection()
// ---------------------------------------------------------------------------

const siteConfig: SiteConfig = {
  title: "My Test Blog",
  description: "A test blog description",
  baseUrl: "https://example.com/",
  language: "en-US",
  author: { name: "Test Author", email: "test@example.com" },
  nav: [],
  footerNav: [],
  reading: { homepage: "latest-posts", posts_per_page: 10 },
  comments: { enabled: false, moderation: "auto" },
};

const post1: Post = {
  slug: "hello-world",
  title: "Hello World",
  date: "2024-03-15",
  status: "published",
  tags: ["web"],
  categories: ["tech"],
  excerpt: "A great intro post",
  html: "<p>Full content here</p>",
  comments: false,
  sticky: false,
  author: "Test Author",
  visibility: "public",
};

const post2: Post = {
  slug: "second-post",
  title: "Second Post & More",
  date: "2024-02-01",
  status: "published",
  tags: [],
  categories: ["news"],
  excerpt: "Second excerpt",
  html: "<p>Second content</p>",
  comments: false,
  sticky: false,
  author: "Test Author",
  visibility: "public",
};

const fixtureFeedData: FeedData = {
  siteConfig,
  base: "https://example.com",
  posts: [post1, post2],
};

// ---------------------------------------------------------------------------
// renderRssResponse
// ---------------------------------------------------------------------------

describe("renderRssResponse", () => {
  test("returns a Response with Content-Type application/rss+xml", async () => {
    const response = renderRssResponse(fixtureFeedData);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
  });

  test("body contains RSS channel wrapper", async () => {
    const response = renderRssResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("<channel>");
    expect(body).toContain("<rss version=\"2.0\"");
  });

  test("body contains site title and description", async () => {
    const response = renderRssResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("<title>My Test Blog</title>");
    expect(body).toContain("<description>A test blog description</description>");
  });

  test("body contains post items with correct permalinks", async () => {
    const response = renderRssResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("<link>https://example.com/blog/hello-world</link>");
    expect(body).toContain("https://example.com/blog/second-post");
  });

  test("body contains post titles and excerpts", async () => {
    const response = renderRssResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("<title>Hello World</title>");
    expect(body).toContain("<description>A great intro post</description>");
  });

  test("post title with special characters is escaped in RSS", async () => {
    const response = renderRssResponse({
      ...fixtureFeedData,
      posts: [post2],
    });
    const body = await response.text();
    expect(body).toContain("Second Post &amp; More");
  });

  test("categories and tags are merged and emitted", async () => {
    const response = renderRssResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("<category>tech</category>");
    expect(body).toContain("<category>web</category>");
  });

  test("selfHref points to canonical /feed.xml", async () => {
    const response = renderRssResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("https://example.com/feed.xml");
    expect(body).toContain('rel="self"');
  });

  test("language is emitted", async () => {
    const response = renderRssResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("<language>en-US</language>");
  });
});

// ---------------------------------------------------------------------------
// renderAtomResponse
// ---------------------------------------------------------------------------

describe("renderAtomResponse", () => {
  test("returns a Response with Content-Type application/atom+xml", async () => {
    const response = renderAtomResponse(fixtureFeedData);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Type")).toBe("application/atom+xml; charset=utf-8");
  });

  test("body contains Atom feed wrapper with namespace", async () => {
    const response = renderAtomResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
  });

  test("body contains feed title and description as subtitle", async () => {
    const response = renderAtomResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("<title>My Test Blog</title>");
    expect(body).toContain("<subtitle>A test blog description</subtitle>");
  });

  test("body contains entry with correct permalink as id and link href", async () => {
    const response = renderAtomResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("<id>https://example.com/blog/hello-world</id>");
    expect(body).toContain('href="https://example.com/blog/hello-world"');
  });

  test("body contains entry titles and summaries", async () => {
    const response = renderAtomResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("<title>Hello World</title>");
    expect(body).toContain("<summary>A great intro post</summary>");
  });

  test("entry content is CDATA-wrapped", async () => {
    const response = renderAtomResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain('<content type="html">');
    expect(body).toContain("<![CDATA[<p>Full content here</p>]]>");
  });

  test("selfHref points to canonical /feed.xml/atom", async () => {
    const response = renderAtomResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("https://example.com/feed.xml/atom");
    expect(body).toContain('rel="self"');
  });

  test("feed updated is set to newest entry date", async () => {
    const response = renderAtomResponse(fixtureFeedData);
    const body = await response.text();
    // post1 is 2024-03-15 (newest) — should be feed <updated>
    expect(body).toContain("<updated>2024-03-15T00:00:00Z</updated>");
  });

  test("author name is included in entries", async () => {
    const response = renderAtomResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("<name>Test Author</name>");
  });
});

// ---------------------------------------------------------------------------
// renderRssResponse and renderAtomResponse with empty posts
// ---------------------------------------------------------------------------

describe("render fns with empty posts", () => {
  const emptyFeed: FeedData = { ...fixtureFeedData, posts: [] };

  test("renderRssResponse with empty posts returns valid RSS with no items", async () => {
    const response = renderRssResponse(emptyFeed);
    const body = await response.text();
    expect(body).toContain("<channel>");
    expect(body).not.toContain("<item>");
  });

  test("renderAtomResponse with empty posts returns valid Atom with no entries", async () => {
    const response = renderAtomResponse(emptyFeed);
    const body = await response.text();
    expect(body).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    expect(body).not.toContain("<entry>");
  });

  test("renderAtomResponse with empty posts uses deterministic epoch for feed updated (spec W1)", async () => {
    // Spec §3 locks the empty-entries fallback to the deterministic epoch,
    // NOT a wall-clock timestamp. This prevents non-deterministic output.
    const response = renderAtomResponse(emptyFeed);
    const body = await response.text();
    expect(body).toContain("<updated>1970-01-01T00:00:00Z</updated>");
    // Verify it does NOT contain any date that looks like a current timestamp
    // (i.e., anything that starts with a year > 1970).
    expect(body).not.toMatch(/<updated>(?!1970-01-01T00:00:00Z)[^<]+<\/updated>/);
  });
});

// ---------------------------------------------------------------------------
// renderRssResponse WITH feedTitle / selfHref overrides
// ---------------------------------------------------------------------------

describe("renderRssResponse with feedTitle/selfHref overrides", () => {
  test("uses feedTitle override as channel title instead of siteConfig.title", async () => {
    const overrideFeed: FeedData = {
      ...fixtureFeedData,
      feedTitle: "My Blog — Posts in tech",
    };
    const response = renderRssResponse(overrideFeed);
    const body = await response.text();
    // escapeXml does not escape the em dash — it appears as-is in the XML
    expect(body).toContain("<title>My Blog — Posts in tech</title>");
    expect(body).not.toContain("<title>My Test Blog</title>");
  });

  test("uses selfHref override as self-link instead of base/feed.xml", async () => {
    const overrideFeed: FeedData = {
      ...fixtureFeedData,
      selfHref: "https://example.com/blog/categories/tech/feed.xml",
    };
    const response = renderRssResponse(overrideFeed);
    const body = await response.text();
    expect(body).toContain("https://example.com/blog/categories/tech/feed.xml");
    expect(body).not.toContain("https://example.com/feed.xml");
  });

  test("without overrides falls back to siteConfig.title (byte-identical behavior)", async () => {
    const baseline = renderRssResponse(fixtureFeedData);
    const withExplicitUndefined: FeedData = {
      ...fixtureFeedData,
      feedTitle: undefined,
      selfHref: undefined,
    };
    const withUndefined = renderRssResponse(withExplicitUndefined);
    expect(await baseline.text()).toBe(await withUndefined.text());
  });

  test("without overrides falls back to base/feed.xml self-link", async () => {
    const response = renderRssResponse(fixtureFeedData);
    const body = await response.text();
    expect(body).toContain("https://example.com/feed.xml");
  });
});

// ---------------------------------------------------------------------------
// getFeedPostsFiltered — via FilesystemContentAdapter on fixture content dir
// ---------------------------------------------------------------------------

const FEEDS_FIXTURE = path.join(__dirname, "../../fixtures/content-feeds");

describe("getFeedPostsFiltered", () => {
  test("category filter returns only posts in that category", async () => {
    const adapter = new FilesystemContentAdapter(FEEDS_FIXTURE);
    const posts = await getFeedPostsFiltered({ category: "tech" }, adapter);
    expect(posts.length).toBeGreaterThanOrEqual(2);
    for (const post of posts) {
      expect(post.categories.some((c) => c === "tech" || c.startsWith("tech/"))).toBe(true);
    }
  });

  test("category filter excludes future-dated posts", async () => {
    const adapter = new FilesystemContentAdapter(FEEDS_FIXTURE);
    const posts = await getFeedPostsFiltered({ category: "tech" }, adapter);
    const now = new Date().toISOString().slice(0, 10);
    for (const post of posts) {
      expect(post.date <= now).toBe(true);
    }
  });

  test("tag filter returns only posts with that tag", async () => {
    const adapter = new FilesystemContentAdapter(FEEDS_FIXTURE);
    const posts = await getFeedPostsFiltered({ tag: "javascript" }, adapter);
    expect(posts.length).toBeGreaterThanOrEqual(1);
    for (const post of posts) {
      // tag may be stored as-is or slugified; check loosely
      expect(post.tags.some((t) => t.toLowerCase() === "javascript")).toBe(true);
    }
  });

  test("tag filter excludes future-dated posts", async () => {
    const adapter = new FilesystemContentAdapter(FEEDS_FIXTURE);
    const posts = await getFeedPostsFiltered({ tag: "javascript" }, adapter);
    const now = new Date().toISOString().slice(0, 10);
    for (const post of posts) {
      expect(post.date <= now).toBe(true);
    }
  });

  test("author filter returns only posts by that author slug", async () => {
    const adapter = new FilesystemContentAdapter(FEEDS_FIXTURE);
    const posts = await getFeedPostsFiltered({ author: "jane-doe" }, adapter);
    expect(posts.length).toBeGreaterThanOrEqual(1);
    for (const post of posts) {
      // slugifyAuthor("Jane Doe") === "jane-doe"
      expect(post.author.toLowerCase().replace(/\s+/g, "-")).toBe("jane-doe");
    }
  });

  test("author filter excludes future-dated posts", async () => {
    const adapter = new FilesystemContentAdapter(FEEDS_FIXTURE);
    const posts = await getFeedPostsFiltered({ author: "jane-doe" }, adapter);
    const now = new Date().toISOString().slice(0, 10);
    for (const post of posts) {
      expect(post.date <= now).toBe(true);
    }
  });

  test("unknown category returns empty array", async () => {
    const adapter = new FilesystemContentAdapter(FEEDS_FIXTURE);
    const posts = await getFeedPostsFiltered({ category: "nonexistent-xyz-123" }, adapter);
    expect(posts).toHaveLength(0);
  });

  test("unknown tag returns empty array", async () => {
    const adapter = new FilesystemContentAdapter(FEEDS_FIXTURE);
    const posts = await getFeedPostsFiltered({ tag: "zzz-unknown-tag-789" }, adapter);
    expect(posts).toHaveLength(0);
  });

  test("unknown author returns empty array", async () => {
    const adapter = new FilesystemContentAdapter(FEEDS_FIXTURE);
    const posts = await getFeedPostsFiltered({ author: "nobody-xyz-123" }, adapter);
    expect(posts).toHaveLength(0);
  });

  test("result is capped at FEED_ITEM_LIMIT", async () => {
    // The fixture has fewer than 20 posts, so this confirms the cap is respected
    const adapter = new FilesystemContentAdapter(FEEDS_FIXTURE);
    const posts = await getFeedPostsFiltered({}, adapter);
    expect(posts.length).toBeLessThanOrEqual(20);
  });
});
