import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getRepository, hideFuturePosts, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { PostCard } from "@/app/components/post-card";

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

  const config = await getLayoutSiteConfig();

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
        {t(config.language, "common.postsInCategory", { category })}
      </h1>
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <CategoryContent category={category} />
      </Suspense>
    </div>
  );
}
