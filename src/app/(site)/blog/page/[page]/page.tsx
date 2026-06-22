import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { getRepository, hideFuturePosts, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { floatStickyPosts } from "@/lib/content/sticky";
import { PostCard } from "@/app/components/post-card";
import { Pagination } from "@/app/components/pagination";

export async function generateStaticParams() {
  const repo = getRepository();
  const config = await repo.getSiteConfig();
  const pageSize = config.reading.posts_per_page;
  // We need at least one param for cacheComponents validation.
  // Get total pages to enumerate page/2, page/3, ...
  const { totalPages } = await repo.listPosts({ page: 1, pageSize });
  if (totalPages <= 1) {
    // Return a placeholder so cacheComponents validation passes;
    // the page handler below will call notFound() for invalid pages.
    return [{ page: "2" }];
  }
  // page/1 redirects to /blog — only generate page/2 and beyond.
  return Array.from({ length: totalPages - 1 }, (_, i) => ({
    page: String(i + 2),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page } = await params;
  const config = await getLayoutSiteConfig();
  return {
    title: t(config.language, "common.blogPageTitle", { page }),
  };
}

async function PaginatedContent({ page }: { page: number }) {
  await connection();
  const repo = getRepository();
  const config = await repo.getSiteConfig();
  const pageSize = config.reading.posts_per_page;
  const { posts: rawPosts, totalPages } = await repo.listPosts({ page, pageSize });
  const now = new Date().toISOString().slice(0, 10);
  // Float sticky posts to the top of this page slice only.
  // Deep cross-page promotion (a sticky on page 3 floating to page 1) is out of scope.
  const posts = floatStickyPosts(hideFuturePosts(rawPosts, now));

  if (posts.length === 0) {
    notFound();
  }

  return (
    <>
      <ul className="space-y-10" aria-label={t(config.language, "common.blogPosts")}>
        {posts.map((post) => (
          <li key={post.slug}>
            <PostCard post={post} timezone={config.timezone} dateFormat={config.dateFormat} locale={config.language} structure={config.permalinks?.structure ?? "plain"} />
          </li>
        ))}
      </ul>
      <Pagination currentPage={page} totalPages={totalPages} locale={config.language} />
    </>
  );
}

export default async function BlogPaginatedPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page: pageStr } = await params;
  const page = parseInt(pageStr, 10);

  if (page === 1) {
    permanentRedirect("/blog");
  }

  if (isNaN(page) || page < 1) {
    notFound();
  }

  const config = await getLayoutSiteConfig();

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-8">
        {t(config.language, "common.blogPageTitle", { page })}
      </h1>
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <PaginatedContent page={page} />
      </Suspense>
    </div>
  );
}
