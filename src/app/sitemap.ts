import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getRepository, hideFuturePosts } from "@/lib/content";
import { postPath } from "@/lib/content/permalink";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const repo = getRepository();
  const [siteConfig, tags, categories, pagesResult] = await Promise.all([
    repo.getSiteConfig(),
    repo.listTags(),
    repo.listCategories(),
    repo.listPages({ pageSize: Number.MAX_SAFE_INTEGER }),
  ]);
  const pages = pagesResult.pages;

  const base = siteConfig.baseUrl.replace(/\/$/, "");

  // Collect all published post slugs across all pages
  const first = await repo.listPosts({ page: 1 });
  const allPosts = [...first.posts];
  for (let page = 2; page <= first.totalPages; page++) {
    const result = await repo.listPosts({ page });
    allPosts.push(...result.posts);
  }

  const now = new Date().toISOString().slice(0, 10);
  // Drop future-dated posts and anything the author marked noindex (Yoast keeps
  // noindex content out of the sitemap).
  const visiblePosts = hideFuturePosts(allPosts, now).filter((post) => !post.seo?.noindex);

  const postEntries: MetadataRoute.Sitemap = visiblePosts.map((post) => ({
    url: `${base}${postPath(post, siteConfig.permalinks?.structure ?? "plain")}`,
    lastModified: post.date,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const tagEntries: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: `${base}/blog/tags/${tag.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const categoryEntries: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${base}/blog/categories/${cat.segments.join("/")}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const pageEntries: MetadataRoute.Sitemap = pages
    .filter((page) => !page.seo?.noindex)
    .map((page) => ({
      url: `${base}/pages/${page.slug}`,
      lastModified: page.date,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  return [
    {
      url: `${base}/`,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${base}/blog`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}/blog/tags`,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${base}/blog/categories`,
      changeFrequency: "weekly",
      priority: 0.5,
    },
    ...postEntries,
    ...tagEntries,
    ...categoryEntries,
    ...pageEntries,
  ];
}
