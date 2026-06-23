import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getRepository, hideFuturePosts, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";
import { Prose } from "@/app/components/prose";
import { formatSiteDate } from "@/lib/content/format-date";
import { postPath } from "@/lib/content/permalink";

const RECENT_POSTS_COUNT = 5;

// Self-referencing canonical + Open Graph for the home page (Yoast parity).
// Title is intentionally omitted so the root layout's default title ("{site}",
// without the "%s | {site}" template suffix) applies on the home page.
export async function generateMetadata(): Promise<Metadata> {
  const config = await getLayoutSiteConfig();
  return {
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: config.title,
      locale: config.language,
      title: config.title,
      description: config.description,
      url: "/",
    },
  };
}

async function HomeContent() {
  await connection();
  const repo = getRepository();
  const config = await repo.getSiteConfig();
  const { homepage, posts_per_page, static_page } = config.reading;

  if (homepage === "static-page") {
    const page = await repo.getPage(static_page ?? "");
    if (page === null) {
      console.warn(
        `[blog] reading.static_page "${static_page}" not found; falling back to hero-recent homepage.`
      );
      // Fall through to hero-recent below
    } else {
      return (
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
          <article>
            <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-8">
              {page.title}
            </h1>
            <Prose html={page.html} />
          </article>
        </div>
      );
    }
  }

  if (homepage === "latest-posts") {
    const { posts: rawLatest } = await repo.listPosts({ page: 1, pageSize: posts_per_page });
    const now = new Date().toISOString().slice(0, 10);
    const posts = hideFuturePosts(rawLatest, now);
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-6">
            {t(config.language, "common.latestPosts")}
          </h2>
          {posts.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400">
              {t(config.language, "common.noPostsYet")}
            </p>
          ) : (
            <ul
              className="divide-y divide-zinc-200 dark:divide-zinc-800"
              aria-label={t(config.language, "common.recentPosts")}
            >
              {posts.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={postPath(post, config.permalinks?.structure ?? "plain")}
                    className="group flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-6"
                  >
                    <time
                      dateTime={post.date}
                      className="shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-400 sm:w-28"
                    >
                      {formatSiteDate(post.date, { timezone: config.timezone, dateFormat: config.dateFormat, locale: config.language })}
                    </time>
                    <span className="font-medium text-zinc-900 group-hover:underline group-hover:underline-offset-4 dark:text-zinc-50">
                      {post.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  // "hero-recent" (default) — v1-identical behavior
  const { posts: rawHero } = await repo.listPosts({ page: 1 });
  const now = new Date().toISOString().slice(0, 10);
  const posts = hideFuturePosts(rawHero, now);
  const recentPosts = posts.slice(0, RECENT_POSTS_COUNT);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
      <section className="mb-16">
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-6">
          {config.title}
        </h1>
        <p className="text-xl leading-9 text-zinc-600 dark:text-zinc-400 mb-8">
          {config.description}
        </p>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/blog"
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {t(config.language, "common.readTheBlog")}
          </Link>
          <Link
            href="/blog/tags"
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
          >
            {t(config.language, "common.browseByTag")}
          </Link>
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-6">
          {t(config.language, "common.latestPosts")}
        </h2>
        {recentPosts.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">
            {t(config.language, "common.noPostsYet")}
          </p>
        ) : (
          <ul
            className="divide-y divide-zinc-200 dark:divide-zinc-800"
            aria-label={t(config.language, "common.recentPosts")}
          >
            {recentPosts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={postPath(post, config.permalinks?.structure ?? "plain")}
                  className="group flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-6"
                >
                  <time
                    dateTime={post.date}
                    className="shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-400 sm:w-28"
                  >
                    {formatSiteDate(post.date, { timezone: config.timezone, dateFormat: config.dateFormat, locale: config.language })}
                  </time>
                  <span className="font-medium text-zinc-900 group-hover:underline group-hover:underline-offset-4 dark:text-zinc-50">
                    {post.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 animate-pulse"><div className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded w-3/4 mb-6" /></div>}>
      <HomeContent />
    </Suspense>
  );
}
