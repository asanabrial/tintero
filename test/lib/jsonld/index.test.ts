import { describe, expect, test } from "bun:test";
import {
  buildSiteGraph,
  buildPostGraph,
  buildPageGraph,
  buildPostBreadcrumbItems,
  socialProfileUrls,
} from "../../../src/lib/jsonld/index";
import type { Post, SiteConfig } from "../../../src/lib/content/types";

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

// Pull a node out of a graph by its @type.
function node(graph: Record<string, unknown>, type: string): Record<string, unknown> {
  const nodes = graph["@graph"] as Array<Record<string, unknown>>;
  const found = nodes.find((n) => n["@type"] === type);
  if (!found) throw new Error(`no ${type} node in graph`);
  return found;
}

// ---------------------------------------------------------------------------
// buildPostBreadcrumbItems
// ---------------------------------------------------------------------------

describe("buildPostBreadcrumbItems", () => {
  test("Home › Blog › Category › Post when the post has a category", () => {
    const p = { slug: "hello", title: "Hello", categories: ["tech"] } as Post;
    const items = buildPostBreadcrumbItems(p, base);
    expect(items.map((i) => i.name)).toEqual(["Home", "Blog", "tech", "Hello"]);
    expect(items[2].url).toBe("https://example.com/blog/categories/tech");
    expect(items[3].url).toBe("https://example.com/blog/hello");
  });

  test("skips the category level when the post has none (or only Uncategorized)", () => {
    const p = { slug: "hello", title: "Hello", categories: ["Uncategorized"] } as Post;
    const items = buildPostBreadcrumbItems(p, base);
    expect(items.map((i) => i.name)).toEqual(["Home", "Blog", "Hello"]);
  });
});

// ---------------------------------------------------------------------------
// socialProfileUrls
// ---------------------------------------------------------------------------

describe("socialProfileUrls", () => {
  test("returns [] when no social config", () => {
    expect(socialProfileUrls(undefined)).toEqual([]);
    expect(socialProfileUrls({})).toEqual([]);
  });

  test("expands known bare handles to absolute profile URLs", () => {
    expect(socialProfileUrls({ twitter: "tintero", github: "tintero" })).toEqual([
      "https://x.com/tintero",
      "https://github.com/tintero",
    ]);
  });

  test("uses a full URL verbatim and strips a leading @ on handles", () => {
    expect(socialProfileUrls({ twitter: "@me", mastodon: "https://fosstodon.org/@me" })).toEqual([
      "https://x.com/me",
      "https://fosstodon.org/@me",
    ]);
  });

  test("skips unknown networks given only a bare handle", () => {
    expect(socialProfileUrls({ flickr: "someone" })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildSiteGraph
// ---------------------------------------------------------------------------

describe("buildSiteGraph", () => {
  test("@context is https://schema.org and graph holds WebSite + Organization", () => {
    const graph = buildSiteGraph(siteConfig, base);
    expect(graph["@context"]).toBe("https://schema.org");
    const types = (graph["@graph"] as Array<Record<string, unknown>>).map((n) => n["@type"]);
    expect(types).toEqual(["WebSite", "Organization"]);
  });

  test("WebSite carries stable @id, inLanguage, publisher ref, and SearchAction", () => {
    const website = node(buildSiteGraph(siteConfig, base), "WebSite");
    expect(website["@id"]).toBe("https://example.com/#website");
    expect(website["url"]).toBe(base);
    expect(website["inLanguage"]).toBe("en-US");
    expect(website["publisher"]).toEqual({ "@id": "https://example.com/#organization" });
    expect(website["potentialAction"]).toEqual([
      {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://example.com/blog/search?s={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    ]);
  });

  test("Organization has a stable @id and no logo/sameAs when unconfigured", () => {
    const org = node(buildSiteGraph(siteConfig, base), "Organization");
    expect(org["@id"]).toBe("https://example.com/#organization");
    expect(org["name"]).toBe("My Blog");
    expect("logo" in org).toBe(false);
    expect("sameAs" in org).toBe(false);
  });

  test("Organization carries logo (ImageObject) and sameAs when configured", () => {
    const enriched: SiteConfig = {
      ...siteConfig,
      social: { twitter: "tintero" },
      theme: { logo: "/uploads/logo.png" },
    };
    const org = node(buildSiteGraph(enriched, base), "Organization");
    expect(org["logo"]).toEqual({
      "@type": "ImageObject",
      "@id": "https://example.com/#logo",
      url: "https://example.com/uploads/logo.png",
    });
    expect(org["sameAs"]).toEqual(["https://x.com/tintero"]);
  });
});

// ---------------------------------------------------------------------------
// buildPostGraph
// ---------------------------------------------------------------------------

describe("buildPostGraph", () => {
  test("@graph holds WebPage, BreadcrumbList, BlogPosting, Person", () => {
    const types = (buildPostGraph(post, siteConfig, base)["@graph"] as Array<Record<string, unknown>>).map(
      (n) => n["@type"]
    );
    expect(types).toEqual(["WebPage", "BreadcrumbList", "BlogPosting", "Person"]);
  });

  test("nodes are connected by @id (the Yoast graph topology)", () => {
    const graph = buildPostGraph(post, siteConfig, base);
    const pageUrl = "https://example.com/blog/hello-world";
    const webpage = node(graph, "WebPage");
    const article = node(graph, "BlogPosting");
    const person = node(graph, "Person");
    const breadcrumb = node(graph, "BreadcrumbList");

    expect(webpage["@id"]).toBe(`${pageUrl}#webpage`);
    expect(webpage["isPartOf"]).toEqual({ "@id": "https://example.com/#website" });
    expect(webpage["breadcrumb"]).toEqual({ "@id": `${pageUrl}#breadcrumb` });
    expect(breadcrumb["@id"]).toBe(`${pageUrl}#breadcrumb`);

    expect(article["@id"]).toBe(`${pageUrl}#article`);
    expect(article["isPartOf"]).toEqual({ "@id": `${pageUrl}#webpage` });
    expect(article["mainEntityOfPage"]).toEqual({ "@id": `${pageUrl}#webpage` });
    expect(article["publisher"]).toEqual({ "@id": "https://example.com/#organization" });
    expect(article["author"]).toEqual({ "@id": person["@id"] });
  });

  test("BlogPosting carries headline, dates, inLanguage, articleSection, keywords", () => {
    const article = node(buildPostGraph(post, siteConfig, base), "BlogPosting");
    expect(article["headline"]).toBe("Hello World");
    expect(article["datePublished"]).toBe("2024-03-15");
    expect(article["dateModified"]).toBe("2024-03-15");
    expect(article["inLanguage"]).toBe("en-US");
    expect(article["articleSection"]).toBe("tech");
    expect(article["keywords"]).toBe("web");
  });

  test("SEO title/description overrides win for headline and description", () => {
    const overridden: Post = {
      ...post,
      seo: { title: "Custom Title", metaDescription: "Custom desc" },
    };
    const graph = buildPostGraph(overridden, siteConfig, base);
    expect(node(graph, "BlogPosting")["headline"]).toBe("Custom Title");
    expect(node(graph, "WebPage")["name"]).toBe("Custom Title");
  });

  test("omits articleSection when only Uncategorized; omits keywords when no tags", () => {
    const bare: Post = { ...post, categories: ["Uncategorized"], tags: [] };
    const article = node(buildPostGraph(bare, siteConfig, base), "BlogPosting");
    expect("articleSection" in article).toBe(false);
    expect("keywords" in article).toBe(false);
  });

  test("image is an ImageObject with an absolute URL, shared via primaryimage @id", () => {
    const withImage: Post = { ...post, seo: { ogImage: "/uploads/social.png" } };
    const graph = buildPostGraph(withImage, siteConfig, base);
    const pageUrl = "https://example.com/blog/hello-world";
    expect(node(graph, "BlogPosting")["image"]).toEqual({
      "@type": "ImageObject",
      "@id": `${pageUrl}#primaryimage`,
      url: "https://example.com/uploads/social.png",
    });
    expect(node(graph, "WebPage")["primaryImageOfPage"]).toEqual({ "@id": `${pageUrl}#primaryimage` });
  });

  test("omits image nodes when the post has no cover/social image", () => {
    const graph = buildPostGraph(post, siteConfig, base);
    expect("image" in node(graph, "BlogPosting")).toBe(false);
    expect("primaryImageOfPage" in node(graph, "WebPage")).toBe(false);
  });

  test("Person node carries name and the author archive URL", () => {
    const person = node(buildPostGraph(post, siteConfig, base), "Person");
    expect(person["name"]).toBe("Jane Doe");
    expect(person["@id"]).toBe("https://example.com/#/schema/person/jane-doe");
    expect(person["url"]).toBe("https://example.com/blog/author/jane-doe");
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
    expect(() => buildPostGraph(minimal, siteConfig, base)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildPageGraph (static pages + collections)
// ---------------------------------------------------------------------------

describe("buildPageGraph", () => {
  const crumbs = [
    { name: "Home", url: base },
    { name: "About", url: "https://example.com/pages/about" },
  ];

  test("defaults to WebPage and links to the site WebSite + breadcrumb by @id", () => {
    const graph = buildPageGraph({
      base,
      url: "https://example.com/pages/about",
      name: "About",
      description: "About us",
      language: "en-US",
      breadcrumbItems: crumbs,
    });
    const webpage = node(graph, "WebPage");
    expect(webpage["@id"]).toBe("https://example.com/pages/about#webpage");
    expect(webpage["isPartOf"]).toEqual({ "@id": "https://example.com/#website" });
    expect(webpage["breadcrumb"]).toEqual({ "@id": "https://example.com/pages/about#breadcrumb" });
    expect(webpage["inLanguage"]).toBe("en-US");
    expect(node(graph, "BreadcrumbList")["@id"]).toBe("https://example.com/pages/about#breadcrumb");
  });

  test("emits a CollectionPage when pageType is CollectionPage", () => {
    const graph = buildPageGraph({
      base,
      url: "https://example.com/blog/tags/web",
      name: "Tag: web",
      language: "en-US",
      pageType: "CollectionPage",
      breadcrumbItems: crumbs,
    });
    expect(() => node(graph, "CollectionPage")).not.toThrow();
    expect(node(graph, "CollectionPage")["@id"]).toBe("https://example.com/blog/tags/web#webpage");
  });

  test("adds a standalone ImageObject referenced by primaryImageOfPage", () => {
    const graph = buildPageGraph({
      base,
      url: "https://example.com/pages/about",
      name: "About",
      language: "en-US",
      image: "/uploads/hero.png",
      breadcrumbItems: crumbs,
    });
    expect(node(graph, "WebPage")["primaryImageOfPage"]).toEqual({
      "@id": "https://example.com/pages/about#primaryimage",
    });
    expect(node(graph, "ImageObject")).toEqual({
      "@type": "ImageObject",
      "@id": "https://example.com/pages/about#primaryimage",
      url: "https://example.com/uploads/hero.png",
    });
  });

  test("omits image nodes and optional fields when not provided", () => {
    const graph = buildPageGraph({
      base,
      url: "https://example.com/pages/about",
      name: "About",
      language: "en-US",
      breadcrumbItems: crumbs,
    });
    const webpage = node(graph, "WebPage");
    expect("primaryImageOfPage" in webpage).toBe(false);
    expect("datePublished" in webpage).toBe(false);
    expect((graph["@graph"] as unknown[]).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// XSS round-trip: JSON.stringify then JSON.parse must round-trip intact
// ---------------------------------------------------------------------------

describe("XSS round-trip safety", () => {
  test("post.title containing </script> round-trips through JSON.stringify + JSON.parse", () => {
    const xssPost: Post = { ...post, title: "Hello </script> World" };
    const graph = buildPostGraph(xssPost, siteConfig, base);
    const parsed = JSON.parse(JSON.stringify(graph)) as Record<string, unknown>;
    const article = (parsed["@graph"] as Array<Record<string, unknown>>).find((n) => n["@type"] === "BlogPosting");
    expect(article?.["headline"]).toBe("Hello </script> World");
  });
});
