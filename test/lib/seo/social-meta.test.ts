import { describe, expect, test } from "bun:test";
import {
  buildPostSocialMetadata,
  buildPageSocialMetadata,
  twitterHandle,
} from "../../../src/lib/seo/social-meta";
import type { Page, Post, SiteConfig } from "../../../src/lib/content/types";

const siteConfig: SiteConfig = {
  title: "My Blog",
  description: "A blog about things",
  baseUrl: "https://example.com/",
  language: "es",
  author: { name: "Site Author", email: "author@example.com" },
  nav: [],
  footerNav: [],
  social: { twitter: "tintero", github: "tintero" },
  reading: { homepage: "latest-posts", posts_per_page: 10 },
  comments: { enabled: false, moderation: "auto" },
};

const post: Post = {
  slug: "hello-world",
  title: "Hello World",
  date: "2024-03-15",
  status: "published",
  tags: ["web", "seo"],
  categories: ["Tech"],
  excerpt: "A great intro post",
  html: "<p>Full content here</p>",
  comments: false,
  sticky: false,
  author: "Jane Doe",
  visibility: "public",
};

describe("twitterHandle", () => {
  test("returns undefined when no social config", () => {
    expect(twitterHandle(undefined)).toBeUndefined();
    expect(twitterHandle({})).toBeUndefined();
  });

  test("prefixes a bare handle with @", () => {
    expect(twitterHandle({ twitter: "tintero" })).toBe("@tintero");
  });

  test("normalizes a leading @ to a single @", () => {
    expect(twitterHandle({ twitter: "@tintero" })).toBe("@tintero");
  });

  test("extracts the handle from a full profile URL (twitter.com or x.com)", () => {
    expect(twitterHandle({ twitter: "https://twitter.com/tintero" })).toBe("@tintero");
    expect(twitterHandle({ twitter: "https://x.com/tintero/" })).toBe("@tintero");
  });
});

describe("buildPostSocialMetadata", () => {
  test("emits complete Open Graph article fields", () => {
    const { openGraph } = buildPostSocialMetadata(post, siteConfig);
    expect(openGraph).toMatchObject({
      type: "article",
      siteName: "My Blog",
      locale: "es",
      url: "/blog/hello-world",
      publishedTime: "2024-03-15",
      modifiedTime: "2024-03-15",
      authors: ["Jane Doe"],
      section: "Tech",
      tags: ["web", "seo"],
    });
  });

  test("uses the SEO title/description overrides when present", () => {
    const overridden: Post = {
      ...post,
      seo: { title: "Custom Title", metaDescription: "Custom desc" },
    };
    const { openGraph, twitter } = buildPostSocialMetadata(overridden, siteConfig);
    expect(openGraph?.title).toBe("Custom Title");
    expect(openGraph?.description).toBe("Custom desc");
    expect(twitter?.title).toBe("Custom Title");
  });

  test("maps the configured Twitter handle to twitter:site and twitter:creator", () => {
    const { twitter } = buildPostSocialMetadata(post, siteConfig);
    expect(twitter).toMatchObject({ site: "@tintero", creator: "@tintero" });
  });

  test("omits the Twitter handle when not configured", () => {
    const noSocial: SiteConfig = { ...siteConfig, social: undefined };
    const { twitter } = buildPostSocialMetadata(post, noSocial);
    expect(twitter?.site).toBeUndefined();
    expect(twitter?.creator).toBeUndefined();
  });

  test("uses summary_large_image when an image exists, summary otherwise", () => {
    const withImage: Post = { ...post, coverImage: "/uploads/cover.jpg" };
    expect(buildPostSocialMetadata(withImage, siteConfig).twitter).toMatchObject({
      card: "summary_large_image",
    });
    expect(buildPostSocialMetadata(post, siteConfig).twitter).toMatchObject({
      card: "summary",
    });
  });

  test("og:image / twitter:image prefer the explicit ogImage over the cover image", () => {
    const withBoth: Post = {
      ...post,
      coverImage: "/uploads/cover.jpg",
      seo: { ogImage: "/uploads/social.png" },
    };
    const { openGraph, twitter } = buildPostSocialMetadata(withBoth, siteConfig);
    expect(openGraph?.images).toEqual(["/uploads/social.png"]);
    expect(twitter?.images).toEqual(["/uploads/social.png"]);
  });

  test("omits article:section when the post is only Uncategorized", () => {
    const uncategorized: Post = { ...post, categories: ["Uncategorized"] };
    const { openGraph } = buildPostSocialMetadata(uncategorized, siteConfig);
    expect(openGraph && "section" in openGraph ? openGraph.section : undefined).toBeUndefined();
  });
});

describe("buildPageSocialMetadata", () => {
  const page: Page = {
    slug: "about",
    title: "About",
    date: "2024-01-01",
    status: "published",
    excerpt: "About this site",
    html: "<p>hi</p>",
    menuOrder: 0,
  };

  test("emits an og:type website with site name, locale, and url path", () => {
    const { openGraph } = buildPageSocialMetadata(page, siteConfig, "/pages/about");
    expect(openGraph).toMatchObject({
      type: "website",
      siteName: "My Blog",
      locale: "es",
      url: "/pages/about",
      title: "About",
      description: "About this site",
    });
  });

  test("carries the Twitter handle and respects SEO overrides", () => {
    const overridden: Page = {
      ...page,
      seo: { title: "Custom", metaDescription: "Custom desc", ogImage: "/uploads/p.png" },
    };
    const { openGraph, twitter } = buildPageSocialMetadata(overridden, siteConfig, "/pages/about");
    expect(openGraph?.title).toBe("Custom");
    expect(openGraph?.images).toEqual(["/uploads/p.png"]);
    expect(twitter).toMatchObject({ site: "@tintero", creator: "@tintero", card: "summary_large_image" });
  });
});
