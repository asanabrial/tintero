import { describe, expect, test } from "bun:test";
import {
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  buildPostBreadcrumbItems,
  buildWebSiteJsonLd,
} from "../../../src/lib/jsonld/index";
import type { Post, SiteConfig } from "../../../src/lib/content/types";

describe("buildBreadcrumbJsonLd", () => {
  test("builds a BreadcrumbList with 1-based positions", () => {
    const ld = buildBreadcrumbJsonLd([
      { name: "Home", url: "https://example.com" },
      { name: "Blog", url: "https://example.com/blog" },
    ]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ position: 1, name: "Home", item: "https://example.com" });
    expect(items[1]).toMatchObject({ position: 2, name: "Blog", item: "https://example.com/blog" });
  });

  test("empty input yields an empty itemListElement", () => {
    const ld = buildBreadcrumbJsonLd([]);
    expect(ld.itemListElement).toEqual([]);
  });
});

describe("buildPostBreadcrumbItems", () => {
  const base = "https://example.com";

  test("Home › Blog › Category › Post when the post has a category", () => {
    const post = { slug: "hello", title: "Hello", categories: ["tech"] } as Post;
    const items = buildPostBreadcrumbItems(post, base);
    expect(items.map((i) => i.name)).toEqual(["Home", "Blog", "tech", "Hello"]);
    expect(items[2].url).toBe("https://example.com/blog/categories/tech");
    expect(items[3].url).toBe("https://example.com/blog/hello");
  });

  test("skips the category level when the post has none (or only Uncategorized)", () => {
    const post = { slug: "hello", title: "Hello", categories: ["Uncategorized"] } as Post;
    const items = buildPostBreadcrumbItems(post, base);
    expect(items.map((i) => i.name)).toEqual(["Home", "Blog", "Hello"]);
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const siteConfig: SiteConfig = {
  title: "My Blog",
  description: "A blog about things",
  baseUrl: "https://example.com/",
  language: "en-US",
  author: { name: "Site Author", email: "author@example.com" },
  nav: [],
  footerNav: [],
  reading: { homepage: "latest-posts", posts_per_page: 10 },
  comments: { enabled: false, moderation: "auto" },
};

const post: Post = {
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
  author: "Jane Doe",
  visibility: "public",
};

const base = "https://example.com";

// ---------------------------------------------------------------------------
// buildArticleJsonLd
// ---------------------------------------------------------------------------

describe("buildArticleJsonLd", () => {
  test("@context is https://schema.org", () => {
    const result = buildArticleJsonLd(post, siteConfig, base);
    expect(result["@context"]).toBe("https://schema.org");
  });

  test("@type is exactly BlogPosting (not Article)", () => {
    const result = buildArticleJsonLd(post, siteConfig, base);
    expect(result["@type"]).toBe("BlogPosting");
  });

  test("headline equals post.title", () => {
    const result = buildArticleJsonLd(post, siteConfig, base);
    expect(result["headline"]).toBe(post.title);
  });

  test("datePublished equals post.date", () => {
    const result = buildArticleJsonLd(post, siteConfig, base);
    expect(result["datePublished"]).toBe(post.date);
  });

  test("author is a Person object with post.author as name", () => {
    const result = buildArticleJsonLd(post, siteConfig, base);
    expect(result["author"]).toEqual({ "@type": "Person", name: post.author });
  });

  test("description equals post.excerpt", () => {
    const result = buildArticleJsonLd(post, siteConfig, base);
    expect(result["description"]).toBe(post.excerpt);
  });

  test("url equals base/blog/slug", () => {
    const result = buildArticleJsonLd(post, siteConfig, base);
    expect(result["url"]).toBe(`${base}/blog/${post.slug}`);
  });

  test("mainEntityOfPage equals base/blog/slug", () => {
    const result = buildArticleJsonLd(post, siteConfig, base);
    expect(result["mainEntityOfPage"]).toBe(`${base}/blog/${post.slug}`);
  });

  test("omits image when the post has no cover/social image", () => {
    const result = buildArticleJsonLd(post, siteConfig, base);
    expect(Object.prototype.hasOwnProperty.call(result, "image")).toBe(false);
  });

  test("includes image (array) when the post has a cover image", () => {
    const result = buildArticleJsonLd(
      { ...post, coverImage: "https://example.com/cover.jpg" },
      siteConfig,
      base
    );
    expect(result["image"]).toEqual(["https://example.com/cover.jpg"]);
  });

  test("a per-post social image overrides the cover image", () => {
    const result = buildArticleJsonLd(
      { ...post, coverImage: "https://example.com/cover.jpg", seo: { ogImage: "https://example.com/social.jpg" } },
      siteConfig,
      base
    );
    expect(result["image"]).toEqual(["https://example.com/social.jpg"]);
  });

  test("dateModified falls back to datePublished", () => {
    const result = buildArticleJsonLd(post, siteConfig, base);
    expect(result["dateModified"]).toBe(post.date);
  });

  test("includes a publisher Organization node from the site title", () => {
    const result = buildArticleJsonLd(post, siteConfig, base);
    expect(result["publisher"]).toEqual({
      "@type": "Organization",
      name: siteConfig.title,
      url: base,
    });
  });

  test("does not throw on a minimal valid Post", () => {
    const minimal: Post = {
      slug: "min",
      title: "Min",
      date: "2024-01-01",
      status: "published",
      tags: [],
      categories: [],
      excerpt: "",
      html: "",
      comments: false,
      sticky: false,
      author: "Author",
      visibility: "public",
    };
    expect(() => buildArticleJsonLd(minimal, siteConfig, base)).not.toThrow();
  });

  test("URL construction: trailing slash on base does not cause double slash", () => {
    const result = buildArticleJsonLd(post, siteConfig, "https://example.com");
    expect(result["url"]).toBe("https://example.com/blog/hello-world");
    expect((result["url"] as string)).not.toContain("//blog");
  });
});

// ---------------------------------------------------------------------------
// buildWebSiteJsonLd
// ---------------------------------------------------------------------------

describe("buildWebSiteJsonLd", () => {
  test("@context is https://schema.org", () => {
    const result = buildWebSiteJsonLd(siteConfig, base);
    expect(result["@context"]).toBe("https://schema.org");
  });

  test("@type is WebSite", () => {
    const result = buildWebSiteJsonLd(siteConfig, base);
    expect(result["@type"]).toBe("WebSite");
  });

  test("name equals siteConfig.title", () => {
    const result = buildWebSiteJsonLd(siteConfig, base);
    expect(result["name"]).toBe(siteConfig.title);
  });

  test("url equals base", () => {
    const result = buildWebSiteJsonLd(siteConfig, base);
    expect(result["url"]).toBe(base);
  });

  test("description equals siteConfig.description", () => {
    const result = buildWebSiteJsonLd(siteConfig, base);
    expect(result["description"]).toBe(siteConfig.description);
  });

  test("does not throw on valid siteConfig", () => {
    expect(() => buildWebSiteJsonLd(siteConfig, base)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// XSS round-trip: JSON.stringify then JSON.parse must round-trip intact
// ---------------------------------------------------------------------------

describe("XSS round-trip safety", () => {
  test("post.title containing </script> round-trips through JSON.stringify + JSON.parse", () => {
    const xssPost: Post = { ...post, title: "Hello </script> World" };
    const result = buildArticleJsonLd(xssPost, siteConfig, base);
    const serialized = JSON.stringify(result);
    // JSON.stringify encodes </script> safely as valid JSON string
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    expect(parsed["headline"]).toBe("Hello </script> World");
  });

  test("post.excerpt containing </script> round-trips intact", () => {
    const xssPost: Post = { ...post, excerpt: "See </script> for details" };
    const result = buildArticleJsonLd(xssPost, siteConfig, base);
    const serialized = JSON.stringify(result);
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    expect(parsed["description"]).toBe("See </script> for details");
  });
});
