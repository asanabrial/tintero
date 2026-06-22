import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getRepository, buildArchiveIndex, formatPeriodLabel, hideFuturePosts, getLayoutSiteConfig } from "@/lib/content";
import { t } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getLayoutSiteConfig();
  return {
    title: t(config.language, "common.archives"),
    robots: { index: true, follow: true },
  };
}

async function ArchiveContent() {
  await connection();
  const repo = getRepository();
  const [{ posts: rawPosts }, config] = await Promise.all([
    repo.listPosts({ pageSize: 9999 }),
    repo.getSiteConfig(),
  ]);
  const loc = config.language ?? "en";
  const now = new Date().toISOString().slice(0, 10);
  const periods = buildArchiveIndex(hideFuturePosts(rawPosts, now));

  if (periods.length === 0) {
    return (
      <p className="text-zinc-500 dark:text-zinc-400">
        {t(loc, "common.noArchivedPosts")}
      </p>
    );
  }

  return (
    <>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        {t(loc, periods.length === 1 ? "common.periodsCountOne" : "common.periodsCount", { count: periods.length })}
      </p>
      <ul className="space-y-4" aria-label={t(loc, "common.archivePeriods")}>
        {periods.map((period) => (
          <li key={`${period.year}-${period.month}`}>
            <Link
              href={`/blog/archive/${period.year}/${String(period.month).padStart(2, "0")}`}
              className="text-zinc-900 dark:text-zinc-50 hover:underline"
            >
              {formatPeriodLabel(period.year, period.month)}
            </Link>
            <span className="ml-2 text-zinc-500 dark:text-zinc-400">
              ({t(loc, period.count === 1 ? "common.postsCountOne" : "common.postsCount", { count: period.count })})
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function ArchiveIndexPage() {
  const config = await getLayoutSiteConfig();
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
        {t(config.language, "common.archives")}
      </h1>
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <ArchiveContent />
      </Suspense>
    </div>
  );
}
