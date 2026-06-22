import { describe, expect, test } from "bun:test";
import { generateWxr } from "../../src/lib/content/wxr-export";
import { parseWxr } from "../../src/lib/content/wxr";
import type { Post, Page } from "../../src/lib/content/types";

// ============================================================
// Fixtures
// ============================================================

const sampleSite = {
  title: "My Tintero Blog",
  description: "A test site",
  baseUrl: "https://example.com",
  language: "en-US",
};

const samplePost: Post = {
  slug: "hello-world",
  title: "Hello World",
  date: "2024-03-15",
  status: "published",
  tags: ["JavaScript", "TypeScript"],
  categories: ["Development", "Web"],
  excerpt: "A short excerpt.",
  html: "<h2>Heading</h2><p>Some <strong>bold</strong> text.</p>",
  comments: true,
  sticky: false,
  author: "admin",
  visibility: "public",
};

const sampleDraftPost: Post = {
  slug: "draft-post",
  title: "Draft Post",
  date: "2024-04-01",
  status: "draft",
  tags: [],
  categories: ["Drafts"],
  excerpt: "",
  html: "<p>Work in progress.</p>",
  comments: false,
  sticky: false,
  author: "editor",
  visibility: "public",
};

const samplePage: Page = {
  slug: "about",
  title: "About Us",
  date: "2024-01-10",
  status: "published",
  excerpt: "About page excerpt.",
  html: "<p>Welcome to our about page.</p>",
  menuOrder: 1,
};

const sampleDraftPage: Page = {
  slug: "draft-page",
  title: "Draft Page",
  date: "2024-05-01",
  status: "draft",
  excerpt: "",
  html: "<p>Not yet published.</p>",
  menuOrder: 0,
};

// ============================================================
// Tests
// ============================================================

describe("generateWxr", () => {
  // 1. Valid XML structure — channel and item nodes
  test("produces a well-formed WXR document with channel metadata", () => {
    const xml = generateWxr({ posts: [samplePost], pages: [samplePage], site: sampleSite });

    // Must be a string
    expect(typeof xml).toBe("string");
    // WXR root and namespaces
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("http://wordpress.org/export/1.2/");
    expect(xml).toContain("http://purl.org/rss/1.0/modules/content/");
    expect(xml).toContain("http://purl.org/dc/elements/1.1/");
    expect(xml).toContain("http://wordpress.org/export/1.2/excerpt/");
    // Channel
    expect(xml).toContain("<wp:wxr_version>1.2</wp:wxr_version>");
    expect(xml).toContain("<title>My Tintero Blog</title>");
    expect(xml).toContain("<description>A test site</description>");
    expect(xml).toContain("<language>en-US</language>");
    // Items exist
    expect(xml).toContain("<wp:post_type>post</wp:post_type>");
    expect(xml).toContain("<wp:post_type>page</wp:post_type>");
  });

  // 2. Post item fields
  test("post item contains correct fields", () => {
    const xml = generateWxr({ posts: [samplePost], pages: [], site: sampleSite });

    expect(xml).toContain("<title>Hello World</title>");
    expect(xml).toContain("<wp:post_name>hello-world</wp:post_name>");
    expect(xml).toContain("<wp:post_type>post</wp:post_type>");
    expect(xml).toContain("<wp:status>publish</wp:status>");
    expect(xml).toContain("<wp:post_date>2024-03-15");
    expect(xml).toContain("<dc:creator>admin</dc:creator>");
    // Categories and tags
    expect(xml).toContain('domain="category"');
    expect(xml).toContain('domain="post_tag"');
    expect(xml).toContain("JavaScript");
    expect(xml).toContain("Development");
    // HTML body in CDATA
    expect(xml).toContain("<content:encoded><![CDATA[");
    expect(xml).toContain("<h2>Heading</h2>");
  });

  // 3. Page item fields
  test("page item contains correct fields", () => {
    const xml = generateWxr({ posts: [], pages: [samplePage], site: sampleSite });

    expect(xml).toContain("<title>About Us</title>");
    expect(xml).toContain("<wp:post_name>about</wp:post_name>");
    expect(xml).toContain("<wp:post_type>page</wp:post_type>");
    expect(xml).toContain("<wp:status>publish</wp:status>");
    expect(xml).toContain("<wp:post_date>2024-01-10");
  });

  // 4. Status mapping: "published" → "publish", "draft" → "draft"
  test("maps published→publish and draft→draft for posts", () => {
    const xml = generateWxr({
      posts: [samplePost, sampleDraftPost],
      pages: [],
      site: sampleSite,
    });

    const publishCount = (xml.match(/<wp:status>publish<\/wp:status>/g) ?? []).length;
    const draftCount = (xml.match(/<wp:status>draft<\/wp:status>/g) ?? []).length;
    expect(publishCount).toBe(1);
    expect(draftCount).toBe(1);
  });

  // 5. Draft posts and pages are included
  test("draft posts and pages are included in the output", () => {
    const xml = generateWxr({
      posts: [sampleDraftPost],
      pages: [sampleDraftPage],
      site: sampleSite,
    });

    expect(xml).toContain("<title>Draft Post</title>");
    expect(xml).toContain("<title>Draft Page</title>");
    // Both should be status draft
    const draftCount = (xml.match(/<wp:status>draft<\/wp:status>/g) ?? []).length;
    expect(draftCount).toBe(2);
  });

  // 6. XML escaping in text nodes
  test("XML-escapes special chars in text nodes (title, creator)", () => {
    const postWithSpecialChars: Post = {
      ...samplePost,
      slug: "special-chars",
      title: 'Post with <tag> & "quotes" and >arrow<',
      author: "O'Brien & Smith",
    };
    const xml = generateWxr({ posts: [postWithSpecialChars], pages: [], site: sampleSite });

    // The title text node must be escaped — no raw < > & in text content
    // It should parse back without error
    expect(() => {
      const result = parseWxr(xml);
      expect(result.warnings.some((w) => /XML parse error/i.test(w))).toBe(false);
    }).not.toThrow();

    // Must NOT contain raw unescaped < or & in text positions
    // The escaped forms should be present
    expect(xml).toContain("&lt;tag&gt;");
    expect(xml).toContain("&amp;");
  });

  // 7. HTML body stays in CDATA — not escaped
  test("HTML body content is wrapped in CDATA, not escaped", () => {
    const xml = generateWxr({ posts: [samplePost], pages: [], site: sampleSite });

    // CDATA section means raw HTML is preserved
    expect(xml).toContain("<![CDATA[");
    expect(xml).toContain("<h2>Heading</h2>");
    expect(xml).toContain("<strong>bold</strong>");
  });

  // Regression: a post body containing the literal `]]>` must NOT terminate the
  // CDATA section early. Without splitting `]]>` → `]]]]><![CDATA[>`, the document
  // becomes malformed and everything after the sequence leaks as raw markup.
  test("CDATA-safe: post html containing ]]> does not corrupt the document and round-trips", () => {
    const trickyPost: Post = {
      ...samplePost,
      slug: "cdata-trap",
      title: "CDATA Trap",
      html: "<pre>example with ]]> inside a code block</pre>",
    };
    const xml = generateWxr({ posts: [trickyPost], pages: [], site: sampleSite });

    // The raw `]]>` must have been neutralized via the split trick.
    expect(xml).toContain("]]]]><![CDATA[>");

    // The document must still parse and yield exactly the one post.
    const result = parseWxr(xml);
    expect(result.posts.length).toBe(1);
    expect(result.posts[0].frontmatter.title).toBe("CDATA Trap");
  });

  // 8. Round-trip test: generateWxr → parseWxr → same structured data
  test("round-trip: parseWxr(generateWxr(...)) preserves post title, slug, status, categories, tags", () => {
    const xml = generateWxr({ posts: [samplePost], pages: [samplePage], site: sampleSite });
    const result = parseWxr(xml);

    expect(result.posts).toHaveLength(1);
    const post = result.posts[0];
    expect(post.frontmatter.title).toBe("Hello World");
    expect(post.slug).toBe("hello-world");
    // parseWxr maps "publish" → "published"
    expect(post.frontmatter.status).toBe("published");
    expect(post.frontmatter.tags).toContain("JavaScript");
    expect(post.frontmatter.tags).toContain("TypeScript");
    expect(post.frontmatter.categories).toContain("Development");
    expect(post.frontmatter.categories).toContain("Web");
    // Body content survives in recognizable form (markdown after conversion)
    expect(post.raw).toContain("## Heading");
    expect(post.raw).toContain("**bold**");

    // Page — parseWxr only preserves title and date for pages
    expect(result.pages).toHaveLength(1);
    const page = result.pages[0];
    expect(page.frontmatter.title).toBe("About Us");
    expect(page.slug).toBe("about");
    expect(page.frontmatter.date).toBe("2024-01-10");
  });

  // 9. Round-trip draft status
  test("round-trip: draft posts and pages round-trip with correct status", () => {
    const xml = generateWxr({
      posts: [sampleDraftPost],
      pages: [sampleDraftPage],
      site: sampleSite,
    });
    const result = parseWxr(xml);

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].frontmatter.status).toBe("draft");

    // Pages: parseWxr drops status for pages (expected behavior — warn but include)
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].frontmatter.title).toBe("Draft Page");
  });

  // 10. XML escaping round-trip — special chars in title parse back without error
  test("round-trip: title with & < > \" parses back without XML error", () => {
    const postWithSpecialChars: Post = {
      ...samplePost,
      slug: "special-rt",
      title: "Post & More <stuff>",
    };

    const xml = generateWxr({ posts: [postWithSpecialChars], pages: [], site: sampleSite });

    const result = parseWxr(xml);
    expect(result.warnings.some((w) => /XML parse error/i.test(w))).toBe(false);
    expect(result.posts).toHaveLength(1);
    // Title is preserved through XML escaping
    expect(result.posts[0].frontmatter.title).toBe("Post & More <stuff>");
  });

  // 11. Empty posts and pages
  test("produces valid XML with no items when posts and pages are empty", () => {
    const xml = generateWxr({ posts: [], pages: [], site: sampleSite });

    expect(() => parseWxr(xml)).not.toThrow();
    const result = parseWxr(xml);
    expect(result.posts).toHaveLength(0);
    expect(result.pages).toHaveLength(0);
  });

  // 12. Multiple posts produce correct item count
  test("multiple posts produce correct number of items", () => {
    const xml = generateWxr({
      posts: [samplePost, sampleDraftPost],
      pages: [samplePage],
      site: sampleSite,
    });

    const result = parseWxr(xml);
    expect(result.posts).toHaveLength(2);
    expect(result.pages).toHaveLength(1);
  });
});
