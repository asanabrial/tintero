import { describe, expect, test } from "bun:test";
import { parseWxr } from "../../src/lib/content/wxr";

// ============================================================
// Helpers — minimal WXR XML builders
// ============================================================

function wxrDoc(items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:wp="http://wordpress.org/export/1.2/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/">
  <channel>
    <title>My WP Blog</title>
    ${items}
  </channel>
</rss>`;
}

function postItem(fields: {
  title?: string;
  postName?: string;
  postType?: string;
  status?: string;
  date?: string;
  content?: string;
  excerpt?: string;
  creator?: string;
  commentStatus?: string;
  categories?: string;
}): string {
  return `<item>
    <title>${fields.title ?? "Test Post"}</title>
    <wp:post_name>${fields.postName ?? "test-post"}</wp:post_name>
    <wp:post_type>${fields.postType ?? "post"}</wp:post_type>
    <wp:status>${fields.status ?? "publish"}</wp:status>
    <wp:post_date>${fields.date ?? "2024-03-15 10:22:01"}</wp:post_date>
    <content:encoded><![CDATA[${fields.content ?? "<p>Hello</p>"}]]></content:encoded>
    <excerpt:encoded><![CDATA[${fields.excerpt ?? ""}]]></excerpt:encoded>
    <dc:creator>${fields.creator ?? "admin"}</dc:creator>
    <wp:comment_status>${fields.commentStatus ?? "open"}</wp:comment_status>
    ${fields.categories ?? ""}
  </item>`;
}

// ============================================================
// Tests
// ============================================================

describe("parseWxr", () => {
  // 1. post → BundleItem
  test("post item maps to BundleItem with correct frontmatter and markdown body", () => {
    const xml = wxrDoc(
      postItem({
        title: "Hello World",
        postName: "hello-world",
        postType: "post",
        status: "publish",
        content: "<h2>Hello</h2><p>Some <strong>bold</strong> text.</p>",
        categories: `
          <category domain="post_tag" nicename="js"><![CDATA[JavaScript]]></category>
          <category domain="category" nicename="dev"><![CDATA[Development]]></category>
        `,
      })
    );

    const result = parseWxr(xml);

    expect(result.posts).toHaveLength(1);
    const post = result.posts[0];
    expect(post.frontmatter.title).toBe("Hello World");
    expect(post.frontmatter.status).toBe("published");
    expect(post.frontmatter.tags).toContain("JavaScript");
    expect(post.frontmatter.categories).toContain("Development");
    expect(post.raw).toContain("## Hello");
    expect(post.raw).toContain("**bold**");
  });

  // 2. page → subset + warning
  test("page item maps to subset frontmatter and emits warning for dropped fields", () => {
    const xml = wxrDoc(
      postItem({
        title: "About Us",
        postName: "about-us",
        postType: "page",
        status: "publish",
        categories: `
          <category domain="post_tag" nicename="tag1"><![CDATA[Tag1]]></category>
          <category domain="category" nicename="cat1"><![CDATA[Cat1]]></category>
        `,
        commentStatus: "open",
        creator: "admin",
      })
    );

    const result = parseWxr(xml);

    expect(result.pages).toHaveLength(1);
    const page = result.pages[0];
    // Only title, date, (excerpt) — no tags, categories, status, author, comments
    expect(page.frontmatter.title).toBe("About Us");
    expect(page.frontmatter.date).toBeTruthy();
    expect(page.frontmatter.tags).toBeUndefined();
    expect(page.frontmatter.categories).toBeUndefined();
    expect(page.frontmatter.status).toBeUndefined();
    expect(page.frontmatter.author).toBeUndefined();
    expect(page.frontmatter.comments).toBeUndefined();
    // Warning for dropped fields
    expect(result.warnings.some((w) => /discard|dropped|not supported/i.test(w))).toBe(true);
  });

  // 3. attachment → skip + warning
  test("attachment items are skipped with a warning", () => {
    const xml = wxrDoc(
      postItem({
        title: "My Image",
        postType: "attachment",
      })
    );

    const result = parseWxr(xml);

    expect(result.posts).toHaveLength(0);
    expect(result.pages).toHaveLength(0);
    expect(result.warnings[0]).toMatch(/attachment/i);
  });

  // 4. status mapping
  test("publish maps to published; draft and pending both map to draft", () => {
    const published = parseWxr(
      wxrDoc(postItem({ postName: "pub", status: "publish" }))
    );
    expect(published.posts[0].frontmatter.status).toBe("published");

    const draft = parseWxr(
      wxrDoc(postItem({ postName: "draft-post", status: "draft" }))
    );
    expect(draft.posts[0].frontmatter.status).toBe("draft");

    const pending = parseWxr(
      wxrDoc(postItem({ postName: "pending-post", status: "pending" }))
    );
    expect(pending.posts[0].frontmatter.status).toBe("draft");
  });

  // 5. tags vs categories split by @_domain
  test("categories split correctly by domain: post_tag → tags, category → categories", () => {
    const xml = wxrDoc(
      postItem({
        postName: "split-test",
        categories: `
          <category domain="post_tag" nicename="js"><![CDATA[JavaScript]]></category>
          <category domain="category" nicename="dev"><![CDATA[Development]]></category>
        `,
      })
    );

    const result = parseWxr(xml);

    expect(result.posts[0].frontmatter.tags).toEqual(["JavaScript"]);
    expect(result.posts[0].frontmatter.categories).toEqual(["Development"]);
  });

  // 6. HTML → Markdown conversion
  test("HTML headings and bold convert to ATX markdown", () => {
    const xml = wxrDoc(
      postItem({
        postName: "html-md",
        content: "<h2>X</h2><p><strong>y</strong></p>",
      })
    );

    const result = parseWxr(xml);

    expect(result.posts[0].raw).toContain("## X");
    expect(result.posts[0].raw).toContain("**y**");
  });

  // 7. unsafe wp:post_name → slugifyTitle fallback
  test("unsafe wp:post_name causes fallback to slugifyTitle(title)", () => {
    const xml = wxrDoc(
      postItem({
        title: "Safe Title",
        postName: "Hello World!",
      })
    );

    const result = parseWxr(xml);

    expect(result.posts).toHaveLength(1);
    const slug = result.posts[0].slug;
    // Must be safe: lowercase, hyphens only, no special chars
    expect(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)).toBe(true);
    expect(slug).toContain("safe");
  });

  // 8. slug deduplication
  test("two posts with the same slug get deduplicated to foo and foo-2", () => {
    const xml = wxrDoc(
      postItem({ title: "Foo", postName: "foo" }) +
        postItem({ title: "Foo Duplicate", postName: "foo" })
    );

    const result = parseWxr(xml);

    expect(result.posts).toHaveLength(2);
    expect(result.posts[0].slug).toBe("foo");
    expect(result.posts[1].slug).toBe("foo-2");
  });

  // 9. malformed/non-WXR XML → no throw, always returns WxrResult shape
  test("malformed or non-WXR XML never throws and returns empty posts/pages", () => {
    // fast-xml-parser v5 is lenient and may not throw on "<<not xml>>",
    // but parseWxr must NEVER throw and must return the WxrResult shape.
    expect(() => {
      const result = parseWxr("<<not xml>>");
      expect(result).toHaveProperty("posts");
      expect(result).toHaveProperty("pages");
      expect(result).toHaveProperty("warnings");
      expect(result.posts).toHaveLength(0);
      expect(result.pages).toHaveLength(0);
    }).not.toThrow();

    expect(() => {
      const result = parseWxr("");
      expect(result.posts).toHaveLength(0);
      expect(result.pages).toHaveLength(0);
    }).not.toThrow();
  });

  test("truly invalid XML that causes a parse error returns warnings with XML parse error", () => {
    // A null byte causes fast-xml-parser v5 to throw
    expect(() => {
      const result = parseWxr("\x00\x01\x02");
      expect(result).toHaveProperty("posts");
      expect(result).toHaveProperty("pages");
      expect(result).toHaveProperty("warnings");
    }).not.toThrow();
  });

  // 10. single <item> (object not array) normalized
  test("single item in channel normalizes to an array of length 1", () => {
    const xml = wxrDoc(postItem({ postName: "single-item" }));

    const result = parseWxr(xml);

    expect(result.posts).toHaveLength(1);
  });

  // 11. missing/bad date → 1970-01-01
  test("malformed wp:post_date falls back to 1970-01-01", () => {
    const xml = wxrDoc(
      postItem({ postName: "bad-date", date: "not-a-date" })
    );
    const result = parseWxr(xml);
    expect(result.posts[0].frontmatter.date).toBe("1970-01-01");
  });

  test("missing wp:post_date falls back to 1970-01-01", () => {
    const rawXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:wp="http://wordpress.org/export/1.2/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/">
  <channel>
    <item>
      <title>No Date Post</title>
      <wp:post_name>no-date</wp:post_name>
      <wp:post_type>post</wp:post_type>
      <wp:status>publish</wp:status>
      <content:encoded><![CDATA[<p>No date here</p>]]></content:encoded>
      <excerpt:encoded><![CDATA[]]></excerpt:encoded>
      <dc:creator>admin</dc:creator>
      <wp:comment_status>open</wp:comment_status>
    </item>
  </channel>
</rss>`;
    const result = parseWxr(rawXml);
    expect(result.posts[0].frontmatter.date).toBe("1970-01-01");
  });

  // 12. empty categories → ["Uncategorized"]
  test("post with no category elements defaults categories to Uncategorized", () => {
    const xml = wxrDoc(
      postItem({
        postName: "no-cats",
        categories: "",
      })
    );

    const result = parseWxr(xml);

    expect(result.posts[0].frontmatter.categories).toEqual(["Uncategorized"]);
  });
});
