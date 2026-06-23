import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getRepository, hideFuturePosts, getLayoutSiteConfig } from "@/lib/content";
import { floatStickyPosts } from "@/lib/content/sticky";
import { getWidgets } from "@/lib/widgets/repository";
import { t } from "@/lib/i18n";
import { PostCard } from "@/app/components/post-card";
import { Pagination } from "@/app/components/pagination";
import { WidgetArea } from "@/app/components/widget-area";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getLayoutSiteConfig();
  return {
    title: t(config.language, "common.blog"),
    description: t(config.language, "common.allPosts"),
    alternates: { canonical: "/blog" },
  };
}

async function BlogContent() {
  await connection();
  const repo = getRepository();
  const [config, widgetsConfig] = await Promise.all([
    repo.getSiteConfig(),
    getWidgets(),
  ]);
  const pageSize = config.reading.posts_per_page;
  const { posts: rawPosts, totalPages } = await repo.listPosts({
    page: 1,
    pageSize,
  });
  const now = new Date().toISOString().slice(0, 10);
  // Float sticky posts to the top of this page slice only.
  // Deep cross-page promotion (a sticky on page 3 floating to page 1) is out of scope.
  const posts = floatStickyPosts(hideFuturePosts(rawPosts, now));
  const sidebarWidgets = widgetsConfig["blog-sidebar"];

  const mainContent = (
    <>
      {posts.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          {t(config.language, "common.noPostsYet")}
        </p>
      ) : (
        <>
          <ul className="space-y-10" aria-label={t(config.language, "common.blogPosts")}>
            {posts.map((post) => (
              <li key={post.slug}>
                <PostCard post={post} timezone={config.timezone} dateFormat={config.dateFormat} locale={config.language} structure={config.permalinks?.structure ?? "plain"} />
              </li>
            ))}
          </ul>
          <Pagination currentPage={1} totalPages={totalPages} locale={config.language} />
        </>
      )}
    </>
  );

  if (sidebarWidgets.length === 0) {
    return mainContent;
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-12">
      <div>{mainContent}</div>
      <aside>
        <WidgetArea widgets={sidebarWidgets} locale={config.language} />
      </aside>
    </div>
  );
}

export default async function BlogPage() {
  const config = await getLayoutSiteConfig();
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-8">
        {t(config.language, "common.blog")}
      </h1>
      <Suspense
        fallback={
          <div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />
        }
      >
        <BlogContent />
      </Suspense>
    </div>
  );
}
