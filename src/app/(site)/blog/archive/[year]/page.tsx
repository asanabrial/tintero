import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  getRepository,
  parseYearParam,
  filterPostsByYear,
  buildArchiveIndex,
  formatPeriodLabel,
  hideFuturePosts,
  getLayoutSiteConfig,
} from "@/lib/content";
import { t } from "@/lib/i18n";
import { PostCard } from "@/app/components/post-card";

export async function generateStaticParams() {
  const { posts } = await getRepository().listPosts({ pageSize: 9999 });
  const periods = buildArchiveIndex(posts);

  if (periods.length === 0) {
    return [{ year: "__placeholder__" }];
  }

  const years = Array.from(new Set(periods.map((p) => p.year)));
  return years.map((y) => ({ year: String(y) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>;
}): Promise<Metadata> {
  const { year } = await params;
  const y = parseYearParam(year);
  const config = await getLayoutSiteConfig();
  const lang = config.language ?? "en";
  if (y === null) {
    return { title: t(lang, "common.archives") };
  }
  return { title: t(lang, "common.archivesFor", { period: formatPeriodLabel(y) }) };
}

async function YearContent({ year }: { year: number }) {
  await connection();
  const repo = getRepository();
  const [{ posts: rawPosts }, config] = await Promise.all([
    repo.listPosts({ pageSize: 9999 }),
    repo.getSiteConfig(),
  ]);
  const now = new Date().toISOString().slice(0, 10);
  const filtered = filterPostsByYear(hideFuturePosts(rawPosts, now), year);

  if (filtered.length === 0) {
    notFound();
  }

  const loc = config.language ?? "en";
  return (
    <>
      <p className="text-zinc-500 dark:text-zinc-400 mb-8">
        {t(loc, filtered.length === 1 ? "common.postsCountOne" : "common.postsCount", { count: filtered.length })}
      </p>
      <ul className="space-y-10" aria-label={t(loc, "common.postsFromYear", { year })}>
        {filtered.map((post) => (
          <li key={post.slug}>
            <PostCard post={post} timezone={config.timezone} dateFormat={config.dateFormat} locale={config.language} structure={config.permalinks?.structure ?? "plain"} />
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function YearArchivePage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year } = await params;
  const y = parseYearParam(year);

  if (y === null) {
    notFound();
  }

  const config = await getLayoutSiteConfig();

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
        {t(config.language, "common.archivesFor", { period: formatPeriodLabel(y) })}
      </h1>
      <Suspense fallback={<div className="animate-pulse h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />}>
        <YearContent year={y} />
      </Suspense>
    </div>
  );
}
