import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getRepository, hideFuturePosts, slugifyAuthor, buildAuthorIndex } from "@/lib/content";
import { postPath } from "@/lib/content/permalink";
import { slugifyTag } from "@/lib/content/tag";
import { slugifyCategory, joinSlug } from "@/lib/content/category";

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
  // Posts that are publicly listed on archive/term pages (published, not future).
  const publishedPosts = hideFuturePosts(allPosts, now);
  // Drop anything the author marked noindex for the post-URL entries (Yoast keeps
  // noindex content out of the sitemap).
  const visiblePosts = publishedPosts.filter((post) => !post.seo?.noindex);

  // Latest post date per term/author — used as the archive page's lastModified
  // (Yoast stamps term/author archives with their most recent post's date).
  const latestByTag = new Map<string, string>();
  const latestByCategory = new Map<string, string>();
  const latestByAuthor = new Map<string, string>();
  const bump = (m: Map<string, string>, key: string, date: string) => {
    const cur = m.get(key);
    if (!cur || date > cur) m.set(key, date);
  };
  for (const post of publishedPosts) {
    for (const tag of post.tags) {
      const slug = slugifyTag(tag);
      if (slug) bump(latestByTag, slug, post.date);
    }
    const seenCatSlugs = new Set<string>();
    for (const cat of post.categories) {
      const segments = slugifyCategory(cat);
      for (let depth = 1; depth <= segments.length; depth++) {
        const slug = joinSlug(segments.slice(0, depth));
        if (slug && !seenCatSlugs.has(slug)) {
          seenCatSlugs.add(slug);
          bump(latestByCategory, slug, post.date);
        }
      }
    }
    const authorSlug = slugifyAuthor(post.author);
    if (authorSlug) bump(latestByAuthor, authorSlug, post.date);
  }

  const postEntries: MetadataRoute.Sitemap = visiblePosts.map((post) => ({
    url: `${base}${postPath(post, siteConfig.permalinks?.structure ?? "plain")}`,
    lastModified: post.date,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const tagEntries: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: `${base}/blog/tags/${tag.slug}`,
    ...(latestByTag.get(tag.slug) ? { lastModified: latestByTag.get(tag.slug) } : {}),
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const categoryEntries: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${base}/blog/categories/${cat.segments.join("/")}`,
    ...(latestByCategory.get(cat.slug) ? { lastModified: latestByCategory.get(cat.slug) } : {}),
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const authorEntries: MetadataRoute.Sitemap = buildAuthorIndex(publishedPosts).map((author) => ({
    url: `${base}/blog/author/${author.slug}`,
    ...(latestByAuthor.get(author.slug) ? { lastModified: latestByAuthor.get(author.slug) } : {}),
    changeFrequency: "weekly",
    priority: 0.4,
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
    {
      url: `${base}/blog/author`,
      changeFrequency: "weekly",
      priority: 0.4,
    },
    ...postEntries,
    ...tagEntries,
    ...categoryEntries,
    ...authorEntries,
    ...pageEntries,
  ];
}
