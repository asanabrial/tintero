import { describe, expect, test } from "bun:test";
import {
  toAtomDate,
  cdata,
  buildAtomFeed,
  type AtomEntry,
  type AtomFeedMeta,
} from "../../../src/lib/rss/index";

// ---------------------------------------------------------------------------
// toAtomDate
// ---------------------------------------------------------------------------

describe("toAtomDate", () => {
  test("date-only string YYYY-MM-DD produces T00:00:00Z suffix", () => {
    expect(toAtomDate("2024-03-15")).toBe("2024-03-15T00:00:00Z");
  });

  test("full ISO datetime string passes through as valid RFC-3339", () => {
    const result = toAtomDate("2024-03-15T12:30:00Z");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(result).toContain("2024-03-15");
  });

  test("empty string returns epoch fallback", () => {
    expect(toAtomDate("")).toBe("1970-01-01T00:00:00Z");
  });

  test("invalid date string returns epoch fallback", () => {
    expect(toAtomDate("not-a-date")).toBe("1970-01-01T00:00:00Z");
  });
});

// ---------------------------------------------------------------------------
// cdata
// ---------------------------------------------------------------------------

describe("cdata", () => {
  test("plain HTML is wrapped in CDATA section", () => {
    const result = cdata("<p>Hello</p>");
    expect(result).toBe("<![CDATA[<p>Hello</p>]]>");
  });

  test("HTML containing ]]> does NOT leave raw ]]> inside a single CDATA pair", () => {
    const html = "some text ]]> more text";
    const result = cdata(html);
    // The canonical split replaces ]]> with ]]]]><![CDATA[>
    // The split form should appear rather than the raw terminator sequence
    expect(result).toContain("]]]]><![CDATA[>");
    // The raw sequence ]]> should NOT appear in a way that terminates CDATA early —
    // specifically it should not appear as a standalone "]]>" without being part of the split.
    // After applying the split, the original "]]>" is gone, replaced by the safe form.
    expect(result).not.toContain("some text ]]> more text");
  });

  test("CDATA split applies canonical ]]]]><![CDATA[> replacement", () => {
    const result = cdata("a]]>b");
    expect(result).toBe("<![CDATA[a]]]]><![CDATA[>b]]>");
  });
});

// ---------------------------------------------------------------------------
// buildAtomFeed — feed-level elements
// ---------------------------------------------------------------------------

describe("buildAtomFeed feed-level", () => {
  const meta: AtomFeedMeta = {
    id: "https://example.com/",
    title: "Test Blog",
    updated: "2024-03-15T00:00:00Z",
    link: "https://example.com/",
  };

  test("starts with XML declaration", () => {
    const xml = buildAtomFeed(meta, []);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });

  test("root element has Atom namespace", () => {
    const xml = buildAtomFeed(meta, []);
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
  });

  test("feed contains <id> element", () => {
    const xml = buildAtomFeed(meta, []);
    expect(xml).toContain("<id>https://example.com/</id>");
  });

  test("feed title is escaped", () => {
    const xml = buildAtomFeed({ ...meta, title: "Blog & More <Test>" }, []);
    expect(xml).toContain("<title>Blog &amp; More &lt;Test&gt;</title>");
  });

  test("feed contains <updated> element", () => {
    const xml = buildAtomFeed(meta, []);
    expect(xml).toContain("<updated>2024-03-15T00:00:00Z</updated>");
  });

  test("feed contains <link rel=alternate> to site home", () => {
    const xml = buildAtomFeed(meta, []);
    expect(xml).toContain('rel="alternate"');
    expect(xml).toContain('href="https://example.com/"');
  });

  test("optional selfHref emits <link rel=self> when present", () => {
    const withSelf: AtomFeedMeta = { ...meta, selfHref: "https://example.com/feed.xml/atom" };
    const without = buildAtomFeed(meta, []);
    const withS = buildAtomFeed(withSelf, []);
    expect(without).not.toContain('rel="self"');
    expect(withS).toContain('rel="self"');
    expect(withS).toContain("https://example.com/feed.xml/atom");
    expect(withS).toContain('type="application/atom+xml"');
  });

  test("optional description emits <subtitle> when present", () => {
    const withDesc: AtomFeedMeta = { ...meta, description: "A great blog" };
    const without = buildAtomFeed(meta, []);
    const withD = buildAtomFeed(withDesc, []);
    expect(without).not.toContain("<subtitle>");
    expect(withD).toContain("<subtitle>A great blog</subtitle>");
  });

  test("optional xml:lang emitted when language present", () => {
    const withLang: AtomFeedMeta = { ...meta, language: "en-US" };
    const without = buildAtomFeed(meta, []);
    const withL = buildAtomFeed(withLang, []);
    expect(without).not.toContain("xml:lang");
    expect(withL).toContain('xml:lang="en-US"');
  });

  test("optional feed-level authorName emits <author><name> when present", () => {
    const withAuthor: AtomFeedMeta = { ...meta, authorName: "John Doe" };
    const without = buildAtomFeed(meta, []);
    const withA = buildAtomFeed(withAuthor, []);
    expect(without).not.toContain("<author>");
    expect(withA).toContain("<author>");
    expect(withA).toContain("<name>John Doe</name>");
    expect(withA).not.toContain("<email>");
  });

  test("empty entries → feed-level <updated> is epoch", () => {
    const emptyMeta: AtomFeedMeta = { ...meta, updated: "1970-01-01T00:00:00Z" };
    const xml = buildAtomFeed(emptyMeta, []);
    expect(xml).toContain("<updated>1970-01-01T00:00:00Z</updated>");
    expect(xml).not.toContain("<entry>");
  });
});

// ---------------------------------------------------------------------------
// buildAtomFeed — entry-level elements
// ---------------------------------------------------------------------------

describe("buildAtomFeed entry-level", () => {
  const meta: AtomFeedMeta = {
    id: "https://example.com/",
    title: "Test Blog",
    updated: "2024-03-15T00:00:00Z",
    link: "https://example.com/",
  };

  const entry1: AtomEntry = {
    id: "https://example.com/blog/post-one",
    title: "Post One",
    updated: "2024-03-15T00:00:00Z",
    summary: "First post summary",
    content: "<p>Full content here</p>",
    author: "Jane Doe",
    categories: ["TypeScript", "Web Dev"],
  };

  const entry2: AtomEntry = {
    id: "https://example.com/blog/post-two",
    title: "Post Two",
    updated: "2024-02-01T00:00:00Z",
  };

  test("emits N <entry> elements for N input entries", () => {
    const countEntries = (xml: string) => (xml.match(/<entry>/g) ?? []).length;
    expect(countEntries(buildAtomFeed(meta, []))).toBe(0);
    expect(countEntries(buildAtomFeed(meta, [entry1]))).toBe(1);
    expect(countEntries(buildAtomFeed(meta, [entry1, entry2]))).toBe(2);
  });

  test("entry contains <id>, <title>, <updated>, <link href>", () => {
    const xml = buildAtomFeed(meta, [entry1]);
    expect(xml).toContain(`<id>${entry1.id}</id>`);
    expect(xml).toContain(`<title>Post One</title>`);
    expect(xml).toContain(`<updated>2024-03-15T00:00:00Z</updated>`);
    expect(xml).toContain(`href="${entry1.id}"`);
    expect(xml).toContain('rel="alternate"');
  });

  test("entry <summary> is XML-escaped when present", () => {
    const entryWithEscaping: AtomEntry = {
      ...entry1,
      summary: 'A "great" meal & more <stuff>',
    };
    const xml = buildAtomFeed(meta, [entryWithEscaping]);
    expect(xml).toContain(
      "<summary>A &quot;great&quot; meal &amp; more &lt;stuff&gt;</summary>"
    );
  });

  test("entry <content type=html> is CDATA-wrapped when present", () => {
    const xml = buildAtomFeed(meta, [entry1]);
    expect(xml).toContain('<content type="html">');
    expect(xml).toContain("<![CDATA[<p>Full content here</p>]]>");
  });

  test("entry <author><name> emitted name-only when author present", () => {
    const xml = buildAtomFeed(meta, [entry1]);
    expect(xml).toContain("<author>");
    expect(xml).toContain("<name>Jane Doe</name>");
    expect(xml).not.toContain("<email>");
  });

  test("entry <author> omitted when author absent", () => {
    const xml = buildAtomFeed(meta, [entry2]);
    // entry2 has no author — should have no <author> inside the entry
    // (feed-level meta also has no authorName)
    expect(xml).not.toContain("<author>");
  });

  test("entry <category term> elements emitted and escaped", () => {
    const entryWithCats: AtomEntry = {
      ...entry1,
      categories: ["TypeScript", "Web Dev & More", "<special>"],
    };
    const xml = buildAtomFeed(meta, [entryWithCats]);
    expect(xml).toContain('term="TypeScript"');
    expect(xml).toContain('term="Web Dev &amp; More"');
    expect(xml).toContain('term="&lt;special&gt;"');
  });

  test("absent categories produces no <category> elements in entry", () => {
    const xml = buildAtomFeed(meta, [entry2]);
    expect(xml).not.toContain("<category");
  });

  test("entry title with &, <, \" is escaped", () => {
    const entryEscaped: AtomEntry = {
      ...entry2,
      title: 'Fish & Chips <today> "great"',
    };
    const xml = buildAtomFeed(meta, [entryEscaped]);
    expect(xml).toContain(
      "<title>Fish &amp; Chips &lt;today&gt; &quot;great&quot;</title>"
    );
  });

  test("entry content containing ]]> is CDATA-split correctly", () => {
    const entryWithCdata: AtomEntry = {
      ...entry2,
      content: "<p>some ]]> text</p>",
    };
    const xml = buildAtomFeed(meta, [entryWithCdata]);
    // The split form should appear — the raw ]]> inside content should not terminate CDATA early
    expect(xml).toContain("]]]]><![CDATA[>");
    // The outer content tag should still close properly
    expect(xml).toContain("</content>");
  });
});
