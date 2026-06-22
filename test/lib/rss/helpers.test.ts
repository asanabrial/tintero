import { describe, expect, test } from "bun:test";
import { buildRssChannel, escapeXml, toRfc822, type RssChannelMeta, type RssItem } from "../../../src/lib/rss/index";

// ---------------------------------------------------------------------------
// escapeXml
// ---------------------------------------------------------------------------

describe("escapeXml", () => {
  test("escapes ampersand", () => {
    expect(escapeXml("&")).toBe("&amp;");
  });

  test("escapes less-than", () => {
    expect(escapeXml("<")).toBe("&lt;");
  });

  test("escapes greater-than", () => {
    expect(escapeXml(">")).toBe("&gt;");
  });

  test("escapes double-quote", () => {
    expect(escapeXml('"')).toBe("&quot;");
  });

  test("escapes apostrophe", () => {
    expect(escapeXml("'")).toBe("&apos;");
  });

  test("escapes all five entities in a combined string", () => {
    expect(escapeXml('& < > " \'')).toBe("&amp; &lt; &gt; &quot; &apos;");
  });

  test("safe characters pass through unchanged", () => {
    expect(escapeXml("Hello World 123")).toBe("Hello World 123");
  });

  test("mixed safe and unsafe characters (XSS scenario)", () => {
    expect(escapeXml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  test("& is replaced FIRST — already-entity input becomes double-escaped", () => {
    // Input: the literal string "&amp;" (5 chars)
    // After replacing &→&amp;: "&amp;amp;" — this is correct caller-contract behaviour
    expect(escapeXml("&amp;")).toBe("&amp;amp;");
  });
});

// ---------------------------------------------------------------------------
// toRfc822
// ---------------------------------------------------------------------------

describe("toRfc822", () => {
  const iso = "2024-01-01T00:00:00.000Z";
  const dateObj = new Date(iso);

  test("Date object produces RFC-822 output", () => {
    const result = toRfc822(dateObj);
    // RFC-822 format produced by Date.toUTCString(): "Mon, 01 Jan 2024 00:00:00 GMT"
    // The exact string: contains day-of-week abbr, month abbr, 4-digit year
    expect(result).toMatch(/^[A-Z][a-z]{2},\s\d{2}\s[A-Z][a-z]{2}\s\d{4}\s\d{2}:\d{2}:\d{2}\s/);
    expect(result).toContain("2024");
    expect(result).toContain("Jan");
  });

  test("ISO string produces same output as equivalent Date object", () => {
    expect(toRfc822(iso)).toBe(toRfc822(dateObj));
  });

  test("output contains expected UTC timezone marker", () => {
    const result = toRfc822(dateObj);
    // toUTCString() produces "GMT" suffix
    expect(result).toMatch(/GMT$/);
  });

  test("ISO string at non-midnight time formats correctly", () => {
    const iso2 = "2024-06-13T12:30:45.000Z";
    const result = toRfc822(iso2);
    expect(result).toContain("2024");
    expect(result).toContain("Jun");
    expect(result).toContain("12:30:45");
  });
});

// ---------------------------------------------------------------------------
// buildRssChannel
// ---------------------------------------------------------------------------

describe("buildRssChannel", () => {
  const channelMeta: RssChannelMeta = {
    title: "Test Blog",
    link: "https://example.com/",
    description: "A test blog description",
  };

  const item1: RssItem = {
    title: "Post One",
    link: "https://example.com/blog/post-one",
    description: "First post description",
    pubDate: "Mon, 01 Jan 2024 00:00:00 GMT",
    guid: "https://example.com/blog/post-one",
  };

  const item2: RssItem = {
    title: "Post Two",
    link: "https://example.com/blog/post-two",
    description: "Second post description",
    pubDate: "Tue, 02 Jan 2024 00:00:00 GMT",
    guid: "https://example.com/blog/post-two",
  };

  test("starts with XML declaration", () => {
    const xml = buildRssChannel(channelMeta, []);
    expect(xml).toMatch(/^<\?xml version="1\.0"/);
  });

  test("contains rss version 2.0 element", () => {
    const xml = buildRssChannel(channelMeta, []);
    expect(xml).toContain('<rss version="2.0"');
  });

  test("contains channel element", () => {
    const xml = buildRssChannel(channelMeta, []);
    expect(xml).toContain("<channel>");
  });

  test("channel title/description are escaped (raw < becomes &lt;)", () => {
    const meta: RssChannelMeta = {
      title: "Blog <Test>",
      link: "https://example.com/",
      description: 'Description with "quotes" & stuff',
    };
    const xml = buildRssChannel(meta, []);
    expect(xml).toContain("Blog &lt;Test&gt;");
    expect(xml).toContain("Description with &quot;quotes&quot; &amp; stuff");
  });

  test("emits exactly N item elements for N-item input", () => {
    const xmlZero = buildRssChannel(channelMeta, []);
    const xmlOne = buildRssChannel(channelMeta, [item1]);
    const xmlTwo = buildRssChannel(channelMeta, [item1, item2]);

    const countItems = (xml: string) =>
      (xml.match(/<item>/g) ?? []).length;

    expect(countItems(xmlZero)).toBe(0);
    expect(countItems(xmlOne)).toBe(1);
    expect(countItems(xmlTwo)).toBe(2);
  });

  test("each item contains title, link, guid, description, pubDate elements", () => {
    const xml = buildRssChannel(channelMeta, [item1]);
    expect(xml).toContain("<title>Post One</title>");
    expect(xml).toContain(`<link>${item1.link}</link>`);
    expect(xml).toContain(`<guid`);
    expect(xml).toContain(`<description>`);
    expect(xml).toContain("<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>");
  });

  test("item title and description are escaped", () => {
    const itemWithHtml: RssItem = {
      title: '<script>alert("xss")</script>',
      link: "https://example.com/blog/safe",
      description: "<b>bold</b> & more",
      pubDate: "Mon, 01 Jan 2024 00:00:00 GMT",
      guid: "https://example.com/blog/safe",
    };
    const xml = buildRssChannel(channelMeta, [itemWithHtml]);
    expect(xml).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(xml).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; more");
  });

  test("item link and guid are emitted raw (not escaped)", () => {
    const xml = buildRssChannel(channelMeta, [item1]);
    expect(xml).toContain(`<link>${item1.link}</link>`);
    expect(xml).toContain(item1.guid);
  });

  test("empty items array produces valid channel with zero item tags", () => {
    const xml = buildRssChannel(channelMeta, []);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });

  test("optional language field emitted only when present", () => {
    const withLang: RssChannelMeta = { ...channelMeta, language: "en-US" };
    const without = buildRssChannel(channelMeta, []);
    const withL = buildRssChannel(withLang, []);
    expect(without).not.toContain("<language>");
    expect(withL).toContain("<language>en-US</language>");
  });

  test("optional selfHref emits atom:link when present", () => {
    const withSelf: RssChannelMeta = { ...channelMeta, selfHref: "https://example.com/feed.xml" };
    const without = buildRssChannel(channelMeta, []);
    const withS = buildRssChannel(withSelf, []);
    expect(without).not.toContain('rel="self"');
    expect(withS).toContain('rel="self"');
    expect(withS).toContain("https://example.com/feed.xml");
  });

  test("optional categories on RssItem emitted as category elements (escaped)", () => {
    const itemWithCats: RssItem = {
      ...item1,
      categories: ["TypeScript", "Web Dev & More", "<special>"],
    };
    const xml = buildRssChannel(channelMeta, [itemWithCats]);
    expect(xml).toContain("<category>TypeScript</category>");
    expect(xml).toContain("<category>Web Dev &amp; More</category>");
    expect(xml).toContain("<category>&lt;special&gt;</category>");
  });

  test("absent categories produces no category tags", () => {
    const xml = buildRssChannel(channelMeta, [item1]);
    expect(xml).not.toContain("<category>");
  });

  // -------------------------------------------------------------------------
  // WU-2 no-regression anchor: buildRssChannel produces a feed.xml-equivalent output
  // -------------------------------------------------------------------------

  describe("no-regression anchor (feed.xml field equivalence)", () => {
    const base = "https://myblog.example.com";
    const postItem: RssItem = {
      title: "Hello World",
      link: `${base}/blog/hello-world`,
      guid: `${base}/blog/hello-world`,
      description: "A great intro post",
      pubDate: "Mon, 01 Jan 2024 00:00:00 GMT",
      categories: ["TypeScript", "Web"],
    };
    const feedMeta: RssChannelMeta = {
      title: "My Blog",
      link: `${base}/`,
      description: "My blog description",
      language: "en-US",
      selfHref: `${base}/feed.xml`,
    };

    test("feed.xml-shaped output has channel wrapper fields", () => {
      const xml = buildRssChannel(feedMeta, [postItem]);
      expect(xml).toContain("<channel>");
      expect(xml).toContain("<title>My Blog</title>");
      expect(xml).toContain(`<link>${base}/</link>`);
      expect(xml).toContain("<description>My blog description</description>");
      expect(xml).toContain("<language>en-US</language>");
      expect(xml).toContain('rel="self"');
      expect(xml).toContain(`${base}/feed.xml`);
    });

    test("feed.xml-shaped output has item fields including guid isPermaLink and categories", () => {
      const xml = buildRssChannel(feedMeta, [postItem]);
      expect(xml).toContain("<item>");
      expect(xml).toContain(`<link>${base}/blog/hello-world</link>`);
      expect(xml).toContain('isPermaLink="true"');
      expect(xml).toContain("<description>A great intro post</description>");
      expect(xml).toContain("<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>");
      expect(xml).toContain("<category>TypeScript</category>");
      expect(xml).toContain("<category>Web</category>");
    });
  });
});
