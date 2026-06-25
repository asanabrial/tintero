import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getRepository, hideFuturePosts, getLayoutSiteConfig, getLayoutCategories } from "@/lib/content";
import { t } from "@/lib/i18n";
import { PostCard } from "@/app/components/post-card";
import { buildPageGraph, type BreadcrumbItem } from "@/lib/jsonld";
import { renderTermDescription } from "@/lib/content/render-term-description";

export async function generateStaticParams() {
  const repo = getRepository();
  const categories = await repo.listCategories();

  if (categories.length === 0) {
    return [{ slug: ["__placeholder__"] }];
  }

  return categories.map((cat) => ({ slug: cat.segments }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const categoryPath = slug.join("/");
  const config = await getLayoutSiteConfig();
  const lang = config.language ?? "en";
  return {
    title: t(lang, "common.postsInCategory", { category: categoryPath }),
    description: t(lang, "common.allPostsInCategory", { category: categoryPath }),
    alternates: { canonical: `/blog/categories/${categoryPath}` },
  };
}

async function CategoryContent({ category }: { category: string }) {
  await connection();
  const repo = getRepository();
  const [{ posts: rawPosts }, config] = await Promise.all([
    repo.listPosts({ category }),
    repo.getSiteConfig(),
  ]);
  const now = new Date().toISOString().slice(0, 10);
  const posts = hideFuturePosts(rawPosts, now);

  if (posts.length === 0) {
    notFound();
  }

  const loc = config.language ?? "en";
  return (
    <>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        {t(loc, posts.length === 1 ? "common.postsCountOne" : "common.postsCount", { count: posts.length })}
      </p>
      <ul className="space-y-10" aria-label={t(loc, "common.postsInCategoryAria", { category })}>
        {posts.map((post) => (
          <li key={post.slug}>
            <PostCard post={post} timezone={config.timezone} dateFormat={config.dateFormat} locale={config.language} structure={config.permalinks?.structure ?? "plain"} />
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function CategoryArchivePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const category = slug.join("/");

  const [config, categories] = await Promise.all([
    getLayoutSiteConfig(),
    getLayoutCategories(),
  ]);
  const base = config.baseUrl.replace(/\/$/, "");
  const url = `${base}/blog/categories/${category}`;
  const crumbs: BreadcrumbItem[] = [
    { name: "Home", url: base },
    { name: t(config.language, "common.blog"), url: `${base}/blog` },
    { name: t(config.language, "common.categories"), url: `${base}/blog/categories` },
    { name: category, url },
  ];

  const matchedCategory = categories.find(
    (cat) => cat.segments.join("/") === category
  );
  const descriptionHtml = await renderTermDescription(matchedCategory?.description);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildPageGraph({
              base,
              url,
              name: t(config.language, "common.postsInCategory", { category }),
              language: config.language,
              pageType: "CollectionPage",
              breadcrumbItems: crumbs,
            })
          ),
        }}
      />
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
        {t(config.language, "common.postsInCategory", { category })}
      </h1>
      {descriptionHtml && (
        <div
          className="prose prose-zinc dark:prose-invert max-w-none
            prose-headings:font-semibold prose-headings:tracking-tight
            prose-a:[color:var(--color-primary,#18181b)] dark:prose-a:[color:var(--color-primary,#fafafa)]
            prose-a:[text-decoration-color:var(--color-accent,currentColor)] prose-a:underline prose-a:underline-offset-4
            prose-code:rounded prose-code:bg-zinc-100 dark:prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:text-sm
            prose-pre:bg-zinc-950 dark:prose-pre:bg-zinc-900 prose-pre:rounded-lg
            prose-blockquote:border-zinc-300 dark:prose-blockquote:border-zinc-700
            prose-img:rounded-lg mb-6"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      )}
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <CategoryContent category={category} />
      </Suspense>
    </div>
  );
}
