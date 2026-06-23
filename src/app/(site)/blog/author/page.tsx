import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getRepository, buildAuthorIndex, hideFuturePosts, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getLayoutSiteConfig();
  return {
    title: t(config.language, "common.authors"),
    robots: { index: true, follow: true },
    alternates: { canonical: "/blog/author" },
  };
}

async function AuthorIndexContent() {
  await connection();
  const repo = getRepository();
  const [{ posts: rawPosts }, config] = await Promise.all([
    repo.listPosts({ pageSize: 9999 }),
    repo.getSiteConfig(),
  ]);
  const loc = config.language ?? "en";
  const now = new Date().toISOString().slice(0, 10);
  const authors = buildAuthorIndex(hideFuturePosts(rawPosts, now));

  if (authors.length === 0) {
    return (
      <p className="text-zinc-500 dark:text-zinc-400">
        {t(loc, "common.noAuthors")}
      </p>
    );
  }

  return (
    <>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        {t(loc, authors.length === 1 ? "common.authorsCountOne" : "common.authorsCount", { count: authors.length })}
      </p>
      <ul className="space-y-4" aria-label={t(loc, "common.authors")}>
        {authors.map((entry) => (
          <li key={entry.slug}>
            <Link
              href={`/blog/author/${entry.slug}`}
              className="text-zinc-900 dark:text-zinc-50 hover:underline"
            >
              {entry.name}
            </Link>
            <span className="ml-2 text-zinc-500 dark:text-zinc-400">
              ({t(loc, entry.count === 1 ? "common.postsCountOne" : "common.postsCount", { count: entry.count })})
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function AuthorIndexPage() {
  const config = await getLayoutSiteConfig();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
        {t(config.language, "common.authors")}
      </h1>
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <AuthorIndexContent />
      </Suspense>
    </div>
  );
}
